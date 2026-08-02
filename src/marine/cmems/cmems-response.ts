import { z } from 'zod';
import { UpstreamSchemaError, type UpstreamParseResult } from '../../upstream/upstream.types';
import { haversineKm } from './cmems-geo';
import {
  CMEMS_UNIT_NORMALISATION,
  CMEMS_VARIABLE_IDS,
  isPlausibleCmemsValue,
  type CmemsLayerField,
} from './cmems.constants';
import type { MarineUnit } from '../marine.types';

/**
 * The GetFeatureInfo response contract: zod schema, unit normalisation, the plausibility
 * window and the snap guard — everything between "HTTP 200 + JSON" and "a number we may cache".
 *
 * This module is a PARSE layer: it runs inside `UpstreamHttpClient`'s `parse` callback, i.e.
 * strictly AFTER the status and content-type guards. The measured CMEMS error path (HTTP 400 +
 * `text/xml` OWS ExceptionReport) therefore never reaches this code — the client has already
 * classified it as `client_error` before any body parse (guard order, review #73 CRITICAL
 * lineage). A unit test pins that ordering with the recorded 400 fixture.
 */

/**
 * The one feature's `properties` — and NOTHING else.
 *
 * **`geometry` is deliberately absent from this schema and must never be added.** The provider
 * emits `geometry.coordinates` as `[latitude, longitude]` — the REVERSE of the GeoJSON
 * standard's `[longitude, latitude]`. Anything consuming it as GeoJSON places every Turkish
 * point in the Indian Ocean, silently, since both numbers are valid coordinates (measured
 * 2026-07-30, re-verified 2026-08-02). `properties.lat`/`properties.lon` are unambiguous and
 * are the only coordinates read.
 */
const getFeatureInfoSchema = z.object({
  features: z
    .array(
      z.object({
        properties: z.object({
          lat: z.number(),
          lon: z.number(),
          variableId: z.string().min(1),
          datasetId: z.string().min(1),
          /** `null` is the provider's land-mask / gap answer — a legitimate `no_data`. */
          value: z.number().nullable(),
          units: z.string().min(1),
        }),
      }),
    )
    .min(1),
});

/** One CMEMS value as cached and served — the payload under `marine:cmems:value:*` (M4b). */
export interface CmemsPointValue {
  readonly value: number;
  readonly unit: MarineUnit;
  /** Verbatim provider echo, `PRODUCT/dataset` — published on the DTO's `datasetId`. */
  readonly datasetId: string;
  readonly gridLatitude: number;
  readonly gridLongitude: number;
  readonly distanceKm: number;
  /** The `time=` WE sent (the reply carries no time field), hour-aligned ISO UTC. */
  readonly validAtUtc: string;
}

/** Round OUR computed distance to 0.1 m so grid-exact snaps do not read as float noise. */
function roundKm(km: number): number {
  return Math.round(km * 10_000) / 10_000;
}

export interface ParseCmemsOptions {
  readonly field: CmemsLayerField;
  /** The coordinate the URL was built for — the snap distance's origin. */
  readonly requestedLatitude: number;
  readonly requestedLongitude: number;
  /** Basin snap ceiling (SPEC-ADDENDUM §4.5(b)); a breach means OUR arithmetic is broken. */
  readonly maxGridDistanceKm: number;
  /** The explicit `time=` sent — becomes `validAtUtc` verbatim. */
  readonly timeIso: string;
  readonly validAtMs: number;
}

/**
 * Turn a 200 GetFeatureInfo body into a {@link CmemsPointValue}, `no_data`, or a thrown
 * {@link UpstreamSchemaError} (→ `schema_error`, alarm-level, 300 s negative TTL).
 *
 * The guards, in order, and why each one throws rather than repairs:
 *  1. **Shape** — zod. A drifted payload is R2, the "everything green while publishing
 *     nothing" alarm class.
 *  2. **Echoed variable id** — a reply about a different variable than asked is a routing bug
 *     (ours or the provider's); labelling its number with our field would be silent mixing.
 *  3. **`null` value → `no_data`** — the land-mask answer, quiet by design (24 h TTL).
 *  4. **Unit, EXACT** — `degrees_C`/`m`/`degree` measured; anything else is a unit drift whose
 *     number would still look plausible, the most insidious wrong-number class.
 *  5. **Plausibility window** — wide physics only (−5..45 °C, 0..30 m, [0,360)°).
 *  6. **Snap guard** — grid-centre distance over the basin ceiling means the tile arithmetic
 *     picked the wrong cell; publishing that value would be publishing a different sea.
 */
export function parseCmemsGetFeatureInfo(
  body: string,
  options: ParseCmemsOptions,
): UpstreamParseResult<CmemsPointValue> {
  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch (error: unknown) {
    throw new UpstreamSchemaError(
      `GetFeatureInfo body is not JSON: ${error instanceof Error ? error.message : 'unknown'}`,
    );
  }

  const parsed = getFeatureInfoSchema.safeParse(raw);
  if (!parsed.success) {
    throw new UpstreamSchemaError(
      `GetFeatureInfo response does not match the expected shape: ${parsed.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ')}`,
    );
  }
  const first = parsed.data.features[0];
  if (first === undefined) {
    throw new UpstreamSchemaError('GetFeatureInfo response carries zero features');
  }
  const properties = first.properties;

  const expectedVariableId = CMEMS_VARIABLE_IDS[options.field];
  if (properties.variableId !== expectedVariableId) {
    throw new UpstreamSchemaError(
      `GetFeatureInfo echoed variable "${properties.variableId}" for a request about ` +
        `"${expectedVariableId}" — refusing to label one variable's number as another's`,
    );
  }

  if (properties.value === null) {
    return {
      kind: 'no_data',
      reason: `provider returned null for ${expectedVariableId} here (land mask / gap)`,
    };
  }

  const normalisation = CMEMS_UNIT_NORMALISATION[options.field];
  if (properties.units !== normalisation.raw) {
    throw new UpstreamSchemaError(
      `GetFeatureInfo unit drift: got "${properties.units}" for ${expectedVariableId}, the ` +
        `measured contract says "${normalisation.raw}" — a unit error still looks like a ` +
        `plausible number, so this refuses loudly`,
    );
  }

  if (!isPlausibleCmemsValue(options.field, properties.value)) {
    throw new UpstreamSchemaError(
      `GetFeatureInfo value ${String(properties.value)} for ${expectedVariableId} is outside ` +
        `the plausibility window — refusing to publish an implausible number (R2)`,
    );
  }

  const distanceKm = roundKm(
    haversineKm(
      options.requestedLatitude,
      options.requestedLongitude,
      properties.lat,
      properties.lon,
    ),
  );
  if (distanceKm > options.maxGridDistanceKm) {
    throw new UpstreamSchemaError(
      `grid-centre snap ${String(distanceKm)} km exceeds the ${String(options.maxGridDistanceKm)} ` +
        `km basin ceiling — GetFeatureInfo answers the cell the pixel LANDS IN, so this means ` +
        `our tile arithmetic picked the wrong cell, not that data is far away`,
    );
  }

  return {
    kind: 'ok',
    validAtMs: options.validAtMs,
    value: {
      value: properties.value,
      unit: normalisation.canonical,
      datasetId: properties.datasetId,
      gridLatitude: properties.lat,
      gridLongitude: properties.lon,
      distanceKm,
      validAtUtc: options.timeIso,
    },
  };
}
