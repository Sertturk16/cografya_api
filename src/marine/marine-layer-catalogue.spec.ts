import { describe, expect, it } from '@jest/globals';
import { MARINE_LAYER_CATALOGUE } from './marine-layer-catalogue';
import { MarineDirectionConvention, MarineLayerId, MarineSource, MarineUnit } from './marine.types';

/**
 * The catalogue's SERVED values, pinned literally.
 *
 * ## Why a value test, when the repo's rule is "structure, not facts"
 * Because these are not facts about the world, they are our PUBLISHED CONTRACT. `GET
 * /api/marine/layers` serves this constant today, and the e2e suite can only assert that the
 * fields are strings of the right shape — so every value below could change to another
 * perfectly-typed value and ship green. Two of them changed in this PR (M3a):
 * `open-meteo` → `ecmwf` everywhere, and sea-surface temperature's `fallbackSource` → `null`.
 *
 * That second one is the reason this file exists. `fallbackSource: null` is a MEASURED claim —
 * ECMWF Open Data publishes no `sst` in any stream, so nothing can back CMEMS up there — and its
 * accidental reversion would have the API publicly advertise a fallback that is never published,
 * while every type check, every lint and every existing test stays green. A renderer would show a
 * "falls back to ECMWF" affordance for a layer that simply goes absent.
 *
 * ## And the enum member sets
 * `MarineSource` is pinned to exactly two members: the contract change is only complete if
 * `open-meteo` is GONE, not merely unused. A value the server can never produce, left in the
 * published enum, forces the web repo to defend against it forever (marine.types.ts).
 */

/** Every value `GET /api/marine/layers` publishes for each layer, in the order it publishes them. */
const EXPECTED_LAYERS = [
  {
    id: MarineLayerId.SeaSurfaceTemperature,
    unit: MarineUnit.Celsius,
    directionConvention: null,
    calmThreshold: null,
    primarySource: MarineSource.Cmems,
    // Measured across oper / wave / enfo / aifs-single: ECMWF Open Data carries no `sst` at all.
    fallbackSource: null,
    attributionId: 'cmems',
  },
  {
    id: MarineLayerId.WaveHeight,
    unit: MarineUnit.Meter,
    directionConvention: null,
    calmThreshold: 0.1,
    primarySource: MarineSource.Cmems,
    fallbackSource: MarineSource.Ecmwf,
    attributionId: 'cmems',
  },
  {
    id: MarineLayerId.WaveDirection,
    unit: MarineUnit.DegreeTrue,
    directionConvention: MarineDirectionConvention.From,
    calmThreshold: null,
    primarySource: MarineSource.Cmems,
    fallbackSource: MarineSource.Ecmwf,
    attributionId: 'cmems',
  },
  {
    id: MarineLayerId.WindSpeed10m,
    unit: MarineUnit.MeterPerSecond,
    directionConvention: null,
    calmThreshold: 0.5,
    // CMEMS is an ocean service and carries no wind field anywhere — hence no fallback.
    primarySource: MarineSource.Ecmwf,
    fallbackSource: null,
    attributionId: 'ecmwf',
  },
  {
    id: MarineLayerId.WindDirection10m,
    unit: MarineUnit.DegreeTrue,
    directionConvention: MarineDirectionConvention.From,
    calmThreshold: null,
    primarySource: MarineSource.Ecmwf,
    fallbackSource: null,
    attributionId: 'ecmwf',
  },
] as const;

describe('MARINE_LAYER_CATALOGUE', () => {
  it('publishes the five Faz-1 layers, in the frozen order', () => {
    expect(MARINE_LAYER_CATALOGUE.map((layer) => layer.id)).toEqual(
      EXPECTED_LAYERS.map((layer) => layer.id),
    );
  });

  it.each(EXPECTED_LAYERS.map((layer) => [layer.id, layer] as const))(
    'serves %s with the sources, units and thresholds the contract promises',
    (id, expected) => {
      const layer = MARINE_LAYER_CATALOGUE.find((candidate) => candidate.id === id);
      expect(layer).toBeDefined();
      if (layer === undefined) return;

      expect(layer.unit).toBe(expected.unit);
      expect(layer.directionConvention).toBe(expected.directionConvention);
      expect(layer.calmThreshold).toBe(expected.calmThreshold);
      expect(layer.primarySource).toBe(expected.primarySource);
      expect(layer.fallbackSource).toBe(expected.fallbackSource);
      expect(layer.attributionId).toBe(expected.attributionId);
    },
  );

  it('offers NO fallback for sea surface temperature', () => {
    // Stated on its own, away from the table, because it is the one value whose reversion would
    // be an advertised-but-unpublishable capability rather than a wrong label.
    const temperature = MARINE_LAYER_CATALOGUE.find(
      (layer) => layer.id === MarineLayerId.SeaSurfaceTemperature,
    );

    expect(temperature?.fallbackSource).toBeNull();
  });

  it('names no provider outside the published MarineSource enum', () => {
    const published: readonly string[] = Object.values(MarineSource);

    expect(published).toEqual(['cmems', 'ecmwf']);
    for (const layer of MARINE_LAYER_CATALOGUE) {
      expect(published).toContain(layer.primarySource);
      if (layer.fallbackSource !== null) expect(published).toContain(layer.fallbackSource);
      // A layer that fell back to itself would be a routing bug the type system cannot see.
      expect(layer.fallbackSource).not.toBe(layer.primarySource);
    }
  });

  it('publishes a convention for every direction layer and a ramp for every magnitude layer', () => {
    for (const layer of MARINE_LAYER_CATALOGUE) {
      const isDirection = layer.unit === MarineUnit.DegreeTrue;
      // The arrow-unlock precondition: a bearing is only renderable if its convention is
      // published, and a bearing carries no magnitude ramp.
      expect(layer.directionConvention === null).toBe(!isDirection);
      if (isDirection) expect(layer.colorStops).toEqual([]);
      else expect(layer.colorStops.length).toBeGreaterThan(0);
    }
  });

  it('leaves the three STAC-sourced fields null until M3 fills them', () => {
    for (const layer of MARINE_LAYER_CATALOGUE) {
      expect(layer.horizonEndUtc).toBeNull();
      expect(layer.updateFrequency).toBeNull();
      expect(layer.catalogueUpdatedAtUtc).toBeNull();
      expect(layer.stepHours).toBe(3);
    }
  });
});
