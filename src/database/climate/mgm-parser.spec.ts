import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CLIMATE_MONTH_COUNT, CLIMATE_SOURCE_MGM_GENERAL } from '../../province/province.types';
import {
  formatLikeRawKaNumber,
  parseKaNumber,
  parseMgmGeneralStatisticsPage,
  parseMgmProvinceKeys,
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
