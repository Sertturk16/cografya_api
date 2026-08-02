import { describe, expect, it } from '@jest/globals';
import { UpstreamSchemaError } from '../../upstream/upstream.types';
import type { CmemsDatasetSelector } from './cmems-routing';
import { CMEMS_BASIN_ROUTING, CMEMS_SELECTOR_ENTRIES } from './cmems-routing';
import {
  parseCmemsDatasetToken,
  parseCmemsProductStac,
  resolveCmemsProduct,
  selectCmemsDataset,
} from './cmems-stac';

/**
 * The resolver's edge cases (plan §8): tem/temp duality, structural exclusion of
 * static/de-tided/daily/monthly sets, newest-stamp-wins, and fail-closed on no match. Item ids
 * mirror the live catalogue's shapes (verified 2026-08-02) but the assertions are structural —
 * they pin OUR selection rules, not the provider's inventory.
 */

const TEMP_SELECTOR: CmemsDatasetSelector = {
  productId: 'BLKSEA_ANALYSISFORECAST_PHY_007_001',
  acceptedVariableTokens: ['phy-tem', 'phy-temp'],
  gridToken: '2.5km',
};

describe('parseCmemsDatasetToken', () => {
  it('parses an hourly dataset href into its tokens', () => {
    const token = parseCmemsDatasetToken(
      'cmems_mod_blk_phy-temp_anfc_2.5km_PT1H-m_202511/dataset.stac.json',
    );
    expect(token).toEqual({
      datasetId: 'cmems_mod_blk_phy-temp_anfc_2.5km_PT1H-m_202511',
      variableToken: 'phy-temp',
      gridToken: '2.5km',
      timeToken: 'PT1H-m',
      stamp: 202511,
    });
  });

  it('parses the Marmara sub-model with its instantaneous time token', () => {
    const token = parseCmemsDatasetToken('cmems_mod_blk_phy-tem_anfc_mrm-500m_PT1H-i_202311');
    expect(token?.variableToken).toBe('phy-tem');
    expect(token?.gridToken).toBe('mrm-500m');
  });

  it('tolerates a leading ./ and an absolute URL — the id is found by segment scan (review #81 M7)', () => {
    // Measured 2026-08-02: all four products serve the plain relative form. These variants are
    // the cosmetic href changes a provider could make without changing the ids themselves; a
    // fail-closed outage on either would be loud but pointless.
    const expected = 'cmems_mod_blk_phy-temp_anfc_2.5km_PT1H-m_202511';
    for (const href of [
      `./${expected}/dataset.stac.json`,
      `https://stac.marine.copernicus.eu/metadata/BLKSEA_ANALYSISFORECAST_PHY_007_001/${expected}/dataset.stac.json`,
      expected,
    ]) {
      expect(parseCmemsDatasetToken(href)?.datasetId).toBe(expected);
    }
  });

  it('excludes static, daily, monthly and 15-minute sets STRUCTURALLY (no denylist)', () => {
    // Every id below exists in the live catalogue in this shape; none may ever resolve.
    for (const href of [
      'cmems_mod_med_phy_anfc_4.2km_static_202311--ext--coords/dataset.stac.json',
      'cmems_mod_blk_phy_anfc_2.5km_static_202411--ext--bathy/dataset.stac.json',
      'cmems_mod_blk_phy-temp_anfc_2.5km_P1D-m_202511/dataset.stac.json',
      'cmems_mod_blk_phy-temp_anfc_2.5km_P1M-m_202511/dataset.stac.json',
      'cmems_mod_blk_phy-ssh_anfc_2.5km_PT15M-i_202511/dataset.stac.json',
      'not-a-dataset-id-at-all',
      '',
    ]) {
      expect(parseCmemsDatasetToken(href)).toBeNull();
    }
  });
});

describe('selectCmemsDataset', () => {
  it('accepts BOTH phy-tem and phy-temp for temperature (measured provider inconsistency)', () => {
    const viaTem = selectCmemsDataset(
      ['cmems_mod_blk_phy-tem_anfc_2.5km_PT1H-m_202411/dataset.stac.json'],
      TEMP_SELECTOR,
    );
    const viaTemp = selectCmemsDataset(
      ['cmems_mod_blk_phy-temp_anfc_2.5km_PT1H-m_202511/dataset.stac.json'],
      TEMP_SELECTOR,
    );
    expect(viaTem.datasetId).toBe('cmems_mod_blk_phy-tem_anfc_2.5km_PT1H-m_202411');
    expect(viaTemp.datasetId).toBe('cmems_mod_blk_phy-temp_anfc_2.5km_PT1H-m_202511');
  });

  it('matches the grid token EXACTLY — de-tided and sub-model grids cannot ride along', () => {
    const selection = selectCmemsDataset(
      [
        // A de-tided hourly variant would carry the grid token `detided-2.5km`; exact equality
        // keeps it out even though `2.5km` is a substring of it.
        'cmems_mod_blk_phy-temp_anfc_detided-2.5km_PT1H-m_202511/dataset.stac.json',
        'cmems_mod_blk_phy-tem_anfc_mrm-500m_PT1H-i_202311/dataset.stac.json',
      ],
      TEMP_SELECTOR,
    );
    expect(selection.datasetId).toBeNull();
  });

  it('lets the newest _2xxxxx stamp win among matching candidates', () => {
    const selection = selectCmemsDataset(
      [
        'cmems_mod_blk_phy-temp_anfc_2.5km_PT1H-m_202311/dataset.stac.json',
        'cmems_mod_blk_phy-temp_anfc_2.5km_PT1H-m_202511/dataset.stac.json',
        'cmems_mod_blk_phy-temp_anfc_2.5km_PT1H-m_202411/dataset.stac.json',
      ],
      TEMP_SELECTOR,
    );
    expect(selection.datasetId).toBe('cmems_mod_blk_phy-temp_anfc_2.5km_PT1H-m_202511');
  });

  it('fails CLOSED when nothing matches — never a "nearest similar" dataset', () => {
    const selection = selectCmemsDataset(
      ['cmems_mod_blk_wav_anfc_2.5km_PT1H-i_202411/dataset.stac.json'],
      TEMP_SELECTOR,
    );
    expect(selection.datasetId).toBeNull();
    expect('reason' in selection && selection.reason).toMatch(/fail-closed/);
  });

  it('fails CLOSED on two different ids sharing the newest stamp', () => {
    const selection = selectCmemsDataset(
      [
        'cmems_mod_blk_phy-tem_anfc_2.5km_PT1H-m_202511/dataset.stac.json',
        'cmems_mod_blk_phy-temp_anfc_2.5km_PT1H-m_202511/dataset.stac.json',
      ],
      TEMP_SELECTOR,
    );
    expect(selection.datasetId).toBeNull();
    expect('reason' in selection && selection.reason).toMatch(/ambiguous/);
  });
});

