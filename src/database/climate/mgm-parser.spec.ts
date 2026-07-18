import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CLIMATE_MONTH_COUNT,
  CLIMATE_SOURCE_MGM_GENERAL,
  type ClimateNormals,
} from '../../province/province.types';
import { assertClimateNormalsShape } from './climate-assertions';
import {
  RECORD_COLUMNS,
  collectImpossibleValueAnomalies,
  formatLikeRawKaNumber,
  isAbsentRecordValueCell,
  parseKaNumber,
  parseMgmGeneralStatisticsPage,
  parseMgmProvinceKeys,
  parseRecordValue,
  type MgmParseContext,
} from './mgm-parser';

/**
 * Parser tests run against COMMITTED FIXTURES — real MGM `k=A` table fragments captured on
 * 2026-07-18 — never against the live site. A test suite that reaches the network is not a
 * test suite; it is an outage waiting to fail a build.
 *
 * Per CONVENTIONS §2 these are STRUCTURAL/INVARIANT tests only. Nothing here asserts a
 * per-province fact ("Mersin's January mean is 10.4 °C") — the fact record is
 * `data-provenance.md`, and hardcoding facts into tests makes them go stale the moment
 * content is legitimately revised. What IS asserted is that the parser produces 12 months,
 * refuses malformed input, and never invents or drops a value.
 *
 * Two fixtures rather than one, deliberately: a single fixture cannot distinguish "parsed
 * from the page" from "hardcoded", which is precisely what trap T2 (the per-province
 * measurement period) requires us to prove.
 */

const FIXTURE_DIR = join(__dirname, '..', '..', '..', 'test', 'fixtures', 'mgm');

function loadFixture(name: string): string {
  return readFileSync(join(FIXTURE_DIR, name), 'utf8');
}

const FIXTURES = [
  { file: 'k-a-icel.tables.html', mgmKey: 'ICEL' },
  { file: 'k-a-ardahan.tables.html', mgmKey: 'ARDAHAN' },
] as const;

function contextFor(mgmKey: string): MgmParseContext {
  return {
    mgmKey,
    sourceUrl: `https://www.mgm.gov.tr/veridegerlendirme/il-ve-ilceler-istatistik.aspx?k=A&m=${mgmKey}`,
  };
}

