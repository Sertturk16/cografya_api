import { describe, expect, it } from '@jest/globals';
import { isEndorsementClaim } from '../common/attribution/endorsement-guard';
import {
  buildElevationAttribution,
  ELEVATION_SEA_DEPTH_INCLUDED,
  TERRAIN_TILES_ACCURACY_NOTE_EN,
  TERRAIN_TILES_ACCURACY_NOTE_TR,
  TERRAIN_TILES_DATASET_URL,
  TERRAIN_TILES_EXPLANATION_TR,
  TERRAIN_TILES_LICENCE_URL,
  TERRAIN_TILES_METHOD_NOTE_EN,
  TERRAIN_TILES_METHOD_NOTE_TR,
  TERRAIN_TILES_NAVIGATION_LIMIT_EN,
  TERRAIN_TILES_PROVIDER_NAME,
  TERRAIN_TILES_REQUIRED_NOTICES_EN,
} from './elevation-attribution.constant';
import { ELEVATION_PROFILE_SAMPLE_COUNT } from './elevation.types';
import { TERRAIN_SAMPLE_ZOOM } from './terrain/tile-math';

/**
 * The licence strings are BYTE-PINNED, and that is a deliberate exception to the house rule.
 *
 * "Tests assert structure, never facts" holds because a fact is a claim about the world that a
 * test has no business freezing. These strings are not a claim about the world — they ARE the
 * artifact under test: the exact bytes a licence obliges us to publish. A reworded notice is a
 * breach whether or not it still reads well, so the assertion is the bytes (the marine M5 and AFAD
 * E3 precedent, DEC 2026-08-02g §1).
 *
 * The pins are transcribed from `provenance/integrations.md`'s Terrain Tiles row. A reviewer
 * verifying them compares against that row, not against this file.
 */
describe('terrain tile attribution — the pinned licence text', () => {
  it('publishes exactly the three notices the ledger records as owed, in its order', () => {
    expect(TERRAIN_TILES_REQUIRED_NOTICES_EN).toEqual([
      'Europe terrain data produced using Copernicus data and information funded by the European Union - EU-DEM layers;',
      'Global ETOPO1 terrain data U.S. National Oceanic and Atmospheric Administration',
      'United States 3DEP (formerly NED) and global GMTED2010 and SRTM terrain data courtesy of the U.S. Geological Survey.',
    ]);
  });

  it('does NOT carry the two strings the ledger names as not owed', () => {
    // Both address users of Mapzen's HOSTED SERVICE; we read the AWS bucket. Crediting an
    // institution we owe nothing is the sibling error of implying endorsement, and the ledger
    // recorded these two by name precisely so a well-meant copy does not happen.
    const everyString = JSON.stringify(buildElevationAttribution());
    expect(everyString).not.toContain('© Mapzen, OpenStreetMap, and others');
    expect(everyString).not.toContain('* Mapzen');
  });

  it('pins the provider name and both URLs', () => {
    expect(TERRAIN_TILES_PROVIDER_NAME).toBe('Terrain Tiles (Mapzen, a Linux Foundation project)');
    expect(TERRAIN_TILES_DATASET_URL).toBe('https://registry.opendata.aws/terrain-tiles/');
    expect(TERRAIN_TILES_LICENCE_URL).toBe(
      'https://github.com/tilezen/joerd/blob/master/docs/attribution.md',
    );
  });

  it('pins NOAA’s navigation limit and states that this surface does not trigger it', () => {
    expect(TERRAIN_TILES_NAVIGATION_LIMIT_EN).toBe('Not to be used for navigation');
    // The pairing is the whole discharge of that obligation: the limit binds a surface showing sea
    // depth, and this flag is how a consumer knows whether it is one.
    expect(ELEVATION_SEA_DEPTH_INCLUDED).toBe(false);
  });

  it('composes the method note from the two constants rather than restating them', () => {
    // Not a tautology: it is what makes a change to the sampling zoom or the sample count
    // impossible to ship with a method statement that still describes the old one — which would be
    // a false modification statement, i.e. a licence problem rather than a stale comment.
    expect(TERRAIN_TILES_METHOD_NOTE_TR).toContain(String(TERRAIN_SAMPLE_ZOOM));
    expect(TERRAIN_TILES_METHOD_NOTE_TR).toContain(String(ELEVATION_PROFILE_SAMPLE_COUNT));
    expect(TERRAIN_TILES_METHOD_NOTE_EN).toContain(String(TERRAIN_SAMPLE_ZOOM));
    expect(TERRAIN_TILES_METHOD_NOTE_EN).toContain(String(ELEVATION_PROFILE_SAMPLE_COUNT));
  });

  it('pins the composed method note in both languages', () => {
    expect(TERRAIN_TILES_METHOD_NOTE_TR).toBe(
      'Rakımlar, 12. yakınlaştırma düzeyindeki arazi karolarından hat boyunca 200 noktada ' +
        'okunur. Her nokta, en yakın dört ızgara hücresinin ağırlıklı ortalamasıdır.',
    );
    expect(TERRAIN_TILES_METHOD_NOTE_EN).toBe(
      'Elevations are read from terrain tiles at zoom level 12, at 200 points along the line. ' +
        'Each point is the weighted average of its four nearest grid cells.',
    );
  });

  it('pins the accuracy caveat in both languages', () => {
    expect(TERRAIN_TILES_ACCURACY_NOTE_TR).toBe(
      'Rakımlar ızgara verisinden okunur; sivri zirvelerde gerçek değerden birkaç on metre ' +
        'düşük çıkabilir.',
    );
    expect(TERRAIN_TILES_ACCURACY_NOTE_EN).toBe(
      'Elevations are read from gridded data; at sharp peaks they can read a few tens of metres ' +
        'below the true value.',
    );
  });

  it('pins the provenance sentence, including WHICH families it names', () => {
    // The one served Turkish string that used to carry no byte pin, so its wording could be
    // rewritten with the suite green — and it was wrong: it named 3DEP, a United States programme
    // absent from every measurement over Türkiye (review #124, CF124-I1 + CF124-M2). The list is
    // the ledger's measured Türkiye mix minus ETOPO1, which the z12 pin keeps out.
    expect(TERRAIN_TILES_EXPLANATION_TR).toBe(
      'Rakım verisi, AWS Open Data üzerinden yayımlanan Terrain Tiles arazi karolarından okunur. ' +
        'Karolar EU-DEM, SRTM ve GMTED2010 verilerini birleştirir.',
    );
  });

  it('maps every pinned constant into the field the response actually serves', () => {
    // Every pin above is on a CONSTANT. What the endpoint serves is this OBJECT, and nothing read
    // the mapping between them: `methodNoteTr: …_NOTE_EN`, `datasetUrl` swapped with `licenceUrl`,
    // or `requiredNoticesEn` built from the wrong array all type-check (every field is a `string`)
    // and ship with a fully green CI (review #124, TA124-I2). This is a correspondence between two
    // places in the repo, not a claim about the world.
    expect(buildElevationAttribution()).toEqual({
      providerName: TERRAIN_TILES_PROVIDER_NAME,
      datasetUrl: TERRAIN_TILES_DATASET_URL,
      licenceUrl: TERRAIN_TILES_LICENCE_URL,
      requiredNoticesEn: [...TERRAIN_TILES_REQUIRED_NOTICES_EN],
      navigationLimitEn: TERRAIN_TILES_NAVIGATION_LIMIT_EN,
      seaDepthIncluded: ELEVATION_SEA_DEPTH_INCLUDED,
      methodNoteTr: TERRAIN_TILES_METHOD_NOTE_TR,
      methodNoteEn: TERRAIN_TILES_METHOD_NOTE_EN,
      accuracyNoteTr: TERRAIN_TILES_ACCURACY_NOTE_TR,
      accuracyNoteEn: TERRAIN_TILES_ACCURACY_NOTE_EN,
      explanationTr: TERRAIN_TILES_EXPLANATION_TR,
    });
  });
});

