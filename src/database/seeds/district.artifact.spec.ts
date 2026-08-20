import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from '@jest/globals';
import {
  ARTIFACT_COVERAGE_FLOOR,
  EXPECTED_ARTIFACT_SHA256,
  assertArtifactMatchesProvinces,
  districtsArtifactPath,
  parseDistrictsArtifact,
  readDistrictsArtifact,
  type DistrictsArtifact,
} from './district.artifact';
import { SEED_PROVINCES } from './province.seed-data';

/**
 * The ilçe lane's fidelity gate — and unlike every other seed lane in this repo, it runs on CI.
 *
 * ## Why this can be a test at all, when the transcription lanes cannot
 * `ENGINEERING.md` §8's transcription lanes are hand-run commands because their sources live
 * outside the repository, under `Owner's Inbox/`. This lane copied its source IN
 * (`data/reference/districts.tuik.json`), so both sides of every check are committed files and the
 * `Test (unit)` job can run the whole thing with no Postgres and no network. That is a strictly
 * stronger position than a hand-run gate, and it is the reason the byte-copy design was chosen.
 *
 * What CI still cannot see is whether the committed copy matches the Inbox source. That comparison
 * is `sha256sum` + `cmp`, recorded in `data/reference/README.md`, and it is the reviewer's.
 *
 * ## Every refusal is asserted by MUTATING a copy, which is what makes the clean run mean something
 * "The artefact passes" proves nothing until the same checks have been watched failing. Each test
 * below takes the real artefact, breaks exactly one thing, and asserts the specific message — so a
 * check that silently stopped looking would turn this file red rather than leaving a green that was
 * never earned. The mutations are made on parsed copies and never written to disk: the control
 * token never enters the artefact it measures.
 *
 * ## What this file deliberately does NOT assert
 * No per-ilçe literal. `CONVENTIONS.md` §2: province coverage uses structural/rule-level
 * invariants, never per-entity fact assertions — the fact-check record is
 * `Owner's Inbox/oturum-lite/ilce-listesi.md` plus the `provenance/datasets.md` row, and a test
 * that retyped `Kadıköy` would be a second, unverified copy of the very data the hash pins.
 */
