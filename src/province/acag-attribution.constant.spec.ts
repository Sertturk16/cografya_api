import { describe, expect, it } from '@jest/globals';
import { isEndorsementClaim } from '../common/attribution/endorsement-guard';
import {
  ACAG_DATASET_URL,
  ACAG_DATASET_VERSION,
  ACAG_LICENCE_NAME,
  ACAG_LICENCE_URL,
  ACAG_METHOD_NOTICE_TEXT,
  ACAG_NOTICE_KEYS,
  ACAG_PROVIDER_NAME,
  ACAG_REFERENCE_CITATION,
  ACAG_REFERENCE_URL,
  ACAG_WORK_TITLE,
  buildAcagAttribution,
} from './acag-attribution.constant';

/**
 * ## Why this file pins STRINGS when the house rule is "tests assert structure, never facts"
 * These are the recorded exception (the CAMS/M5 precedent). A licence string is not a claim about
 * the world that could be re-verified from a source — it IS the artifact under test, and one
 * changed letter breaks a licence condition. The exception is named here so it can never be
 * cargo-culted into a data test.
 *
 * Their provenance is `provenance/datasets.md`, "ATIF ÖĞELERİ — V6.GL.03" and "ZORUNLU BEYAN (a)",
 * both established first-hand by NOVA on 2026-08-19 against the provider's own page.
 */

describe('ACAG attribution constants — byte pins', () => {
  it('pins the institution name', () => {
    expect(ACAG_PROVIDER_NAME).toBe(
      'Atmospheric Composition Analysis Group, Washington University in St. Louis',
    );
  });

  it('pins the work title exactly as the licence sentence writes it', () => {
    expect(ACAG_WORK_TITLE).toBe('SatPM₂.₅ V6.GL.03');
  });

  /**
   * The subscripts are part of the quote and a reviewer cannot see them by eye, so the code points
   * are asserted rather than the rendered glyphs. Flattening to ASCII "PM2.5" would make the
   * quotation no longer verbatim — the ledger flags this explicitly, and the V6.GL.02.04-era
   * string (which DID use ASCII) is exactly how such a flattening would look if it crept back in.
   */
  it('pins the SUBSCRIPT code points in the work title (U+2082, U+2085)', () => {
    expect(ACAG_WORK_TITLE).toContain('₂');
    expect(ACAG_WORK_TITLE).toContain('₅');
    expect(ACAG_WORK_TITLE).not.toContain('PM2.5');
    expect([...ACAG_WORK_TITLE].map((character) => character.codePointAt(0))).toContain(0x2082);
  });

  it('pins the subscript code points in the provider caveat too', () => {
    expect(ACAG_METHOD_NOTICE_TEXT).toContain('PM₂.₅ gradients');
    expect(ACAG_METHOD_NOTICE_TEXT).not.toContain('PM2.5');
  });

  it('pins the version, dataset URL and licence pair', () => {
    expect(ACAG_DATASET_VERSION).toBe('V6.GL.03');
    expect(ACAG_DATASET_URL).toBe('https://www.satpm.org/v6-gl-03');
    expect(ACAG_LICENCE_NAME).toBe('Creative Commons Attribution 4.0 International (CC BY 4.0)');
    // The chooser query string is part of the href the provider actually links.
    expect(ACAG_LICENCE_URL).toBe('https://creativecommons.org/licenses/by/4.0/?ref=chooser-v1');
  });

  it('pins the reference citation in the PROVIDER format (full stops, unquoted title)', () => {
    expect(ACAG_REFERENCE_CITATION).toBe(
      'Shen, S. Li, C. van Donkelaar, A. Jacobs, N. Wang, C. Martin, R. V.: Enhancing Global ' +
        'Estimation of Fine Particulate Matter Concentrations by Including Geophysical a Priori ' +
        'Information in Deep Learning. (2024) ACS ES&T Air. DOI: 10.1021/acsestair.3c00054',
    );
    // The older ledger segment used commas between authors and quoted the title; that format is
    // NOT what this version's page publishes.
    expect(ACAG_REFERENCE_CITATION).not.toContain('"Enhancing');
    expect(ACAG_REFERENCE_URL).toBe('https://pubs.acs.org/doi/full/10.1021/acsestair.3c00054');
  });

  it('pins the provider caveat verbatim, in the V6.GL.03 wording', () => {
    expect(ACAG_METHOD_NOTICE_TEXT).toContain(
      'due to the influence of information sources at coarser resolution.',
    );
    expect(ACAG_METHOD_NOTICE_TEXT).toContain(
      'Annual and coarse-resolution averages correspond to a simple mean of within-grid values.',
    );
    // The V6.GL.02.04-era wording, which must never be published beside V6.GL.03 numbers.
    expect(ACAG_METHOD_NOTICE_TEXT).not.toContain('due to influence by information sources');
  });
});

