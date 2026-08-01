import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EcmwfContractError } from '../ecmwf.errors';
import { mapPointToGrid } from '../ecmwf-grid';
import type { EcmwfRangeMember } from '../ecmwf-index';
import { deriveWindDirection, deriveWindSpeed } from '../ecmwf-wind';
import { decodeGribRange, decodeGribRangeCells, readCell } from './grib-decoder.adapter';
import { readMessageProfile, readSectionMap, scanGribMessages } from './grib2-envelope';

/**
 * THE GOLDEN CORPUS — DEC 2026-07-31d conditions 2, 3 and 5.
 *
 * ## What is committed, and why it is bytes rather than numbers
 * `test/fixtures/ecmwf/` holds three real GRIB2 messages downloaded by HTTP `Range` from the
 * 2026-07-30 12z cycle (step 72), the two `.index` files that located them, and
 * `eccodes-reference.json` — every header field and every one of 30 × 3 point values as ecCodes
 * 2.48.0 reads them. Provenance and the exact regeneration commands are in the fixture README.
 *
 * The reference numbers were produced by a DIFFERENT implementation (ECMWF's own C library) than
 * the one under test (`@mattnucc/gribberish`, a Rust/napi binding). That is the entire point: the
 * ruling names "a golden-test difference" as one of the three triggers for migrating to ecCodes,
 * and a difference is only detectable against an independent reference. A fixture of numbers this
 * decoder produced would agree with itself forever.
 *
 * ## Why the file is this size
 * 2.45 MiB of binary fixture, against the SPEC's ~1 MB aspiration (risk R8). The SPEC wrote that
 * target before the measurement found that the wave fields carry a BITMAP and the wind fields do
 * not — so a one-message corpus can only cover one of the two packing shapes, and the uncovered
 * one is the shape where a wrong decoder silently fills the land mask with plausible sea. There
 * is no smaller message in this product: every field is the same 1440 × 721 global grid.
 * `10v` was left out deliberately, because the u/v mix-up it would guard against is caught more
 * strongly and in production by the parameter-identification check below, not only in a test.
 */

const FIXTURE_DIR = join(__dirname, '..', '..', '..', '..', 'test', 'fixtures', 'ecmwf');

interface EccodesMessageReference {
  shortName: string;
  discipline: number;
  parameterCategory: number;
  parameterNumber: number;
  packingType: string;
  dataRepresentationTemplateNumber: number;
  editionNumber: number;
  bitsPerValue: number;
  Ni: number;
  Nj: number;
  numberOfValues: number;
  numberOfMissing: number;
  bitmapPresent: number;
  scanningMode: number;
  latitudeOfFirstGridPointInDegrees: number;
  longitudeOfFirstGridPointInDegrees: number;
  latitudeOfLastGridPointInDegrees: number;
  longitudeOfLastGridPointInDegrees: number;
  iDirectionIncrementInDegrees: number;
  jDirectionIncrementInDegrees: number;
  dataDate: number;
  dataTime: number;
  step: number;
  gridDefinitionTemplateNumber: number;
  productDefinitionTemplateNumber: number;
}

interface EccodesFileReference {
  file: string;
  sourceUrl: string;
  byteRange: { offset: number; length: number };
  sizeBytes: number;
  sha256: string;
  messages: EccodesMessageReference[];
}

interface EccodesPointReference {
  slugTr: string;
  latitude: number;
  longitude: number;
  gridIndex: number;
  gridLatitude: number;
  gridLongitude: number;
  distanceKm: number;
  values: Record<string, number>;
}

interface EccodesReference {
  eccodesVersion: string;
  cycleUtc: string;
  stepHours: number;
  files: EccodesFileReference[];
  points: EccodesPointReference[];
}

const REFERENCE = JSON.parse(
  readFileSync(join(FIXTURE_DIR, 'eccodes-reference.json'), 'utf8'),
) as EccodesReference;

const WIND_FILE = '20260730-12z-oper-10u-step72.grib2';
const WAVE_FILE = '20260730-12z-wave-swh-mwd-step72.grib2';

/** The range plans the committed `.index` files produce — asserted in `ecmwf-index.spec.ts`. */
const WIND_MEMBERS: readonly EcmwfRangeMember[] = [
  { param: '10u', relativeOffset: 0, length: 749_722 },
];
const WAVE_MEMBERS: readonly EcmwfRangeMember[] = [
  { param: 'swh', relativeOffset: 0, length: 847_407 },
  { param: 'mwd', relativeOffset: 847_407, length: 974_731 },
];

