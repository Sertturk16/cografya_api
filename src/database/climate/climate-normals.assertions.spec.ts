import { describe, expect, it } from '@jest/globals';
import {
  CLIMATE_MONTH_COUNT,
  CLIMATE_SOURCE_ERA5_LAND_MONTHLY,
  type ClimateNormals,
} from '../../province/province.types';
import {
  assertClimateNormalsShape,
  ClimateNormalsShapeError,
  CORE_PAIR_FIELDS,
  findUnpublishableReason,
} from './climate-normals.assertions';

/**
 * Accept/reject matrix for the narrowed, source-independent shape gate.
 *
 * Every rejection case is a BREAKING test: it mutates one thing about an otherwise valid document
 * and requires the assertion to notice. That is the point — an assertion nobody has ever seen fail
 * is an assertion nobody knows works (the TA-I1 lesson from the ERA5 fetch PR).
 *
 * Structure only. No test here asserts that any province HAS a particular temperature; the
 * documents below are synthetic and deliberately unremarkable.
 */

function validNormals(): ClimateNormals {
  return {
    source: CLIMATE_SOURCE_ERA5_LAND_MONTHLY,
    sourceUrl: 'https://example.invalid/dataset',
    periodStartYear: 1991,
    periodEndYear: 2020,
    months: Array.from({ length: CLIMATE_MONTH_COUNT }, (_unused, index) => ({
      month: index + 1,
      tempMeanC: 10 + index,
      precipitationMm: 40 + index,
    })),
  };
}

/** Reach a field the narrowed type no longer declares, without `any`. */
function asMutable(normals: ClimateNormals): Record<string, unknown> {
  return normals as unknown as Record<string, unknown>;
}

describe('CORE_PAIR_FIELDS', () => {
  it('is exactly the two all-or-nothing measures', () => {
    // Pinned as a SET so a third measure cannot join the all-or-nothing rule merely by being
    // added to the interface — that has to be a deliberate edit here, with a reviewer.
    expect([...CORE_PAIR_FIELDS].sort()).toEqual(['precipitationMm', 'tempMeanC']);
  });
});

describe('findUnpublishableReason', () => {
  it('returns null for a complete 12-month series', () => {
    expect(findUnpublishableReason(validNormals())).toBeNull();
  });

  it('reports a month count that is not 12', () => {
    const normals = validNormals();
    normals.months = normals.months.slice(0, 11);
    expect(findUnpublishableReason(normals)).toMatch(/11 months, expected 12/);
  });

  it('reports months that are out of order, even when all 12 are present', () => {
    const normals = validNormals();
    const [january, february] = [normals.months[0], normals.months[1]];
    if (january === undefined || february === undefined) throw new Error('fixture');
    normals.months[0] = february;
    normals.months[1] = january;
    expect(findUnpublishableReason(normals)).toMatch(/month slot 1/);
  });

  it('reports a null core value that slipped past the type (the jsonb boundary case)', () => {
    const normals = validNormals();
    const july = normals.months[6];
    if (july === undefined) throw new Error('fixture');
    (july as unknown as Record<string, unknown>).tempMeanC = null;
    expect(findUnpublishableReason(normals)).toMatch(/tempMeanC\[7\]/);
  });

  it('reports NaN as sharply as null — it would poison every average downstream', () => {
    const normals = validNormals();
    const march = normals.months[2];
    if (march === undefined) throw new Error('fixture');
    march.precipitationMm = Number.NaN;
    expect(findUnpublishableReason(normals)).toMatch(/precipitationMm\[3\]/);
  });

  it('reports a non-array months', () => {
    const normals = validNormals();
    asMutable(normals).months = null;
    expect(findUnpublishableReason(normals)).toMatch(/not an array/);
  });
});

