import { z } from 'zod';
import { UpstreamSchemaError } from '../../upstream/upstream.types';
import type { CmemsDatasetSelector } from './cmems-routing';

/**
 * The STAC dataset-id resolver (plan §3.2, BINDING M4 acceptance criterion — closes ADDENDUM
 * §6.6 / AÇIK-4: dataset ids are NEVER hardcoded into the runtime).
 *
 * Source of truth: `{CMEMS_STAC_BASE_URL}/{PRODUCT_ID}/product.stac.json` — anonymous,
 * ~10–15 KB, measured 0.2–1.1 s. The document's `links[rel="item"]` hrefs carry the dataset
 * ids; the id's own tokens (variable, grid, time step, version stamp) are the ONLY selection
 * evidence used. Structured matching, not a one-shot regex over the whole document: every
 * token is compared on its own, so `2.5km` cannot match `detided-2.5km` and `phy-tem` /
 * `phy-temp` are both accepted where measured reality demands it.
 *
 * ## Fail-closed, loudly
 * No candidate matching every rule → the selector resolves to NOTHING and the caller
 * publishes `unavailable` with an alarm-level log. A "nearest similar dataset" fallback is
 * banned outright: it is how a Marmara point silently starts reading Black Sea water.
 */

/** One `links[rel=item]` entry after token parsing. */
export interface CmemsDatasetToken {
  /** The dataset id, e.g. `cmems_mod_blk_phy-temp_anfc_2.5km_PT1H-m_202511`. */
  readonly datasetId: string;
  readonly variableToken: string;
  readonly gridToken: string;
  /** `PT1H-m` or `PT1H-i` — anything else never parses (see the regex's rationale). */
  readonly timeToken: string;
  /** The 6-digit `_2xxxxx` version stamp, numeric so "newest wins" is an integer compare. */
  readonly stamp: number;
}

/**
 * Hourly forecast dataset ids ONLY (`PT1H-m` mean / `PT1H-i` instantaneous).
 *
 * Everything else — daily (`P1D`), monthly (`P1M`), 15-minute (`PT15M`), `static`
 * bathymetry/coordinates (which also carry a `--ext--…` suffix), de-tided variants — simply
 * fails to parse and is excluded structurally rather than by an ever-growing denylist. The
 * grid token still admits `.` and `-` (`4.2km-2D`, `mrm-500m`, `detided-2.5km`); exact grid
 * equality in {@link selectCmemsDataset} is what keeps the de-tided sets out.
 */
const DATASET_ID_PATTERN =
  /^cmems_mod_[a-z0-9]+_([a-z0-9-]+?)_anfc_([a-zA-Z0-9.-]+)_(PT1H-[a-z])_(2\d{5})$/;

/** Parse one item href/id into its tokens, or `null` when it is not an hourly forecast set. */
export function parseCmemsDatasetToken(itemHref: string): CmemsDatasetToken | null {
  // ## Href robustness (review #81 M7 — measured decision at wiring time)
  // Measured 2026-08-02 against all four routed products: every `links[rel=item]` href is the
  // plain relative form `<datasetId>/dataset.stac.json` — no leading `./`, no absolute URL.
  // The parser still tolerates both, cheaply, by scanning PATH SEGMENTS for the dataset-id
  // pattern instead of pinning "the id is the first segment": a provider switching to
  // `./<id>/dataset.stac.json` or `https://host/…/<id>/dataset.stac.json` would otherwise
  // fail-close the WHOLE CMEMS side on a cosmetic href change — loud, but a code-change outage
  // for something a segment scan absorbs for free. The pattern is anchored (`^…$` per segment),
  // so this cannot loosen WHAT is accepted, only WHERE in the href it may sit. A bare id is
  // accepted too, so the same parser serves committed-artifact assertions.
  for (const segment of itemHref.split('/')) {
    if (segment.length === 0 || segment === '.' || segment === '..') continue;
    const match = DATASET_ID_PATTERN.exec(segment);
    if (match === null) continue;
    const [, variableToken, gridToken, timeToken, stampRaw] = match;
    if (
      variableToken === undefined ||
      gridToken === undefined ||
      timeToken === undefined ||
      stampRaw === undefined
    ) {
      return null;
    }
    return { datasetId: segment, variableToken, gridToken, timeToken, stamp: Number(stampRaw) };
  }
  return null;
}

/**
 * The subset of a `product.stac.json` this adapter reads — verified live 2026-08-02 against
 * all four products. Unknown keys are stripped by zod, so provider additions cost nothing.
 */
const productStacSchema = z.object({
  id: z.string().min(1),
  license: z.string().min(1),
  'sci:doi': z.string().min(1).optional(),
  extent: z.object({
    temporal: z.object({
      // STAC allows nulls for open-ended intervals; the first interval is the envelope.
      interval: z.array(z.tuple([z.string().nullable(), z.string().nullable()])).min(1),
    }),
  }),
  properties: z
    .object({
      updateFrequencies: z.record(z.string(), z.string().nullable()).optional(),
      admp_updated: z.string().optional(),
    })
    .optional(),
  links: z.array(
    z.object({
      rel: z.string(),
      href: z.string(),
    }),
  ),
});

export type CmemsProductStacDoc = z.infer<typeof productStacSchema>;