describe('buildAcagAttribution', () => {
  it('publishes every element the licence needs, each wired to its OWN constant', () => {
    // Every field→constant identity is pinned (review CODE123-M9). Four of them were previously
    // unasserted, so a wiring swap — `datasetUrl: ACAG_LICENCE_URL`, say — passed the whole file
    // even though both constants were individually byte-pinned.
    const attribution = buildAcagAttribution();
    expect(attribution.providerName).toBe(ACAG_PROVIDER_NAME);
    expect(attribution.workTitle).toBe(ACAG_WORK_TITLE);
    expect(attribution.datasetVersion).toBe(ACAG_DATASET_VERSION);
    expect(attribution.datasetUrl).toBe(ACAG_DATASET_URL);
    expect(attribution.licenceName).toBe(ACAG_LICENCE_NAME);
    expect(attribution.licenceUrl).toBe(ACAG_LICENCE_URL);
    expect(attribution.referenceCitation).toBe(ACAG_REFERENCE_CITATION);
    expect(attribution.referenceUrl).toBe(ACAG_REFERENCE_URL);
    expect(attribution.methodNoticeText).toBe(ACAG_METHOD_NOTICE_TEXT);
    expect(attribution.noticeKeys).toEqual([...ACAG_NOTICE_KEYS]);
  });

  it('hands out a COPY of the notice keys, never the shared array', () => {
    // Asserted as a NEGATIVE (review TEST123-M2). Comparing against `[...ACAG_NOTICE_KEYS]` after
    // the push was circular: if the builder returned the shared array, the push would have
    // mutated the constant too and BOTH sides would have contained 'mutated'.
    const expectedBefore = [...ACAG_NOTICE_KEYS];
    const first = buildAcagAttribution();
    first.noticeKeys.push('mutated');
    expect(buildAcagAttribution().noticeKeys).not.toContain('mutated');
    expect(ACAG_NOTICE_KEYS).not.toContain('mutated');
    expect(buildAcagAttribution().noticeKeys).toEqual(expectedBefore);
  });

  it('ships i18n KEYS, not authored text (the api never publishes prose)', () => {
    for (const key of buildAcagAttribution().noticeKeys) {
      expect(key).toMatch(/^airPollution\.notice\.[A-Za-z]+$/);
      expect(key).not.toMatch(/\s/);
    }
  });

  /**
   * `CONVENTIONS.md` §7: naming a source is required, implying the source endorses us is
   * forbidden. The shared denylist catches the phrasings we have been warned about — which is not
   * the same as proving non-endorsement, and a novel phrasing still needs a human in the diff.
   */
  it('carries no endorsement claim in any served string', () => {
    const attribution = buildAcagAttribution();
    const served = [
      attribution.providerName,
      attribution.workTitle,
      attribution.licenceName,
      attribution.referenceCitation,
      attribution.methodNoticeText,
    ];
    for (const value of served) {
      expect(isEndorsementClaim(value)).toBe(false);
    }
  });

  it('proves the endorsement guard actually fires (positive control)', () => {
    // Without this, "no endorsement found" would be indistinguishable from "the guard is broken".
    expect(isEndorsementClaim('Bu platform ACAG onaylıdır')).toBe(true);
  });
});