/**
 * What the corpus was DOWNLOADED as — taken from the ecCodes reference, not from the messages
 * under test, so the attribution check is fed by the independent record rather than by the bytes
 * it is meant to police.
 */
const CORPUS_ATTRIBUTION = {
  referenceTimeUtc: new Date(REFERENCE.cycleUtc),
  forecastHours: REFERENCE.stepHours,
};

function readFixture(name: string): Uint8Array {
  return new Uint8Array(readFileSync(join(FIXTURE_DIR, name)));
}

function referenceFor(file: string): EccodesFileReference {
  const entry = REFERENCE.files.find((candidate) => candidate.file === file);
  if (entry === undefined) throw new Error(`no ecCodes reference for ${file}`);
  return entry;
}

describe('the golden corpus itself', () => {
  it('is the exact byte range the .index pointed at, unmodified', () => {
    for (const file of REFERENCE.files) {
      const bytes = readFixture(file.file);
      // The fixture IS the `Range` response: its length must equal the range that was requested,
      // so a fixture someone re-cut or re-encoded stops matching its own provenance record.
      expect(bytes.length).toBe(file.sizeBytes);
      expect(bytes.length).toBe(file.byteRange.length);
    }
  });

  it('records ecCodes as the reference implementation', () => {
    expect(REFERENCE.eccodesVersion).toContain('ecCodes');
    expect(REFERENCE.points.length).toBe(30);
    // CCSDS on every message — the packing the whole fail-closed policy is pinned to.
    for (const file of REFERENCE.files) {
      for (const message of file.messages) {
        expect(message.packingType).toBe('grid_ccsds');
        expect(message.dataRepresentationTemplateNumber).toBe(42);
      }
    }
  });
});

describe('scanGribMessages', () => {
  it('finds one message in the wind range and two in the merged wave range', () => {
    expect(scanGribMessages(readFixture(WIND_FILE)).length).toBe(1);

    // The merged range really does decompose at the offset the `.index` promised — which is the
    // only reason we may call the second message `mwd`.
    const wave = scanGribMessages(readFixture(WAVE_FILE));
    expect(wave.map((location) => location.offset)).toEqual([0, 847_407]);
    expect(wave.map((location) => location.length)).toEqual([847_407, 974_731]);
  });

  it('refuses a truncated response instead of decoding what arrived', () => {
    const truncated = readFixture(WIND_FILE).slice(0, 500_000);
    expect(() => scanGribMessages(truncated)).toThrow(EcmwfContractError);
  });

  it('refuses trailing bytes after the last message', () => {
    const bytes = readFixture(WIND_FILE);
    const padded = new Uint8Array(bytes.length + 3);
    padded.set(bytes);
    expect(() => scanGribMessages(padded)).toThrow(EcmwfContractError);
  });

  it('refuses a buffer that does not start with a GRIB message', () => {
    const bytes = readFixture(WIND_FILE);
    const shifted = bytes.slice(1);
    expect(() => scanGribMessages(shifted)).toThrow(EcmwfContractError);
  });
});

