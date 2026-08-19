import { TERRAIN_SAMPLE_ZOOM } from './terrain/tile-math';
import { ELEVATION_PROFILE_SAMPLE_COUNT } from './elevation.types';
import type { ElevationAttributionDto } from './dto/elevation-attribution.dto';

/**
 * The licence surface of the elevation profile — DATA and a legal duty, not decoration.
 *
 * ## Why a compiled constant rather than a seeded table (the marine M5 / AFAD precedent)
 * A missing attribution row is not a degraded widget, it is a licence breach. As compiled
 * constants the breach is structurally impossible: the strings exist at compile time, a human
 * reads them in the diff, and the spec beside this file pins them byte for byte. A database that
 * was never seeded would otherwise serve derived elevations with no notice attached, 200 OK, and
 * nothing would surface it. Consequence: this leg ships no migration and no seed.
 *
 * ## Provenance — one row, read rather than remembered
 * Every string below comes from `provenance/integrations.md`, row
 * *"AWS Open Data — Terrain Tiles (Tilezen/Mapzen), terrarium tiles"*, and from the
 * `2026-08-19 · AWS Open Data — Terrain Tiles` entry of `provenance/datasets.md` that it cites.
 * They are `CONTENT-STYLE.md` §22's **dokunulmaz** class: never translated, shortened, re-cased
 * or re-punctuated. The duty not to touch them comes from the licence texts themselves — joerd,
 * USGS, NOAA and the CLMS data policy — not from §22, whose own "en kısa formda" qualifier would
 * point the other way; where the two could be read against each other, the licence text wins and
 * the line is carried whole (the ledger states this explicitly).
 *
 * ## THREE notices, and why that is not the two the plan proposed
 * `plan-api.md` §5.1 and SPEC §8.2 proposed publishing two lines and named the ETOPO1/NOAA line
 * as deliberately NOT owed, reasoning from the z12 pin: ETOPO1 is absent from the tile mix at
 * z ≥ 11 (measured, and re-measured by the PR-E1 probe), so crediting NOAA would credit a source
 * we do not read.
 *
 * The provenance ledger — which `CONVENTIONS.md` §7 makes the sole home of a provider's posture
 * and go-live conditions — reaches the opposite conclusion on the SAME measurement, and it is
 * later: it records THREE lines as owed, on the ground that the duty is assessed on Türkiye's
 * surface as measured (where EU-DEM, SRTM, GMTED2010 **and** ETOPO1 all appear in real tile
 * headers), and its go-live obligation reads *"the three attribution lines rendered and correct
 * on every surface serving a profile"*. The task manifest for this PR restates that as a binding
 * instruction. So three are published, and the tension is recorded here rather than silently
 * resolved: this file publishes the credit the ledger says is owed, while
 * {@link ELEVATION_SEA_DEPTH_INCLUDED} states in the payload that this surface shows no sea depth
 * and the tile client REFUSES a tile whose headers actually carry `etopo1`. If Atlas re-rules
 * toward two lines, this docblock is the place the decision is re-opened from.
 *
 * ## What is deliberately NOT published, named so the wrong string is never copied
 * - `* Mapzen` and `© Mapzen, OpenStreetMap, and others` — those address users of **Mapzen's
 *   hosted service**; we read the AWS bucket directly (ledger, AÇIK 1).
 * - The registry's "How to Cite" sentence — a citation convention, not a licence condition.
 * - Any endorsement claim. `CONVENTIONS.md` §7 and the CLMS data policy's third condition
 *   coincide here and bind for USGS, NOAA and the EU alike; the shared denylist
 *   (`src/common/attribution/endorsement-guard.ts`) runs over every string this leg serves in the
 *   spec — which catches known phrasings rather than proving non-endorsement, so a novel one
 *   still needs a human reading the diff.
 */

/** The provider, as credited. From the registry's `ManagedBy` field. */
export const TERRAIN_TILES_PROVIDER_NAME = 'Terrain Tiles (Mapzen, a Linux Foundation project)';