/** A minimal but real-shaped product document (field names verified live 2026-08-02). */
function productDoc(itemHrefs: readonly string[]): string {
  return JSON.stringify({
    id: 'BLKSEA_ANALYSISFORECAST_PHY_007_001',
    license: 'proprietary',
    'sci:doi': '10.48670/mds-00355',
    extent: {
      temporal: { interval: [['2021-01-01T00:00:00Z', '2026-08-10T00:00:00Z']] },
    },
    properties: {
      updateFrequencies: { daily: '12:00 UTC', monthly: null },
      admp_updated: '2026-08-01T11:06:46.349007Z',
    },
    links: itemHrefs.map((href) => ({ rel: 'item', href })),
  });
}

describe('parseCmemsProductStac + resolveCmemsProduct', () => {
  it('resolves every selector of one product from a single document', () => {
    const doc = parseCmemsProductStac(
      productDoc([
        'cmems_mod_blk_phy-temp_anfc_2.5km_PT1H-m_202511/dataset.stac.json',
        'cmems_mod_blk_phy-tem_anfc_mrm-500m_PT1H-i_202311/dataset.stac.json',
        'cmems_mod_blk_phy-temp_anfc_2.5km_P1D-m_202511/dataset.stac.json',
      ]),
    );
    const resolution = resolveCmemsProduct(doc, [
      { key: 'blksea/2.5km', selector: TEMP_SELECTOR },
      {
        key: 'blksea/mrm-500m',
        selector: { ...TEMP_SELECTOR, gridToken: 'mrm-500m' },
      },
    ]);

    expect(resolution.productId).toBe('BLKSEA_ANALYSISFORECAST_PHY_007_001');
    expect(resolution.doi).toBe('10.48670/mds-00355');
    expect(resolution.license).toBe('proprietary');
    expect(resolution.temporalExtent).toEqual({
      startUtc: '2021-01-01T00:00:00Z',
      endUtc: '2026-08-10T00:00:00Z',
    });
    // Verbatim-compact: null-valued frequencies are dropped, present ones join label: value.
    expect(resolution.updateFrequency).toBe('daily: 12:00 UTC');
    expect(resolution.admpUpdatedUtc).toBe('2026-08-01T11:06:46.349007Z');
    expect(resolution.selections).toEqual([
      {
        selectorKey: 'blksea/2.5km',
        selection: { datasetId: 'cmems_mod_blk_phy-temp_anfc_2.5km_PT1H-m_202511', stamp: 202511 },
      },
      {
        selectorKey: 'blksea/mrm-500m',
        selection: {
          datasetId: 'cmems_mod_blk_phy-tem_anfc_mrm-500m_PT1H-i_202311',
          stamp: 202311,
        },
      },
    ]);
  });

  it('fails ONE selector without darkening the other (per-basin isolation)', () => {
    const doc = parseCmemsProductStac(
      productDoc(['cmems_mod_blk_phy-temp_anfc_2.5km_PT1H-m_202511/dataset.stac.json']),
    );
    const resolution = resolveCmemsProduct(doc, [
      { key: 'blksea/2.5km', selector: TEMP_SELECTOR },
      { key: 'blksea/mrm-500m', selector: { ...TEMP_SELECTOR, gridToken: 'mrm-500m' } },
    ]);
    const [ok, failed] = resolution.selections;
    expect(ok?.selection.datasetId).not.toBeNull();
    expect(failed?.selection.datasetId).toBeNull();
  });

  it('throws UpstreamSchemaError on a document that is not the promised shape', () => {
    expect(() => parseCmemsProductStac('{"links": "nope"}')).toThrow(UpstreamSchemaError);
    expect(() => parseCmemsProductStac('not json at all')).toThrow(UpstreamSchemaError);
  });
});

describe('CMEMS_SELECTOR_ENTRIES (routing invariants)', () => {
  it('is five selectors over four product documents (BLKSEA PHY serves two grids)', () => {
    expect(CMEMS_SELECTOR_ENTRIES).toHaveLength(5);
    const productIds = new Set(CMEMS_SELECTOR_ENTRIES.map((entry) => entry.selector.productId));
    expect(productIds.size).toBe(4);
  });

  it('routes the Aegean and the Mediterranean identically, and Marmara wave to nothing', () => {
    expect(CMEMS_BASIN_ROUTING.aegean).toBe(CMEMS_BASIN_ROUTING.mediterranean);
    expect(CMEMS_BASIN_ROUTING.marmara.wave).toBeNull();
  });
});