describe('readMessageProfile — every header field against ecCodes', () => {
  it.each([WIND_FILE, WAVE_FILE])('reproduces ecCodes for %s', (file: string) => {
    const bytes = readFixture(file);
    const reference = referenceFor(file);
    const locations = scanGribMessages(bytes);

    expect(locations.length).toBe(reference.messages.length);

    locations.forEach((location, index) => {
      const profile = readMessageProfile(bytes, location);
      const expected = reference.messages[index];
      expect(expected).toBeDefined();
      if (expected === undefined) return;

      expect(profile.edition).toBe(expected.editionNumber);
      expect(profile.discipline).toBe(expected.discipline);
      expect(profile.parameterCategory).toBe(expected.parameterCategory);
      expect(profile.parameterNumber).toBe(expected.parameterNumber);
      expect(profile.gridDefinitionTemplate).toBe(expected.gridDefinitionTemplateNumber);
      expect(profile.productDefinitionTemplate).toBe(expected.productDefinitionTemplateNumber);
      expect(profile.dataRepresentationTemplate).toBe(expected.dataRepresentationTemplateNumber);
      expect(profile.bitsPerValue).toBe(expected.bitsPerValue);
      expect(profile.columns).toBe(expected.Ni);
      expect(profile.rows).toBe(expected.Nj);
      expect(profile.numberOfDataPoints).toBe(expected.Ni * expected.Nj);
      expect(profile.numberOfEncodedValues).toBe(expected.numberOfValues);
      expect(profile.bitmapPresent).toBe(expected.bitmapPresent === 1);
      // The bitmap's own account of itself must agree with section 5's, and both must agree with
      // ecCodes. This is the pre-decode crash guard's input.
      if (expected.bitmapPresent === 1) {
        expect(profile.bitmapSetBits).toBe(expected.numberOfValues);
        expect(profile.numberOfDataPoints - (profile.bitmapSetBits ?? 0)).toBe(
          expected.numberOfMissing,
        );
      } else {
        expect(profile.bitmapSetBits).toBeNull();
      }
      expect(profile.scanningMode).toBe(expected.scanningMode);
      expect(profile.firstLatitude).toBe(expected.latitudeOfFirstGridPointInDegrees);
      // The measured surprise, read back out of the message rather than assumed: the longitude
      // axis begins at 180°, so a provider that ever moves it becomes an exception instead of a
      // 180° shift nobody can see.
      expect(profile.firstLongitude).toBe(expected.longitudeOfFirstGridPointInDegrees);
      expect(profile.firstLongitude).toBe(180);
      // Sign-and-magnitude, not two's complement: read the wrong way, −90° comes back as
      // −2 147 393 648 and only the grid's southern edge would ever show it.
      expect(profile.lastLatitude).toBe(expected.latitudeOfLastGridPointInDegrees);
      expect(profile.lastLatitude).toBe(-90);
      expect(profile.lastLongitude).toBe(expected.longitudeOfLastGridPointInDegrees);
      expect(profile.longitudeIncrement).toBe(expected.iDirectionIncrementInDegrees);
      expect(profile.latitudeIncrement).toBe(expected.jDirectionIncrementInDegrees);
      expect(profile.forecastHours).toBe(expected.step);

      const expectedReference = `${String(expected.dataDate)}${String(expected.dataTime).padStart(4, '0')}`;
      const actualReference = profile.referenceTimeUtc
        .toISOString()
        .replace(/[-:T]/g, '')
        .slice(0, 12);
      expect(actualReference).toBe(expectedReference);
      expect(profile.validTimeUtc.getTime()).toBe(
        profile.referenceTimeUtc.getTime() + expected.step * 3_600_000,
      );
    });
  });
});