describe('assertClimateNormalsShape', () => {
  it('accepts a well-formed series', () => {
    expect(() => {
      assertClimateNormalsShape('34', validNormals());
    }).not.toThrow();
  });

  it('REFUSES an unknown key — it would be served verbatim onto a public page', () => {
    // The load-bearing half of the key check. The stored document is spread onto the response, so
    // a key added out-of-band reaches a live SEO page without passing any DTO or the OpenAPI spec.
    const normals = validNormals();
    asMutable(normals).sunshineHours = 11.2;
    expect(() => {
      assertClimateNormalsShape('34', normals);
    }).toThrow(ClimateNormalsShapeError);
    expect(() => {
      assertClimateNormalsShape('34', normals);
    }).toThrow(/unknown key\(s\) "sunshineHours"/);
  });

  it('REFUSES an unknown key nested inside a single month', () => {
    const normals = validNormals();
    const july = normals.months[6];
    if (july === undefined) throw new Error('fixture');
    (july as unknown as Record<string, unknown>).rainyDays = 2;
    expect(() => {
      assertClimateNormalsShape('34', normals);
    }).toThrow(/months\[6\] carries unknown key\(s\) "rainyDays"/);
  });

  it('REFUSES a missing key — an absent field would serve `undefined`', () => {
    const normals = validNormals();
    delete asMutable(normals).periodEndYear;
    expect(() => {
      assertClimateNormalsShape('34', normals);
    }).toThrow(/missing key\(s\) "periodEndYear"/);
  });

  it('REFUSES an empty source token', () => {
    const normals = validNormals();
    asMutable(normals).source = '';
    expect(() => {
      assertClimateNormalsShape('34', normals);
    }).toThrow(/must name the source/);
  });

  it('does NOT pin the source to a provider — that is the loading line, not this module', () => {
    // The reusability property, asserted rather than asserted-about-in-a-comment: this module
    // stays usable the day a second climate source lands beside ERA5-Land.
    const normals = validNormals();
    asMutable(normals).source = 'some_future_source';
    expect(() => {
      assertClimateNormalsShape('34', normals);
    }).not.toThrow();
  });

  it('REFUSES a sourceUrl that is not https', () => {
    const normals = validNormals();
    normals.sourceUrl = 'ftp://example.invalid/dataset';
    expect(() => {
      assertClimateNormalsShape('34', normals);
    }).toThrow(/not an https URL/);
  });

  it('REFUSES a non-ascending or non-integer period', () => {
    const descending = validNormals();
    descending.periodStartYear = 2020;
    descending.periodEndYear = 1991;
    expect(() => {
      assertClimateNormalsShape('34', descending);
    }).toThrow(/not two ascending integer years/);

    const fractional = validNormals();
    fractional.periodStartYear = 1991.5;
    expect(() => {
      assertClimateNormalsShape('34', fractional);
    }).toThrow(/not two ascending integer years/);
  });

  it('REFUSES an incomplete core pair, via findUnpublishableReason', () => {
    const normals = validNormals();
    const may = normals.months[4];
    if (may === undefined) throw new Error('fixture');
    (may as unknown as Record<string, unknown>).precipitationMm = null;
    expect(() => {
      assertClimateNormalsShape('34', normals);
    }).toThrow(/core pair incomplete/);
  });

  it('REFUSES negative precipitation — impossible at any source, and it poisons the seasonal shares', () => {
    const normals = validNormals();
    const august = normals.months[7];
    if (august === undefined) throw new Error('fixture');
    august.precipitationMm = -1;
    expect(() => {
      assertClimateNormalsShape('34', normals);
    }).toThrow(/negative precipitation/);
  });

  it('REFUSES a month entry that is not an object', () => {
    const normals = validNormals();
    (normals.months as unknown as unknown[])[3] = 'April';
    expect(() => {
      assertClimateNormalsShape('34', normals);
    }).toThrow(/months\[3\] is not an object/);
  });

  it('REFUSES a series that is not an object at all', () => {
    expect(() => {
      assertClimateNormalsShape('34', null as unknown as ClimateNormals);
    }).toThrow(/the series is not an object/);
  });

  it('names the province in every message, so an operator never has to guess which row', () => {
    const normals = validNormals();
    asMutable(normals).extra = 1;
    expect(() => {
      assertClimateNormalsShape('61', normals);
    }).toThrow(/^\[climate-normals\] 61: /);
  });
});