/** Parse a product STAC body; a shape mismatch is contract drift → `schema_error` upstream. */
export function parseCmemsProductStac(body: string): CmemsProductStacDoc {
  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch (error: unknown) {
    throw new UpstreamSchemaError(
      `product STAC body is not JSON: ${error instanceof Error ? error.message : 'unknown'}`,
    );
  }
  const parsed = productStacSchema.safeParse(raw);
  if (!parsed.success) {
    throw new UpstreamSchemaError(
      `product STAC document does not match the expected shape: ${parsed.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ')}`,
    );
  }
  return parsed.data;
}

/** Why a selector matched nothing — carried into the alarm log and the probe artifact. */
export interface CmemsSelectionFailure {
  readonly datasetId: null;
  readonly reason: string;
}

export interface CmemsSelectionSuccess {
  readonly datasetId: string;
  readonly stamp: number;
}

export type CmemsSelection = CmemsSelectionSuccess | CmemsSelectionFailure;

/**
 * Select the ONE dataset a selector names, from a product document's item list.
 *
 * Rules, in order (plan §3.2):
 *  (a) the variable token must be in the selector's accepted set;
 *  (b) the grid token must match EXACTLY;
 *  (c) only hourly (`PT1H-*`) ids ever reach this point (the parser enforces it);
 *  (d) among the remaining candidates the newest `_2xxxxx` stamp wins.
 *
 * Two DIFFERENT dataset ids sharing the newest stamp is treated as fail-closed ambiguity, not
 * a coin flip: it has never been observed, and inventing a tie-break would be choosing a sea
 * model by lexicography.
 */
export function selectCmemsDataset(
  itemHrefs: readonly string[],
  selector: CmemsDatasetSelector,
): CmemsSelection {
  const candidates = itemHrefs
    .map(parseCmemsDatasetToken)
    .filter((token): token is CmemsDatasetToken => token !== null)
    .filter(
      (token) =>
        selector.acceptedVariableTokens.includes(token.variableToken) &&
        token.gridToken === selector.gridToken,
    );

  if (candidates.length === 0) {
    return {
      datasetId: null,
      reason:
        `no hourly dataset in ${selector.productId} matches variable tokens ` +
        `[${selector.acceptedVariableTokens.join(', ')}] with grid "${selector.gridToken}" — ` +
        `fail-closed, publishing unavailable (never a "nearest similar" set)`,
    };
  }

  let newest = candidates[0];
  for (const candidate of candidates) {
    if (newest === undefined || candidate.stamp > newest.stamp) newest = candidate;
  }
  if (newest === undefined) {
    return { datasetId: null, reason: 'unreachable: candidate list lost its head' };
  }

  const tied = candidates.filter(
    (candidate) => candidate.stamp === newest.stamp && candidate.datasetId !== newest.datasetId,
  );
  if (tied.length > 0) {
    return {
      datasetId: null,
      reason:
        `ambiguous selection in ${selector.productId}: ` +
        `${[newest, ...tied].map((token) => token.datasetId).join(' vs ')} share stamp ` +
        `${String(newest.stamp)} — fail-closed rather than guessing between sea models`,
    };
  }

  return { datasetId: newest.datasetId, stamp: newest.stamp };
}

/** A product document reduced to what the runtime stores per resolution (plan §3.2). */
export interface CmemsProductResolution {
  readonly productId: string;
  /** STAC `license` field, verbatim (`proprietary` = the Copernicus Marine Service Licence). */
  readonly license: string;
  readonly doi: string | null;
  /** Product-level temporal envelope — the `time=` clamp's bounds. `null` = open-ended. */
  readonly temporalExtent: { readonly startUtc: string | null; readonly endUtc: string | null };
  /** Provider-verbatim compact string, e.g. `daily: 06:00; 20:00` (contract delta d2, M4b). */
  readonly updateFrequency: string | null;
  /** STAC `properties.admp_updated` — the catalogue's own change stamp (delta d3, M4b). */
  readonly admpUpdatedUtc: string | null;
  /** One entry PER SELECTOR asked for; a failed selector fails alone (per-basin isolation). */
  readonly selections: readonly {
    readonly selectorKey: string;
    readonly selection: CmemsSelection;
  }[];
}

/**
 * Resolve every given selector against one parsed product document.
 *
 * Selector failures are PER-ENTRY, deliberately: the Black Sea physics document serves both
 * the 2.5 km grid and the Marmara 500 m sub-model, and a provider rotation that breaks one
 * must not darken the other basin's field.
 */
export function resolveCmemsProduct(
  doc: CmemsProductStacDoc,
  selectors: readonly { readonly key: string; readonly selector: CmemsDatasetSelector }[],
): CmemsProductResolution {
  const itemHrefs = doc.links.filter((link) => link.rel === 'item').map((link) => link.href);
  const interval = doc.extent.temporal.interval[0] ?? [null, null];

  const updateFrequencies = doc.properties?.updateFrequencies;
  const updateFrequency =
    updateFrequencies === undefined
      ? null
      : Object.entries(updateFrequencies)
          .filter((entry): entry is [string, string] => entry[1] !== null)
          .map(([label, value]) => `${label}: ${value}`)
          .join(' | ') || null;

  return {
    productId: doc.id,
    license: doc.license,
    doi: doc['sci:doi'] ?? null,
    temporalExtent: { startUtc: interval[0], endUtc: interval[1] },
    updateFrequency,
    admpUpdatedUtc: doc.properties?.admp_updated ?? null,
    selections: selectors.map(({ key, selector }) => ({
      selectorKey: key,
      selection: selectCmemsDataset(itemHrefs, selector),
    })),
  };
}