describe('decodeGribRange — values against ecCodes at all 30 reference points', () => {
  const fields = [
    ...decodeGribRange(readFixture(WIND_FILE), WIND_MEMBERS, CORPUS_ATTRIBUTION),
    ...decodeGribRange(readFixture(WAVE_FILE), WAVE_MEMBERS, CORPUS_ATTRIBUTION),
  ];
  const byParam = new Map<string, (typeof fields)[number]>(
    fields.map((field) => [field.param, field]),
  );

  it('binds each decoded field to the parameter the .index named', () => {
    // Not to the decoder's own names: gribberish reports NOAA abbreviations, so `mwd` arrives as
    // `WWSDIR`. Matching on those would be matching on a different vocabulary than the one the
    // byte range was requested with.
    expect(fields.map((field) => field.param)).toEqual(['10u', 'swh', 'mwd']);
  });

  it.each(REFERENCE.points)(
    'reproduces ecCodes exactly at $slugTr',
    (point: EccodesPointReference) => {
      const mapping = mapPointToGrid(point.latitude, point.longitude);

      // The grid arithmetic first: our index must be the cell ecCodes' own nearest-point search
      // chose, or the values below would agree about the wrong place.
      expect(mapping.index).toBe(point.gridIndex);
      expect(mapping.gridLatitude).toBe(point.gridLatitude);
      expect(mapping.gridLongitude).toBe(point.gridLongitude);
      expect(mapping.distanceKm).toBeCloseTo(point.distanceKm, 1);
      expect(mapping.withinThreshold).toBe(true);

      for (const [param, expected] of Object.entries(point.values)) {
        const field = byParam.get(param);
        expect(field).toBeDefined();
        if (field === undefined) continue;
        // Exact equality, not `toBeCloseTo`. Two independent implementations unpacking the same
        // CCSDS block must produce the same IEEE double; a rounding difference is a decoding
        // difference, and a decoding difference is an ecCodes-migration trigger.
        expect(readCell(field, mapping.index)).toBe(expected);
      }
    },
  );

  it('applies the section 6 bitmap: exactly the masked cells come back null', () => {
    const swh = byParam.get('swh');
    expect(swh).toBeDefined();
    if (swh === undefined) return;

    let missing = 0;
    for (const value of swh.values) {
      if (!Number.isFinite(value)) missing += 1;
    }
    // 372 612 of 1 038 240 — the land mask. A decoder that ignored the bitmap would return zero
    // missing cells and the same array length, with land quietly turned into sea.
    expect(missing).toBe(swh.profile.numberOfDataPoints - swh.profile.numberOfEncodedValues);
    expect(missing).toBe(referenceFor(WAVE_FILE).messages[0]?.numberOfMissing);
  });

  it('reports null for an inland cell instead of borrowing the nearest sea', () => {
    const swh = byParam.get('swh');
    expect(swh).toBeDefined();
    if (swh === undefined) return;

    // Ankara: ~200 km from any sea. The point maps to its own cell and that cell is masked, so
    // the answer is an absence. No neighbour is consulted at any layer.
    const ankara = mapPointToGrid(39.93, 32.86);
    expect(readCell(swh, ankara.index)).toBeNull();
  });

  it('refuses a grid index outside the field', () => {
    const wind = byParam.get('10u');
    expect(wind).toBeDefined();
    if (wind === undefined) return;

    expect(() => readCell(wind, -1)).toThrow(EcmwfContractError);
    expect(() => readCell(wind, 1_038_240)).toThrow(EcmwfContractError);
  });

  it('feeds real decoded values through the wind derivation and the published wave bearing', () => {
    // Layer 3 of the wind regression suite: the derivation exercised on decoded bytes rather than
    // on hand-written components, which is what proves the formula is applied to the numbers that
    // actually come out of the decoder. With only `10u` in the corpus the full bearing cannot be
    // derived, so the claim is the strongest one component supports — a wind with u > 0 blows
    // towards the east and therefore COMES FROM a westerly 270°.
    const wind = byParam.get('10u');
    const waveDirection = byParam.get('mwd');
    expect(wind).toBeDefined();
    expect(waveDirection).toBeDefined();
    if (wind === undefined || waveDirection === undefined) return;

    let compared = 0;
    for (const point of REFERENCE.points) {
      const mapping = mapPointToGrid(point.latitude, point.longitude);
      const u = readCell(wind, mapping.index);
      const bearing = readCell(waveDirection, mapping.index);
      expect(u).not.toBeNull();
      expect(bearing).not.toBeNull();
      if (u === null || bearing === null) continue;

      const derived = deriveWindDirection(u, 0);
      if (u > 0) expect(derived).toBe(270);
      else if (u < 0) expect(derived).toBe(90);
      // u = v = 0 is a dead calm: no bearing exists, so the derivation returns null rather than
      // inventing a northerly. No reference point holds an exactly-zero component in the current
      // corpus, which is precisely why this branch had to be corrected by reading it rather than
      // by watching it fail (review #75).
      else expect(derived).toBeNull();
      expect(deriveWindSpeed(u, 0)).toBeCloseTo(Math.abs(u), 12);

      // `mwd` is published verbatim — ECMWF already states it as "degree true, zero means coming
      // from the north", so the only thing to assert is that it arrives inside the published
      // range and is never rewritten on the way through.
      expect(bearing).toBeGreaterThanOrEqual(0);
      expect(bearing).toBeLessThan(360);
      expect(bearing).toBe(point.values.mwd);
      compared += 1;
    }
    expect(compared).toBe(30);
  });
});