/** The AWS Open Data registry entry. */
export const TERRAIN_TILES_DATASET_URL = 'https://registry.opendata.aws/terrain-tiles/';

/**
 * The registry's `License:` field is not a licence NAME — it points at this document, which is
 * where the required-attribution block lives.
 */
export const TERRAIN_TILES_LICENCE_URL =
  'https://github.com/tilezen/joerd/blob/master/docs/attribution.md';

/**
 * The three required notices, verbatim and in the ledger's own order.
 *
 * An array rather than one joined string because the lines we owe are a SUBSET of the document's
 * block, and which ones must be visible in the contract — a consumer that received one blob could
 * not tell a complete set from an abridged one.
 */
export const TERRAIN_TILES_REQUIRED_NOTICES_EN: readonly string[] = [
  'Europe terrain data produced using Copernicus data and information funded by the European Union - EU-DEM layers;',
  'Global ETOPO1 terrain data U.S. National Oceanic and Atmospheric Administration',
  'United States 3DEP (formerly NED) and global GMTED2010 and SRTM terrain data courtesy of the U.S. Geological Survey.',
];

/**
 * NOAA's separate limit on ETOPO1, verbatim.
 *
 * It is NOT a §7 commercial-use question and it is not a general disclaimer: it binds any surface
 * that shows SEA DEPTH. This one does not — see {@link ELEVATION_SEA_DEPTH_INCLUDED} — so the
 * string travels with the payload as machine-readable metadata rather than as prose a consumer
 * must decide when to render. The pair is the whole discharge of the ledger's *"the ETOPO1
 * navigation limit stated wherever sea depth is shown"* obligation: the condition is published
 * beside the string, so a future surface that DOES show depth cannot fail to find it.
 */
export const TERRAIN_TILES_NAVIGATION_LIMIT_EN = 'Not to be used for navigation';

/**
 * Whether this leg's payload can contain sea depth. `false`, structurally.
 *
 * The sampling zoom is pinned at z12, where the measured sea reading is exactly 0.00 m at every
 * one of the five sea points the SPEC and the PR-E1 probe both tested, and where `etopo1` is
 * absent from the tile mix. A tile that arrives carrying `etopo1` anyway is refused by the tile
 * client rather than sampled, so there is no branch on which a depth can reach a response.
 */
export const ELEVATION_SEA_DEPTH_INCLUDED = false;

/**
 * The method statement — a LICENCE obligation, not an explanation we chose to write.
 *
 * GMTED2010's terms: *"Any user who modifies the data is obligated to describe the types of
 * modifications they perform."* The CLMS data policy's second condition says the same thing for
 * the EU-DEM half. Reading a tile is not redistribution, but a PUBLISHED derived elevation
 * carries its method beside it — which zoom, how many points, which interpolation. It may not be
 * abridged (SPEC §8.2).
 *
 * COMPOSED from the two constants rather than typed as a literal: the zoom and the sample count
 * each appear in exactly one place in this repo, and a sentence that restated them would be a
 * second copy no tool cross-checks — the drift class this codebase names in three other files.
 * The spec beside this one pins the composed RESULT, so the sentence is still byte-asserted.
 *
 * `rakım` and not `yükseklik`: `GLOSSARY.md` §4.3 rules that a third word for the same concept
 * is not used in published field names or reader-facing text, and `rakım` (§3) is the point value
 * these numbers are. SPEC §8.3 and `plan-api.md` §5.2 pre-date that glossary row and proposed
 * `Yükseklikler`.
 */
export const TERRAIN_TILES_METHOD_NOTE_TR =
  `Rakımlar, ${String(TERRAIN_SAMPLE_ZOOM)}. yakınlaştırma düzeyindeki arazi karolarından hat ` +
  `boyunca ${String(ELEVATION_PROFILE_SAMPLE_COUNT)} noktada okunur. Her nokta, en yakın dört ` +
  `ızgara hücresinin ağırlıklı ortalamasıdır.`;