describe('districts.tuik.json (committed artefact)', () => {
  let raw: string;
  let artifact: DistrictsArtifact;

  beforeAll(async () => {
    raw = readFileSync(districtsArtifactPath(), 'utf8');
    // The REAL code path: resolves the path itself, hashes the bytes, validates the shape and runs
    // every cross-row refusal. If any of them fires on the committed file, this fails here.
    artifact = await readDistrictsArtifact();
  });

  /** Parse a structurally-mutated copy. Returns the thrown error's message. */
  const parseMutated = (mutate: (json: Record<string, unknown>) => void): (() => void) => {
    return () => {
      const json = JSON.parse(raw) as Record<string, unknown>;
      mutate(json);
      parseDistrictsArtifact(JSON.stringify(json));
    };
  };

  type MutableProvince = {
    plateCode: string;
    provinceNameTr: string;
    districtCount: number;
    districts: { nameTr: string; mgmConfirmed: boolean }[];
  };

  const provincesOf = (json: Record<string, unknown>): MutableProvince[] =>
    json['iller'] as MutableProvince[];

  describe('the committed file itself', () => {
    it('reads, hash-checks and validates through the real load path', () => {
      expect(artifact.provinces).toHaveLength(ARTIFACT_COVERAGE_FLOOR.provinces);
      expect(artifact.districtCount).toBe(ARTIFACT_COVERAGE_FLOOR.districts);
    });

    it('carries every plate code from 01 to 81, zero-padded', () => {
      const plates = artifact.provinces.map((province) => province.plateCode).sort();
      const expected = Array.from({ length: ARTIFACT_COVERAGE_FLOOR.provinces }, (_unused, index) =>
        String(index + 1).padStart(2, '0'),
      );
      expect(plates).toEqual(expected);
    });

    it('publishes nothing from MGM — mgmConfirmed does not survive normalisation', () => {
      // MGM's legal notice requires prior permission, so CONVENTIONS §7 is not met and no
      // MGM-derived value may ship. The flag exists in the raw artefact (asserted here so this test
      // cannot pass because the field was quietly renamed) and is absent from what the seed writes.
      expect(raw).toContain('mgmConfirmed');
      expect(JSON.stringify(artifact)).not.toContain('mgmConfirmed');
    });

    it('pins its own SHA-256 constant to the file on disk', async () => {
      // The negative half of the hash gate: passing a DIFFERENT expected hash must fail, or the
      // comparison could be vacuous.
      await expect(readDistrictsArtifact(districtsArtifactPath(), 'f'.repeat(64))).rejects.toThrow(
        /does not match its pinned SHA-256/,
      );
      expect(EXPECTED_ARTIFACT_SHA256).toMatch(/^[0-9a-f]{64}$/);
    });

    it('answers an unreadable path by naming the file, not with an fs stack trace', async () => {
      await expect(readDistrictsArtifact('/nonexistent/districts.tuik.json')).rejects.toThrow(
        /cannot read the committed ilçe artefact at \/nonexistent\/districts\.tuik\.json/,
      );
    });
  });

  describe('the writing-form refusals (DEC 2026-08-20m md.6)', () => {
    it('every committed name is in normal writing, trimmed, and free of U+0307', () => {
      // The rule stated positively over the whole corpus. The three tests below are its positive
      // controls: they prove each clause can fail.
      for (const province of artifact.provinces) {
        for (const name of province.districtNamesTr) {
          expect(name).toBe(name.trim());
          expect(name).not.toContain('\u0307');
          expect(name === name.toLocaleUpperCase('tr')).toBe(false);
        }
      }
    });

    it('refuses a name still in the source ALL-CAPS form', () => {
      expect(
        parseMutated((json) => {
          const province = provincesOf(json)[0];
          const district = province?.districts[0];
          if (district) district.nameTr = district.nameTr.toLocaleUpperCase('tr');
        }),
      ).toThrow(/is still in the source's ALL-CAPS form/);
    });

    it('refuses a name carrying the invisible combining dot above (U+0307)', () => {
      expect(
        parseMutated((json) => {
          // Exactly what `'İ'.toLowerCase()` produces under English casing rules — the defect that
          // would otherwise reach 308 of these 973 names.
          const district = provincesOf(json)[0]?.districts[0];
          if (district) district.nameTr = `i\u0307${district.nameTr.slice(1)}`;
        }),
      ).toThrow(/invisible combining dot above/);
    });

    it('refuses a padded name (the reference product ships " Finike")', () => {
      expect(
        parseMutated((json) => {
          const district = provincesOf(json)[0]?.districts[0];
          if (district) district.nameTr = ` ${district.nameTr}`;
        }),
      ).toThrow(/leading\/trailing whitespace/);
    });

    it('refuses a whitespace character that is not a plain space', () => {
      expect(
        parseMutated((json) => {
          const district = provincesOf(json)[0]?.districts[0];
          // A non-breaking space: invisible, and a different string from the same name typed
          // normally, so the unique constraint would see two ilçe where there is one.
          if (district) district.nameTr = `${district.nameTr}\u00a0x`;
        }),
      ).toThrow(/not a plain space/);
    });
  });

  describe('the cross-row refusals', () => {
    it('refuses an empty artefact rather than reporting "0 checked"', () => {
      expect(
        parseMutated((json) => {
          json['iller'] = [];
        }),
      ).toThrow(/does not match the expected shape/);
    });

    it('refuses a TRUNCATED artefact even though every remaining row is valid', () => {
      expect(
        parseMutated((json) => {
          json['iller'] = provincesOf(json).slice(0, 40);
        }),
      ).toThrow(/coverage floor/);
    });

    it('refuses a province whose declared districtCount disagrees with its own list', () => {
      expect(
        parseMutated((json) => {
          const province = provincesOf(json)[0];
          if (province) province.districts = province.districts.slice(0, -1);
        }),
      ).toThrow(/declares districtCount=\d+ but carries \d+ district/);
    });

    it('refuses a duplicated ilçe name inside one province', () => {
      expect(
        parseMutated((json) => {
          const province = provincesOf(json)[0];
          const first = province?.districts[0];
          const second = province?.districts[1];
          if (first && second) second.nameTr = first.nameTr;
        }),
      ).toThrow(/more than once/);
    });

    it('refuses a missing plate code', () => {
      expect(
        parseMutated((json) => {
          const provinces = provincesOf(json);
          json['iller'] = provinces.filter((province) => province.plateCode !== '34');
        }),
      ).toThrow(/plate code\(s\) absent from the artefact: 34/);
    });

    it("refuses when _meta's own total disagrees with the districts actually carried", () => {
      expect(
        parseMutated((json) => {
          const meta = json['_meta'] as { toplamIlce: number };
          meta.toplamIlce += 1;
        }),
      ).toThrow(/disagrees with the \d+ district\(s\) the artefact actually carries/);
    });

    it('refuses an unknown key rather than silently stripping it', () => {
      expect(
        parseMutated((json) => {
          const district = provincesOf(json)[0]?.districts[0] as
            (Record<string, unknown> & { nameTr: string }) | undefined;
          if (district) district['nufus'] = 1;
        }),
      ).toThrow(/does not match the expected shape/);
    });

    it('refuses text that is not JSON at all, by name', () => {
      expect(() => parseDistrictsArtifact('{')).toThrow(/is not valid JSON/);
    });
  });

  describe('the province join — the mapping-and-plausibility gate (CONVENTIONS §2)', () => {
    it('agrees with the committed province corpus on all 81 provinces', () => {
      // Both facts at once: the il's NAME at each plate code, and its published district_count.
      // This is the check that would see a systematically shifted plate↔ilçe mapping, which every
      // internal refusal above would pass.
      expect(() => {
        assertArtifactMatchesProvinces(artifact, SEED_PROVINCES);
      }).not.toThrow();
      expect(SEED_PROVINCES).toHaveLength(ARTIFACT_COVERAGE_FLOOR.provinces);
    });

    it("refuses when a plate code's il name disagrees with the province row", () => {
      const shifted = SEED_PROVINCES.map((province, index) => ({
        plateCode: province.plateCode,
        // Every il's name moved one plate along: the shape a point-in-polygon mapping bug produces,
        // and the reason the join checks the name and not only the count.
        nameTr: (SEED_PROVINCES[(index + 1) % SEED_PROVINCES.length] ?? province).nameTr,
        districtCount: province.districtCount,
      }));

      expect(() => {
        assertArtifactMatchesProvinces(artifact, shifted);
      }).toThrow(/the plate↔il mapping disagrees/);
    });

    it("refuses when a province's district_count disagrees with the artefact", () => {
      const [first, ...rest] = SEED_PROVINCES;
      if (!first) throw new Error('SEED_PROVINCES is empty');
      const drifted = [{ ...first, districtCount: first.districtCount + 1 }, ...rest];

      expect(() => {
        assertArtifactMatchesProvinces(artifact, drifted);
      }).toThrow(/provinces\.district_count says/);
    });

    it('refuses a province that exists but has no ilçe in the artefact', () => {
      const withExtra = [...SEED_PROVINCES, { plateCode: '82', nameTr: 'Yok', districtCount: 3 }];

      expect(() => {
        assertArtifactMatchesProvinces(artifact, withExtra);
      }).toThrow(/exists as a province but has no ilçe in the artefact/);
    });

    it('refuses an artefact province that has no province row', () => {
      const missingIstanbul = SEED_PROVINCES.filter((province) => province.plateCode !== '34');

      expect(() => {
        assertArtifactMatchesProvinces(artifact, missingIstanbul);
      }).toThrow(/has no province row — run the geography seed first/);
    });
  });
});