describe('decodeGribRange — fail-closed', () => {
  it('refuses a response whose message count does not match the plan', () => {
    expect(() => decodeGribRange(readFixture(WAVE_FILE), WIND_MEMBERS, CORPUS_ATTRIBUTION)).toThrow(
      EcmwfContractError,
    );
  });

  it('refuses a response whose message offsets do not match the plan', () => {
    // Same bytes, a plan that misdescribes them by one. The offsets ARE the parameter
    // attribution, so a mismatch means we cannot say which field is which.
    const shiftedPlan: EcmwfRangeMember[] = [
      { param: 'swh', relativeOffset: 0, length: 847_407 },
      { param: 'mwd', relativeOffset: 847_408, length: 974_730 },
    ];
    expect(() => decodeGribRange(readFixture(WAVE_FILE), shiftedPlan, CORPUS_ATTRIBUTION)).toThrow(
      EcmwfContractError,
    );
  });

  it('refuses bytes whose GRIB identification contradicts the parameter the .index claimed', () => {
    // The u/v (and swh/mwd) mix-up guard, and the reason `10v` is not in the corpus: the message
    // itself carries discipline/category/number, so a plan that mislabels a field is caught in
    // PRODUCTION, on every message, not only here.
    const mislabelled: EcmwfRangeMember[] = [{ param: '10v', relativeOffset: 0, length: 749_722 }];
    expect(() => decodeGribRange(readFixture(WIND_FILE), mislabelled, CORPUS_ATTRIBUTION)).toThrow(
      /identifies itself as discipline/,
    );
  });

  it('refuses a parameter this leg does not publish', () => {
    const unknown: EcmwfRangeMember[] = [{ param: 'pp1d', relativeOffset: 0, length: 749_722 }];
    expect(() => decodeGribRange(readFixture(WIND_FILE), unknown, CORPUS_ATTRIBUTION)).toThrow(
      EcmwfContractError,
    );
  });

  it('refuses a packing template it was not pinned against', () => {
    // Section 5's template number flipped from 42 (CCSDS) to 0 (simple packing). A decoder might
    // well cope; the point is that a packing change is a DECISION — migrate to ecCodes, or accept
    // the new template on purpose — and decisions do not get made by decoding through them.
    const bytes = readFixture(WIND_FILE);
    const [location] = scanGribMessages(bytes);
    expect(location).toBeDefined();
    if (location === undefined) return;
    const section5 = readSectionMap(bytes, location).get(5);
    expect(section5).toBeDefined();
    if (section5 === undefined) return;

    const mutated = bytes.slice();
    new DataView(mutated.buffer).setUint16(section5.start + 9, 0);

    expect(() => decodeGribRange(mutated, WIND_MEMBERS, CORPUS_ATTRIBUTION)).toThrow(
      /data representation template/,
    );
  });

  it('refuses a grid whose longitude axis has moved', () => {
    // The measured trap, turned into a refusal. Lo1 rewritten from 180° to 0°: without this
    // check every published number would come from 180° away, and nothing else would notice.
    const bytes = readFixture(WIND_FILE);
    const [location] = scanGribMessages(bytes);
    expect(location).toBeDefined();
    if (location === undefined) return;
    const section3 = readSectionMap(bytes, location).get(3);
    expect(section3).toBeDefined();
    if (section3 === undefined) return;

    const mutated = bytes.slice();
    new DataView(mutated.buffer).setUint32(section3.start + 50, 0);

    expect(() => decodeGribRange(mutated, WIND_MEMBERS, CORPUS_ATTRIBUTION)).toThrow(
      /first column is at/,
    );
  });

  it('refuses a message whose section 5 count contradicts its own bitmap — BEFORE decoding', () => {
    // This one is not a nicety, it is a crash guard, and it was found by CI rather than by
    // design. Handing this exact mutation to `@mattnucc/gribberish` makes it index past the end
    // of its value array, and the resulting Rust panic is NOT a JavaScript exception: the
    // released binary aborts the process (exit 134, "fatal runtime error: failed to initiate
    // panic"). No `try/catch` above can see it, so the only place to stop it is before the
    // decoder is entered — which is what counting the bitmap's set bits in the envelope buys.
    //
    // The fact that this test can RUN AT ALL, in-process, is the assertion.
    const bytes = readFixture(WAVE_FILE);
    const [location] = scanGribMessages(bytes);
    expect(location).toBeDefined();
    if (location === undefined) return;
    const section5 = readSectionMap(bytes, location).get(5);
    expect(section5).toBeDefined();
    if (section5 === undefined) return;

    const mutated = bytes.slice();
    const view = new DataView(mutated.buffer);
    view.setUint32(section5.start + 5, view.getUint32(section5.start + 5) - 1);

    expect(() => decodeGribRange(mutated, WAVE_MEMBERS, CORPUS_ATTRIBUTION)).toThrow(
      /contradicts itself/,
    );
  });

  it('refuses a bitmap too short for the grid it claims to mask', () => {
    const bytes = readFixture(WAVE_FILE);
    const [location] = scanGribMessages(bytes);
    expect(location).toBeDefined();
    if (location === undefined) return;
    const section3 = readSectionMap(bytes, location).get(3);
    expect(section3).toBeDefined();
    if (section3 === undefined) return;

    // Claim four times as many grid points as the bitmap can address.
    const mutated = bytes.slice();
    new DataView(mutated.buffer).setUint32(section3.start + 6, 1_038_240 * 4);

    expect(() => decodeGribRange(mutated, WAVE_MEMBERS, CORPUS_ATTRIBUTION)).toThrow(
      EcmwfContractError,
    );
  });

  it('refuses a message from a cycle other than the one that was requested', () => {
    // The stale-copy case, and the ONLY defect in this list that leaves the bytes perfectly
    // valid: a CDN edge serving yesterday's object, or a cycle re-published mid-download, hands
    // back a flawless GRIB message whose sole problem is that it belongs to another valid time.
    // Nothing inside the message can reveal that — only the request can.
    expect(() =>
      decodeGribRange(readFixture(WIND_FILE), WIND_MEMBERS, {
        referenceTimeUtc: new Date('2026-07-30T00:00:00.000Z'),
        forecastHours: REFERENCE.stepHours,
      }),
    ).toThrow(/requested from the 2026-07-30T00:00:00.000Z cycle/);
  });

  it('refuses a message from a step other than the one that was requested', () => {
    expect(() =>
      decodeGribRange(readFixture(WAVE_FILE), WAVE_MEMBERS, {
        referenceTimeUtc: new Date(REFERENCE.cycleUtc),
        forecastHours: 75,
      }),
    ).toThrow(/\+75 h was requested/);
  });
});