/** The English twin of {@link TERRAIN_TILES_METHOD_NOTE_TR}. Same two sentences, same order. */
export const TERRAIN_TILES_METHOD_NOTE_EN =
  `Elevations are read from terrain tiles at zoom level ${String(TERRAIN_SAMPLE_ZOOM)}, at ` +
  `${String(ELEVATION_PROFILE_SAMPLE_COUNT)} points along the line. Each point is the weighted ` +
  `average of its four nearest grid cells.`;

/**
 * The accuracy caveat, shown at the point of use.
 *
 * SPEC §8.3's sentence, carried unchanged except for the glossary word above. It exists because
 * the measurement demanded it: the decoder reads 3 829 m at the Erciyes summit against a
 * published 3 917 m, a ~88 m gap that is not a defect but a property of gridded data, and a
 * student who does not know it writes the tool's number into their homework.
 *
 * `CONTENT-STYLE.md` §22's eksik-vurgusu litmus is met the loud way: a reader who does not know
 * this limit acts on a wrong expectation, so the limit is stated, neutrally, where it is used.
 * §16: two independent facts, one semicolon, no em-dash. §17: no em-dash.
 */
export const TERRAIN_TILES_ACCURACY_NOTE_TR =
  'Rakımlar ızgara verisinden okunur; sivri zirvelerde gerçek değerden birkaç on metre düşük ' +
  'çıkabilir.';

/** The English twin of {@link TERRAIN_TILES_ACCURACY_NOTE_TR}. */
export const TERRAIN_TILES_ACCURACY_NOTE_EN =
  'Elevations are read from gridded data; at sharp peaks they can read a few tens of metres ' +
  'below the true value.';

/**
 * The informational Turkish rendering of where the data comes from.
 *
 * It stands ALONGSIDE the English notices and can never replace them (the marine `explanationTr`
 * precedent). One is the licence text owed; this one describes what the reader is looking at.
 *
 * ## The list is the LEDGER's measurement, minus the one family this zoom cannot read
 * `provenance/integrations.md`'s Terrain Tiles row measured Türkiye's surface rather than inferring
 * it, and records the mix as *"EU-DEM, SRTM, GMTED2010 and ETOPO1 all appear in real tile headers
 * over Turkey"*. Those four are the whole population; the published sentence is that set minus
 * ETOPO1, which is the sea-depth family the z12 pin exists to keep out and which the tile client
 * refuses outright (see {@link ELEVATION_SEA_DEPTH_INCLUDED}).
 *
 * It is NOT derived from `ATTRIBUTION_COVERED_SOURCE_FAMILIES`, and the distinction is the whole
 * finding this docblock was rewritten for (review #124, CF124-I1). That constant answers *"which
 * families would our published credit already cover if one appeared?"* — a deliberately permissive
 * superset, which is why it carries `3dep` and `ned`. This sentence answers *"what is the reader's
 * own number made of?"*, and 3DEP is a United States programme that appears in no measurement over
 * Türkiye at any zoom. Publishing the superset as an affirmative claim stated a source we do not
 * read, in the reader's language, on a licence-adjacent surface.
 *
 * §16: one fact per sentence, no semicolon. §17: no em-dash.
 */
export const TERRAIN_TILES_EXPLANATION_TR =
  'Rakım verisi, AWS Open Data üzerinden yayımlanan Terrain Tiles arazi karolarından okunur. ' +
  'Karolar EU-DEM, SRTM ve GMTED2010 verilerini birleştirir.';

/**
 * The attribution block carried by EVERY response of this leg — including the ones where nothing
 * resolved.
 *
 * The notice attaches to the published SECTION, not to whether a particular sample came back
 * (the `buildEarthquakeAttributions` / `buildMarineAttributions` reasoning): a licence notice that
 * blinks with provider health discharges nothing.
 *
 * A fresh object and a fresh array per call, deliberately: they are handed to the serializer, and
 * a shared frozen instance would turn any future mutation by a consumer into a cross-request bug.
 */
export function buildElevationAttribution(): ElevationAttributionDto {
  return {
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
  };
}