describe('parseMgmGeneralStatisticsPage — happy path', () => {
  it.each(FIXTURES)('parses $mgmKey into exactly 12 ordered months', ({ file, mgmKey }) => {
    const { normals } = parseMgmGeneralStatisticsPage(loadFixture(file), contextFor(mgmKey));

    expect(normals.months).toHaveLength(CLIMATE_MONTH_COUNT);
    expect(normals.months.map((month) => month.month)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);
    expect(normals.source).toBe(CLIMATE_SOURCE_MGM_GENERAL);
    expect(normals.sourceUrl).toContain(`m=${mgmKey}`);
  });

  it.each(FIXTURES)('$mgmKey: fills the core pair for all 12 months', ({ file, mgmKey }) => {
    const { normals } = parseMgmGeneralStatisticsPage(loadFixture(file), contextFor(mgmKey));

    for (const month of normals.months) {
      expect(typeof month.tempMeanC).toBe('number');
      expect(typeof month.precipitationMm).toBe('number');
    }
  });

  it.each(FIXTURES)(
    '$mgmKey: reads the measurement period FROM THE PAGE (trap T2)',
    ({ file, mgmKey }) => {
      const html = loadFixture(file);
      const { normals } = parseMgmGeneralStatisticsPage(html, contextFor(mgmKey));

      // Independently re-extract the period from the fixture's own text, so this asserts
      // "parsed from this page" rather than any fixed year. A hardcoded "1929-2025" — which
      // is only Mersin's period — would fail for the other fixture.
      const stated = /Ölçüm Periyodu\s*\(\s*(\d{4})\s*-\s*(\d{4})\s*\)/.exec(html);
      expect(stated).not.toBeNull();
      expect(normals.periodStartYear).toBe(Number(stated?.[1]));
      expect(normals.periodEndYear).toBe(Number(stated?.[2]));
      expect(normals.periodStartYear).toBeLessThan(normals.periodEndYear);
    },
  );

  it.each(FIXTURES)(
    '$mgmKey: keeps decimal precision — values are not truncated (trap T3)',
    ({ file, mgmKey }) => {
      const { normals } = parseMgmGeneralStatisticsPage(loadFixture(file), contextFor(mgmKey));

      // If `parseFloat("10,4")` were used anywhere, EVERY value would be a whole number.
      // Asserting "at least one fractional value survived" catches that without pinning any
      // specific reading.
      const fractional = normals.months.filter(
        (month) => month.tempMeanC !== null && !Number.isInteger(month.tempMeanC),
      );
      expect(fractional.length).toBeGreaterThan(0);
    },
  );

  it.each(FIXTURES)(
    '$mgmKey: captures the occurrence date of each monthly extreme reading',
    ({ file, mgmKey }) => {
      // MGM publishes these in a `title` attribute. "41,5 °C" is a number; "41,5 °C
      // (September 2020)" is an event — and it is information the competitor does not show.
      const { normals } = parseMgmGeneralStatisticsPage(loadFixture(file), contextFor(mgmKey));

      const withMaxDate = normals.months.filter((month) => month.tempRecordMaxDate !== null);
      const withMinDate = normals.months.filter((month) => month.tempRecordMinDate !== null);
      expect(withMaxDate.length).toBeGreaterThan(0);
      expect(withMinDate.length).toBeGreaterThan(0);

      for (const month of normals.months) {
        for (const date of [month.tempRecordMaxDate, month.tempRecordMinDate]) {
          if (date !== null) expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        }
        // A date may never stand without the reading it dates.
        if (month.tempRecordMaxDate !== null) expect(month.tempRecordMaxC).not.toBeNull();
        if (month.tempRecordMinDate !== null) expect(month.tempRecordMinC).not.toBeNull();
      }
    },
  );

  it.each(FIXTURES)(
    '$mgmKey: attaches occurrence dates ONLY to the extreme rows, never to averages',
    ({ file, mgmKey }) => {
      // Averages have no single occurrence date; inventing one would be fabricated data.
      const { normals } = parseMgmGeneralStatisticsPage(loadFixture(file), contextFor(mgmKey));

      const rawTitlesOfAverageRows = parseMgmGeneralStatisticsPage(
        loadFixture(file),
        contextFor(mgmKey),
      ).raw.metricRows.filter((row) => !row.label.startsWith('En '));
      expect(rawTitlesOfAverageRows.length).toBeGreaterThan(0);
      for (const row of rawTitlesOfAverageRows) {
        expect(row.rawMonthlyTitles.every((title) => title === '')).toBe(true);
      }
      expect(normals.months.length).toBe(CLIMATE_MONTH_COUNT);
    },
  );

  it.each(FIXTURES)('$mgmKey: keeps exactly 12 raw cells per parsed row', ({ file, mgmKey }) => {
    const { raw } = parseMgmGeneralStatisticsPage(loadFixture(file), contextFor(mgmKey));

    expect(raw.metricRows.length).toBeGreaterThan(0);
    for (const row of raw.metricRows) {
      expect(row.rawMonthlyCells).toHaveLength(CLIMATE_MONTH_COUNT);
    }
  });

  it.each(FIXTURES)(
    '$mgmKey: normalises record dates to ISO and keeps units out of the value',
    ({ file, mgmKey }) => {
      const { normals } = parseMgmGeneralStatisticsPage(loadFixture(file), contextFor(mgmKey));

      const records = Object.values(normals.records).filter((record) => record !== null);
      expect(records.length).toBeGreaterThan(0);
      for (const record of records) {
        expect(record.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(typeof record.value).toBe('number');
      }
    },
  );
});

describe('parseMgmGeneralStatisticsPage — refuses malformed input', () => {
  const html = loadFixture('k-a-icel.tables.html');
  const context = contextFor('ICEL');

  it('throws when a data row carries an unrecognised label', () => {
    const mutated = html.replace('Ortalama Sıcaklık (°C)', 'Ortalama Bağıl Nem (%)');

    // The alternative — skipping the row — is the silent-no-op failure this repo has been
    // bitten by before: the import would "succeed" while quietly dropping a measure.
    expect(() => parseMgmGeneralStatisticsPage(mutated, context)).toThrow(/unrecognised label/);
  });

  it('throws when the empty "Yıllık" cell becomes populated (trap T1)', () => {
    const mutated = html.replace(/<td id="d_top">\s*<\/td>/, '<td id="d_top">18,7</td>');
    expect(mutated).not.toBe(html);

    expect(() => parseMgmGeneralStatisticsPage(mutated, context)).toThrow(/"Yıllık" cell/);
  });

  it('throws when a data row loses a cell (column shift, risk #2)', () => {
    // Drop the January cell of the first data row: the row now has 13 cells, so every
    // remaining month would silently shift one column left.
    const mutated = html.replace(/<td id="d01">[^<]*<\/td>/, '');
    expect(mutated).not.toBe(html);

    expect(() => parseMgmGeneralStatisticsPage(mutated, context)).toThrow(
      /cells; only 1 \(footnote\)/,
    );
  });

  it('throws on a dot decimal separator instead of guessing (trap T3)', () => {
    // A dot on the k=A tab is ambiguous — it could be a thousands separator. Refusing is
    // the point: `parseFloat` would silently pick an interpretation.
    const mutated = html.replace(/(<td id="d01">\d+),(\d+<\/td>)/, '$1.$2');
    expect(mutated).not.toBe(html);

    expect(() => parseMgmGeneralStatisticsPage(mutated, context)).toThrow(/k=A number grammar/);
  });

  it('throws when the month headers are out of order', () => {
    const mutated = html.replace('>Ocak<', '>Ekim<');
    expect(() => parseMgmGeneralStatisticsPage(mutated, context)).toThrow(/month header 1/);
  });

  it('throws when the page is for a different province than requested', () => {
    expect(() => parseMgmGeneralStatisticsPage(html, contextFor('ANKARA'))).toThrow(
      /served a different province/,
    );
  });

  it('throws when the page states two different measurement periods', () => {
    // Corrupt only the SECOND period row (the one above the extreme-value rows).
    let seen = 0;
    const mutated = html.replace(
      /Ölçüm Periyodu \( (\d{4}) - (\d{4})\)/g,
      (match, start: string, end: string) => {
        seen += 1;
        return seen === 2 ? `Ölçüm Periyodu ( ${Number(start) + 5} - ${end})` : match;
      },
    );
    expect(seen).toBe(2);

    expect(() => parseMgmGeneralStatisticsPage(mutated, context)).toThrow(
      /more than one measurement period/,
    );
  });

  it('KEEPS the reading when its occurrence date is missing (no data loss)', () => {
    // The regression this guards: "the date is absent, so drop the value". A missing date is
    // MGM's omission, not our error — the reading must survive it.
    const mutated = html.replace(/\stitle="\d{2}\.\d{2}\.\d{4}"/g, '');
    expect(mutated).not.toBe(html);

    const { normals } = parseMgmGeneralStatisticsPage(mutated, context);

    const withValues = normals.months.filter((month) => month.tempRecordMaxC !== null);
    expect(withValues.length).toBeGreaterThan(0);
    for (const month of normals.months) {
      expect(month.tempRecordMaxDate).toBeNull();
      expect(month.tempRecordMinDate).toBeNull();
    }
    // …and the series is still publishable: dates are enrichment, never a gate.
    expect(() => assertClimateNormalsShape('33', normals)).not.toThrow();
  });

  it('throws on an occurrence date in an unexpected format instead of guessing', () => {
    // `01.02.2003` vs `2003-02-01` vs `02/01/2003` are three different dates under three
    // conventions. Pinning the format is the same discipline as refusing a dot decimal.
    const mutated = html.replace(/title="(\d{2})\.(\d{2})\.(\d{4})"/, 'title="$3-$2-$1"');
    expect(mutated).not.toBe(html);

    expect(() => parseMgmGeneralStatisticsPage(mutated, context)).toThrow(/is not DD\.MM\.YYYY/);
  });

  it('throws on a date that matches the pattern but is not a real calendar date', () => {
    const mutated = html.replace(/title="\d{2}\.\d{2}\.(\d{4})"/, 'title="31.02.$1"');
    expect(mutated).not.toBe(html);

    expect(() => parseMgmGeneralStatisticsPage(mutated, context)).toThrow(
      /not a real calendar date/,
    );
  });

  it('throws when an occurrence date stands with no reading', () => {
    // Blank the value but leave its `title` in place.
    const mutated = html.replace(/(<td id="j01"[^>]*>)[^<]*(<\/td>)/, '$1$2');
    expect(mutated).not.toBe(html);

    expect(() => parseMgmGeneralStatisticsPage(mutated, context)).toThrow(
      /occurrence date with no reading/,
    );
  });

  it('throws when a record carries the wrong unit', () => {
    const mutated = html.replace('m/sn', 'km/h');
    expect(() => parseMgmGeneralStatisticsPage(mutated, context)).toThrow(/unit is/);
  });

  it('throws when the page contains no table at all', () => {
    // This is exactly how a province with no published series presents (it is how
    // İstanbul's k=H page behaves). It must abort, never yield an empty series.
    expect(() =>
      parseMgmGeneralStatisticsPage('<html><body>Veri yok</body></html>', context),
    ).toThrow(/no <table> at all/);
  });

  it('throws when the records table is missing', () => {
    const monthlyOnly = /<table[\s\S]*?<\/table>/.exec(html)?.[0] ?? '';
    expect(() => parseMgmGeneralStatisticsPage(monthlyOnly, context)).toThrow(/no records table/);
  });

  it('throws when MGM REMOVES a measure row entirely, not only when it renames one', () => {
    // The allowlist catches a renamed label (unrecognised → throw). A removed row is the
    // silent direction: it simply never appears, the field fills `null` for all 12 months,
    // and the remaining seven rows keep every other check green — so six of the eight
    // measures could vanish and the table would quietly lose a column across all 81
    // provinces. Sunshine is used here precisely because it is NOT part of the core pair, so
    // nothing else in the pipeline would have objected.
    const mutated = html.replace(
      /<tr>\s*<th>Ortalama Güneşlenme Süresi \(saat\)<\/th>[\s\S]*?<\/tr>/,
      '',
    );
    expect(mutated).not.toBe(html);

    expect(() => parseMgmGeneralStatisticsPage(mutated, context)).toThrow(
      /missing 1 expected measure row/,
    );
  });

  it('throws when the records table grows a row instead of reading rows 0-1 by position', () => {
    // Insert before the LAST `</tbody>` — the monthly table has one too, and `replace`
    // would otherwise hit that one.
    const insertAt = html.lastIndexOf('</tbody>');
    expect(insertAt).toBeGreaterThan(0);
    const mutated = `${html.slice(0, insertAt)}<tr><td>x</td></tr>\n  ${html.slice(insertAt)}`;

    expect(() => parseMgmGeneralStatisticsPage(mutated, context)).toThrow(
      /records table has 3 rows/,
    );
  });
});

describe('parseKaNumber / formatLikeRawKaNumber', () => {
  const context = contextFor('ICEL');

  it('parses comma decimals at full precision', () => {
    expect(parseKaNumber('10,4', context, 'test')).toBe(10.4);
    expect(parseKaNumber('10,22', context, 'test')).toBe(10.22);
    expect(parseKaNumber('-6,3', context, 'test')).toBe(-6.3);
    expect(parseKaNumber('113', context, 'test')).toBe(113);
  });

  it('returns null for blank cells rather than 0', () => {
    // 0 and "no reading" are different statements; conflating them would invent data.
    expect(parseKaNumber('', context, 'test')).toBeNull();
    expect(parseKaNumber('   ', context, 'test')).toBeNull();
    expect(parseKaNumber('-', context, 'test')).toBeNull();
  });

  it('throws rather than guessing at anything outside the grammar', () => {
    expect(() => parseKaNumber('10.4', context, 'test')).toThrow();
    expect(() => parseKaNumber('1.234,5', context, 'test')).toThrow();
    expect(() => parseKaNumber('10,4 °C', context, 'test')).toThrow();
    expect(() => parseKaNumber('n/a', context, 'test')).toThrow();
  });

  it('re-prints in the source notation, preserving trailing zeros', () => {
    // The decimal count comes from the raw string, so "21,0" does not collapse to "21" —
    // without this the round-trip check would raise false alarms on every whole value.
    expect(formatLikeRawKaNumber(21, '21,0')).toBe('21,0');
    expect(formatLikeRawKaNumber(10.4, '10,4')).toBe('10,4');
    expect(formatLikeRawKaNumber(-6.3, '-6,3')).toBe('-6,3');
    expect(formatLikeRawKaNumber(113, '113')).toBe('113');
    expect(formatLikeRawKaNumber(0.76, '0,76')).toBe('0,76');
  });
});

describe('parseRecordValue', () => {
  const context = contextFor('ICEL');

  it('keeps a record whose occurrence date is missing', () => {
    // Same asymmetry as the monthly rows: MGM may simply not have printed a date, and
    // discarding a real record over that would be data loss.
    expect(parseRecordValue('199,5 mm', '', 'mm', context, 'test')).toEqual({
      value: 199.5,
      date: null,
    });
  });

  it('returns null for a blank pair', () => {
    // A station with no measurable snow is normal — that is not a parse failure.
    expect(parseRecordValue('-', '-', 'cm', context, 'test')).toBeNull();
  });

  it('throws when a value carries no unit', () => {
    // The unit is what makes the magnitude meaningful; a bare number here means the cell
    // layout changed, and silently keeping the number would publish an unscaled figure.
    expect(() => parseRecordValue('199,5', '26.12.1968', 'mm', context, 'test')).toThrow(
      /carries no unit/,
    );
  });

  it('throws on an occurrence date with no record value', () => {
    // The records analog of the monthly rule — a date attached to nothing would render as
    // a dangling parenthetical.
    expect(() => parseRecordValue('-', '26.12.1968', 'mm', context, 'test')).toThrow(
      /occurrence date .* with no record value/,
    );
  });

  // MGM's real "no such record" spelling, found on the 2026-07-18 harvest: the date cell reads
  // `..` and the value cell holds the bare unit. Before this was recognised the import aborted
  // on it, which is why these cases are pinned.
  it('returns null for MGM\'s "no record" spelling (bare unit + ".." date)', () => {
    expect(parseRecordValue(' cm', '..', 'cm', context, 'test')).toBeNull();
  });

  it('still throws when a bare unit is paired with a REAL occurrence date', () => {
    // MGM asserting "an event happened on this date" while printing no magnitude is a
    // contradiction, not an absent record. Staying loud here is what keeps the new marker
    // narrow — it may only mean "no record", never "a reading we could not read".
    expect(() => parseRecordValue(' cm', '15.02.2004', 'cm', context, 'test')).toThrow(
      /occurrence date .* with no record value/,
    );
  });

  it('does not treat a WRONG bare unit as an absent record', () => {
    // The absent marker is matched against the unit this column must carry. A different unit
    // means the column layout moved, and that must never be read as "nothing here".
    expect(() => parseRecordValue(' mm', '..', 'cm', context, 'test')).toThrow();
  });

  it('does not treat an unparseable value as an absent record', () => {
    // The failure mode this guards: a broad "if I cannot parse it, call it null" rule would
    // turn every future format change into silent, total data loss instead of a loud stop.
    expect(() => parseRecordValue('bilinmiyor cm', '..', 'cm', context, 'test')).toThrow();
  });
});

describe('isAbsentRecordValueCell', () => {
  it('accepts only the blank markers and the exact expected unit', () => {
    expect(isAbsentRecordValueCell(' cm ', 'cm')).toBe(true);
    expect(isAbsentRecordValueCell('-', 'cm')).toBe(true);
    expect(isAbsentRecordValueCell('', 'cm')).toBe(true);

    expect(isAbsentRecordValueCell('33 cm', 'cm')).toBe(false);
    expect(isAbsentRecordValueCell('-1 cm', 'cm')).toBe(false);
    expect(isAbsentRecordValueCell('mm', 'cm')).toBe(false);
    expect(isAbsentRecordValueCell('cmx', 'cm')).toBe(false);
  });
});

describe('collectImpossibleValueAnomalies', () => {
  function normalsWith(mutate: (normals: ClimateNormals) => void): ClimateNormals {
    const { normals } = parseMgmGeneralStatisticsPage(
      loadFixture('k-a-icel.tables.html'),
      contextFor('ICEL'),
    );
    mutate(normals);
    return normals;
  }

  it('reports nothing on a clean series', () => {
    const normals = normalsWith(() => undefined);

    expect(collectImpossibleValueAnomalies(normals)).toEqual([]);
  });

  it('nulls an impossible record magnitude but KEEPS the rest of the province', () => {
    const normals = normalsWith((draft) => {
      const record = draft.records.maxSnowDepthCm;
      if (record) record.value = -1;
    });

    const anomalies = collectImpossibleValueAnomalies(normals);

    expect(anomalies).toHaveLength(1);
    expect(anomalies[0]?.field).toBe('maxSnowDepthCm');
    expect(normals.records.maxSnowDepthCm).toBeNull();
    // The point of nulling rather than throwing: one bad cell must not cost a whole series.
    expect(normals.records.dailyMaxPrecipitationMm).not.toBeNull();
    expect(normals.months.every((month) => month.tempMeanC !== null)).toBe(true);
  });

  it('nulls an impossible monthly value and names the month', () => {
    const normals = normalsWith((draft) => {
      const month = draft.months[3];
      if (month) month.precipitationMm = -5;
    });

    const anomalies = collectImpossibleValueAnomalies(normals);

    expect(anomalies).toHaveLength(1);
    expect(anomalies[0]?.month).toBe(4);
    expect(normals.months[3]?.precipitationMm).toBeNull();
  });

  it('NEVER treats a negative temperature as impossible', () => {
    // The rule must not reach temperatures: a −24,9 °C January is an ordinary eastern
    // Anatolian reading, and nulling those would destroy the most important part of the series.
    const normals = normalsWith((draft) => {
      for (const month of draft.months) {
        month.tempMeanC = -20;
        month.tempMinMeanC = -30;
      }
    });

    expect(collectImpossibleValueAnomalies(normals)).toEqual([]);
    expect(normals.months.every((month) => month.tempMeanC === -20)).toBe(true);
  });

  it('records the raw cell and a reason for every anomaly', () => {
    // The anomaly is a provenance record, not just a flag — without the source text it cannot
    // be checked against MGM's page by a human later.
    const normals = normalsWith((draft) => {
      const record = draft.records.maxSnowDepthCm;
      if (record) record.value = -1;
    });

    const [anomaly] = collectImpossibleValueAnomalies(normals);

    expect(anomaly?.rawCell).toContain('-1');
    expect(anomaly?.reason.length).toBeGreaterThan(0);
    expect(anomaly?.sourceLabel.length).toBeGreaterThan(0);
  });
});

/**
 * FULL-PAGE fixtures — the gap PR A1a could not close.
 *
 * Every test above this point feeds the parser two-table FRAGMENTS, which are themselves this
 * parser's output. That proves self-consistency, not that it can read what MGM actually serves:
 * `parseMgmGeneralStatisticsPage` requires the page to contain EXACTLY two `<table>` elements,
 * and until a real ~364 KB `.aspx` response was in hand that requirement was an assumption.
 * These fixtures are real responses captured on 2026-07-18, committed unmodified.
 *
 * `k-a-osmaniye.page.html` is committed alongside them but deliberately NOT asserted yet: it
 * carries a snow record of `-1 cm` against a real date, the import correctly refuses it, and
 * whether that is an MGM sentinel or a data-entry error is an open question. Pinning an expected
 * behaviour before that is answered would bake in a guess.
 */
describe('parseMgmGeneralStatisticsPage — real full pages', () => {
  /**
   * Three real captured pages, each carrying a case the fragments cannot:
   *   - **Ankara** — the ordinary page, proving the whole-document path works at all.
   *   - **Muğla** — MGM's "no such record" spelling (date `..`, a bare ` cm`).
   *   - **Osmaniye** — the one impossible value found across all 81 provinces (`-1 cm`).
   *
   * Osmaniye was originally excluded on the grounds that "whether `-1` is a sentinel or an error
   * is an open question, and pinning expected behaviour would bake in a guess." That reasoning
   * does not survive contact with the shipped rule: `collectImpossibleValueAnomalies` treats any
   * negative record magnitude identically regardless of what MGM meant by it, so the expected
   * behaviour is already fully determined — exactly as it is for Muğla, which is pinned. What
   * WAS untested is the thing that matters: that the real page round-trips through table
   * detection AND anomaly detection together, rather than through a hand-mutated object.
   */
  const FULL_PAGES = [
    { file: 'k-a-ankara.page.html', mgmKey: 'ANKARA' },
    { file: 'k-a-mugla.page.html', mgmKey: 'MUGLA' },
    { file: 'k-a-osmaniye.page.html', mgmKey: 'OSMANIYE' },
  ] as const;

  it.each(FULL_PAGES)('$mgmKey: the fixture is a whole page, not a fragment', ({ file }) => {
    const html = loadFixture(file);

    // Guards the fixture itself: if someone later "tidies" these down to the two tables, the
    // suite silently goes back to testing fragments and the gap reopens with no failure.
    expect(html.length).toBeGreaterThan(100_000);
    expect(html).toMatch(/<\/html>/i);
    expect(html).toMatch(/nav_iller/);
  });

  it.each(FULL_PAGES)('$mgmKey: parses a whole page into 12 ordered months', ({ file, mgmKey }) => {
    const { normals } = parseMgmGeneralStatisticsPage(loadFixture(file), contextFor(mgmKey));

    expect(normals.months).toHaveLength(CLIMATE_MONTH_COUNT);
    expect(normals.months.map((month) => month.month)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);
    for (const month of normals.months) {
      expect(typeof month.tempMeanC).toBe('number');
      expect(typeof month.precipitationMm).toBe('number');
    }
  });

  it.each(FULL_PAGES)('$mgmKey: a whole page passes the import assertions', ({ file, mgmKey }) => {
    const parsed = parseMgmGeneralStatisticsPage(loadFixture(file), contextFor(mgmKey));

    expect(() => assertClimateNormalsShape('00', parsed.normals)).not.toThrow();
  });

  it.each(FULL_PAGES)(
    '$mgmKey: reads the period from the page, not from a constant',
    ({ file, mgmKey }) => {
      const html = loadFixture(file);
      const { normals } = parseMgmGeneralStatisticsPage(html, contextFor(mgmKey));

      const stated = /Ölçüm Periyodu\s*\(\s*(\d{4})\s*-\s*(\d{4})\s*\)/.exec(html);
      expect(stated).not.toBeNull();
      expect(normals.periodStartYear).toBe(Number(stated?.[1]));
      expect(normals.periodEndYear).toBe(Number(stated?.[2]));
    },
  );

  it.each(FULL_PAGES)(
    '$mgmKey: a record is null if and ONLY if its source cell is absent OR was refused',
    ({ file, mgmKey }) => {
      // Stated as an invariant over whatever the fixture happens to contain, so it asserts the
      // parser's RULE rather than any province's snowfall history.
      //
      // "or was refused" is the second half of the rule, and adding the Osmaniye page is what
      // makes it non-vacuous: a null must be accounted for by EXACTLY one of the two legitimate
      // causes. Stated this way the invariant is strictly stronger than the absent-only version
      // it replaces — an unexplained null now fails on every page, not just the tidy ones.
      const parsed = parseMgmGeneralStatisticsPage(loadFixture(file), contextFor(mgmKey));
      const refused = new Set(
        parsed.anomalies
          .filter((anomaly) => anomaly.month === null)
          .map((anomaly) => anomaly.field),
      );

      for (const cell of parsed.raw.recordCells) {
        const column = RECORD_COLUMNS.find((candidate) => candidate.field === cell.field);
        expect(column).toBeDefined();
        const absent = isAbsentRecordValueCell(cell.rawValue, column?.unit ?? '');
        expect(parsed.normals.records[cell.field] === null).toBe(absent || refused.has(cell.field));
      }
    },
  );

  it('a real page carrying an impossible value parses, refuses it, and keeps the province', () => {
    // End-to-end on the genuine captured page, which is what the fixture was committed for: the
    // anomaly mechanism had only ever been driven by a hand-mutated object and synthetic
    // regex-corrupted HTML. Both are legitimate, and neither proves that table detection and
    // anomaly detection compose correctly on a real 364 KB document.
    //
    // Structural per CONVENTIONS §2: it asserts that SOME impossible record was refused and that
    // the rest of the series survived — never that any province has a particular snow depth.
    const parsed = parseMgmGeneralStatisticsPage(
      loadFixture('k-a-osmaniye.page.html'),
      contextFor('OSMANIYE'),
    );

    const recordAnomalies = parsed.anomalies.filter((anomaly) => anomaly.month === null);
    expect(recordAnomalies.length).toBeGreaterThan(0);

    for (const anomaly of recordAnomalies) {
      // Refused, not published…
      expect(
        parsed.normals.records[anomaly.field as keyof typeof parsed.normals.records],
      ).toBeNull();
      // …and the raw evidence really was negative, which is the whole justification.
      const cell = parsed.raw.recordCells.find((candidate) => candidate.field === anomaly.field);
      expect(cell?.rawValue.trim().startsWith('-')).toBe(true);
    }

    // The mechanism's core promise: one bad cell costs one cell, not the province.
    expect(parsed.normals.months).toHaveLength(CLIMATE_MONTH_COUNT);
    expect(parsed.normals.months.every((month) => month.tempMeanC !== null)).toBe(true);
    expect(parsed.normals.months.every((month) => month.precipitationMm !== null)).toBe(true);
    expect(Object.values(parsed.normals.records).some((record) => record !== null)).toBe(true);
    expect(() => assertClimateNormalsShape('80', parsed.normals)).not.toThrow();
  });

  it('a page may carry an absent record without losing its other records', () => {
    // The Muğla fixture is the one that exercises the absent branch at all; without it the
    // invariant above would be vacuously true everywhere.
    const parsed = parseMgmGeneralStatisticsPage(
      loadFixture('k-a-mugla.page.html'),
      contextFor('MUGLA'),
    );
    const records = Object.values(parsed.normals.records);

    expect(records.some((record) => record === null)).toBe(true);
    expect(records.some((record) => record !== null)).toBe(true);
    // An absent EXTRA must never suppress the core series (PLAN §1's all-or-nothing pair).
    expect(parsed.normals.months.every((month) => month.tempMeanC !== null)).toBe(true);
  });
});

/**
 * `RECORD_ABSENT_DATE_VALUES` (`..`) is scoped to the records table's date branch alone. That
 * narrowness is currently enforced STRUCTURALLY — the set has exactly one consumer — which is
 * real but invisible: nothing fails if a later edit folds `..` into the shared blank set, and the
 * cost of that edit would be a two-character token silently becoming a legal "no reading" across
 * 81 provinces × 8 measures × 12 months. These tests make the invariant explicit.
 */
describe('the `..` absent-date marker stays scoped to the records table', () => {
  it('a monthly cell of `..` still THROWS — it is not a blank the monthly series accepts', () => {
    expect(() => parseKaNumber('..', contextFor('ICEL'), 'month 3')).toThrow(
      /does not match the k=A number grammar/,
    );
  });

  it('`..` next to a REAL record value throws rather than being read as "no date"', () => {
    // The narrow reading, pinned: `..` means "no such record" only in the pair MGM actually
    // prints it in — an absent date beside an absent value. A `..` standing next to `33 cm` is a
    // combination we have never observed, and inventing a meaning for it would apply that guess
    // to every province. Defensible only while it is deliberate, which is what this test makes it.
    expect(() =>
      parseRecordValue('33 cm', '..', 'cm', contextFor('MUGLA'), 'record "En Yüksek Kar"'),
    ).toThrow(/not DD\.MM\.YYYY/);
  });

  it('`..` beside an ABSENT value is the pair MGM really prints, and yields null', () => {
    expect(
      parseRecordValue(' cm', '..', 'cm', contextFor('MUGLA'), 'record "En Yüksek Kar"'),
    ).toBeNull();
  });
});

describe('parseMgmProvinceKeys', () => {
  const navHtml = loadFixture('nav-iller.html');

  it('reads all 81 province keys from the page itself', () => {
    const keys = parseMgmProvinceKeys(navHtml);

    expect(keys).toHaveLength(81);
    for (const entry of keys) {
      expect(entry.key).toMatch(/^[A-Z]+$/);
      expect(entry.nameTr.length).toBeGreaterThan(0);
    }
  });

  it('yields a one-to-one key↔name map', () => {
    const keys = parseMgmProvinceKeys(navHtml);

    expect(new Set(keys.map((entry) => entry.key)).size).toBe(keys.length);
    expect(new Set(keys.map((entry) => entry.nameTr)).size).toBe(keys.length);
  });

  it('throws when the province list is incomplete', () => {
    // Guards the case that matters: a partial menu yielding a partial import that looks
    // like a complete one.
    const truncated = navHtml.replace(/<a href="\?k=A&m=[A-Z]+">[^<]*<\/a>/, '');

    expect(() => parseMgmProvinceKeys(truncated)).toThrow(/expected 81/);
  });

  it('throws when the key map is not one-to-one', () => {
    const keys = parseMgmProvinceKeys(navHtml);
    const first = keys[0];
    const second = keys[1];
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    const duplicated = navHtml.replace(
      `>${second?.nameTr ?? ''}</a>`,
      `>${first?.nameTr ?? ''}</a>`,
    );

    expect(() => parseMgmProvinceKeys(duplicated)).toThrow(/not one-to-one/);
  });

  it('throws when the navigation block is absent', () => {
    expect(() => parseMgmProvinceKeys('<html></html>')).toThrow(/nav_iller/);
  });
});