describe('decodeGribRangeCells — the ingest entry point, one message in memory at a time', () => {
  const indices = REFERENCE.points.map(
    (point) => mapPointToGrid(point.latitude, point.longitude).index,
  );

  it('reduces each field to the requested cells, byte-identical to the full decode', () => {
    const cells = decodeGribRangeCells(
      readFixture(WAVE_FILE),
      WAVE_MEMBERS,
      CORPUS_ATTRIBUTION,
      indices,
    );

    expect(cells.map((field) => field.param)).toEqual(['swh', 'mwd']);
    for (const field of cells) {
      expect(field.cells.length).toBe(indices.length);
      expect(field.dataRepresentationTemplate).toBe(42);
      expect(field.referenceTimeUtcMs).toBe(CORPUS_ATTRIBUTION.referenceTimeUtc.getTime());
      expect(field.validTimeUtcMs).toBe(
        CORPUS_ATTRIBUTION.referenceTimeUtc.getTime() +
          CORPUS_ATTRIBUTION.forecastHours * 3_600_000,
      );
    }

    // Same cells as the full-field path — the reduction must not move a single value.
    const full = decodeGribRange(readFixture(WAVE_FILE), WAVE_MEMBERS, CORPUS_ATTRIBUTION);
    cells.forEach((field, fieldIndex) => {
      const reference = full[fieldIndex];
      expect(reference).toBeDefined();
      if (reference === undefined) return;
      indices.forEach((gridIndex, pointIndex) => {
        expect(field.cells[pointIndex]).toBe(readCell(reference, gridIndex));
      });
    });
  });

  it('runs the SAME fail-closed gates as the full decode — wrong cycle is refused', () => {
    expect(() =>
      decodeGribRangeCells(
        readFixture(WAVE_FILE),
        WAVE_MEMBERS,
        { referenceTimeUtc: new Date('2026-07-30T00:00:00.000Z'), forecastHours: 72 },
        indices,
      ),
    ).toThrow(EcmwfContractError);
  });

  it('refuses an out-of-grid cell index instead of returning undefined', () => {
    expect(() =>
      decodeGribRangeCells(readFixture(WIND_FILE), WIND_MEMBERS, CORPUS_ATTRIBUTION, [10_000_000]),
    ).toThrow(EcmwfContractError);
  });
});