describe('terrain tile attribution — the house rules every served string is under', () => {
  const served = (): string[] => {
    const attribution = buildElevationAttribution();
    return [
      attribution.providerName,
      attribution.datasetUrl,
      attribution.licenceUrl,
      ...attribution.requiredNoticesEn,
      attribution.navigationLimitEn,
      attribution.methodNoteTr,
      attribution.methodNoteEn,
      attribution.accuracyNoteTr,
      attribution.accuracyNoteEn,
      attribution.explanationTr,
    ];
  };

  it('carries no endorsement claim in any served string', () => {
    expect(served().filter((value) => isEndorsementClaim(value))).toEqual([]);
  });

  it('and the guard it just passed is actually able to fire', () => {
    // The positive control. Without it, "no findings" and "the guard was never wired" are the
    // same output — and this leg credits three institutions, which is exactly the shape
    // `CONVENTIONS.md` §7's ban is about.
    expect(isEndorsementClaim('resmî Copernicus verisi')).toBe(true);
    expect(isEndorsementClaim('USGS onaylı yükselti aracı')).toBe(true);
  });

  it('keeps the Turkish strings off the forbidden third word for elevation', () => {
    // `GLOSSARY.md` §4.3: `rakım` is a point's height and `yükselti profili` names the section
    // along a line; a third word (`yükseklik`) appears in neither a published field name nor
    // reader-facing text. SPEC §8.3 pre-dates that row and proposed `Yükseklikler`, so this
    // assertion is what keeps the older wording from drifting back in.
    for (const value of [
      TERRAIN_TILES_METHOD_NOTE_TR,
      TERRAIN_TILES_ACCURACY_NOTE_TR,
      TERRAIN_TILES_EXPLANATION_TR,
    ]) {
      expect(value.toLowerCase()).not.toContain('yükseklik');
    }
  });

  it('and that sweep can see the word it is looking for', () => {
    // Positive control for the assertion above, against a string shaped exactly like the one the
    // SPEC proposed — so the check is known to fire on the real historical wording.
    expect('Yükseklikler ızgara verisinden okunur'.toLowerCase()).toContain('yükseklik');
  });

  it('holds each Turkish string to the §16 fact and semicolon ceilings', () => {
    for (const value of [
      TERRAIN_TILES_METHOD_NOTE_TR,
      TERRAIN_TILES_ACCURACY_NOTE_TR,
      TERRAIN_TILES_EXPLANATION_TR,
    ]) {
      // At most one semicolon per paragraph, and no em-dash at all (§17's ceiling is per page, so
      // zero here is the safe reading for a string that can appear beside others).
      expect((value.match(/;/g) ?? []).length).toBeLessThanOrEqual(1);
      expect(value).not.toContain('—');
    }
  });

  it('builds a FRESH object every call, so a consumer cannot mutate the next response', () => {
    const first = buildElevationAttribution();
    const second = buildElevationAttribution();
    expect(first).not.toBe(second);
    expect(first.requiredNoticesEn).not.toBe(second.requiredNoticesEn);
    expect(first).toEqual(second);
  });

  it('populates every field — there is no branch on which a notice is empty', () => {
    for (const value of served()) {
      expect(value.length).toBeGreaterThan(0);
    }
  });
});
