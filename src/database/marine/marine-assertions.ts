import { MarineLayerId, MarineSource, SeaBasin } from '../../marine/marine.types';
import { haversineKm, isInsideBoundingBox } from './geo';
import {
  BASIN_BOUNDING_BOXES,
  BASIN_CMEMS_ROUTING,
  MARINE_POINT_CANDIDATES,
  MARMARA_CROSS_CHECK_LAYER,
  OPEN_METEO_MAX_GRID_DISTANCE_KM,
  SST_MAX_C,
  SST_MIN_C,
  TWO_SEA_MIN_SEPARATION_KM,
} from './marine-candidates';
import type {
  CmemsProbeResult,
  LayerSupportEntry,
  MarineProbeEntry,
  MarinePointsProbeArtifact,
  ProbeAssertionResult,
} from './marine-artifact.types';

/**
 * The hardened `probe` acceptance criteria (SPEC-ADDENDUM §4.5).
 *
 * ## Why this file is pure, and why BOTH phases run it
 * SPEC v1 asked for "one query per provider" per point. That is not enough: a single
 * "the provider answered" tick hides the case where four of five fields came back null. So the
 * five fields are checked SEPARATELY, plus numeric grid thresholds, plus three independent
 * basin claims.
 *
 * The functions take a recorded artifact entry, never a live response. That is what lets
 * `--phase=load` RE-DERIVE every verdict offline instead of trusting the `assertions` array the
 * probe wrote — a hand-edited or half-regenerated artifact then fails at load rather than
 * seeding a wrong point. It is also why they are unit-testable against synthetic fixtures with
 * no network.
 */

/** A named error, so an operator never has to guess which import produced a bare throw. */
export class MarineImportError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(`[db:import:marine-points] ${message}`, options);
    this.name = 'MarineImportError';
  }
}

function pass(id: string, detail: string): ProbeAssertionResult {
  return { id, passed: true, detail };
}

function check(id: string, passed: boolean, detail: string): ProbeAssertionResult {
  return { id, passed, detail };
}

/**
 * A recorded CMEMS call must be a clean JSON 200 before anything it says is believed.
 *
 * The provider's error path is HTTP 400 with a `text/xml` OWS `ExceptionReport` body — calling
 * `.json()` on it throws, and treating a 400 as "no value here" would quietly turn our own
 * malformed request into "this sea has no data". Content type is therefore asserted, not
 * assumed.
 */
function assertTransport(id: string, result: CmemsProbeResult): ProbeAssertionResult {
  if (result.httpStatus !== 200) {
    return check(id, false, `HTTP ${result.httpStatus} (expected 200) for ${result.requestUrl}`);
  }
  if (!result.contentType.toLowerCase().includes('application/json')) {
    return check(
      id,
      false,
      `content-type "${result.contentType}" is not application/json — the provider's error ` +
        `path is text/xml, so this response must not be read as data.`,
    );
  }
  return pass(id, `HTTP 200, ${result.contentType}`);
}

/** (c2) The provider must echo back the dataset we asked for. */
function assertDatasetEcho(id: string, result: CmemsProbeResult): ProbeAssertionResult {
  return check(
    id,
    result.datasetId === result.requestedDatasetId,
    `requested ${result.requestedDatasetId}, provider echoed ${String(result.datasetId)}`,
  );
}

/** (b) The grid centre the provider snapped to must be within the product's threshold. */
function assertGridDistance(
  id: string,
  distanceKm: number | null,
  maxKm: number,
  label: string,
): ProbeAssertionResult {
  if (distanceKm === null) {
    return check(id, false, `${label}: no grid centre returned, so no distance to check`);
  }
  return check(
    id,
    distanceKm <= maxKm,
    `${label}: ${distanceKm.toFixed(3)} km against a ${maxKm} km ceiling`,
  );
}

/**
 * Every per-point verdict for one entry, in a stable order.
 *
 * Pure: it reads only the entry and the static routing tables.
 */
export function evaluateProbeAssertions(entry: MarineProbeEntry): ProbeAssertionResult[] {
  const routing = BASIN_CMEMS_ROUTING[entry.seaBasin];
  const results: ProbeAssertionResult[] = [];

  // ── (a1) sea surface temperature: present AND physically plausible ────────
  const sst = entry.cmems.seaSurfaceTemperature;
  results.push(assertTransport('a1-sst-transport', sst));
  const sstValue = sst.value;
  results.push(
    check(
      'a1-sst-present',
      sstValue !== null && sstValue >= SST_MIN_C && sstValue <= SST_MAX_C,
      sstValue === null
        ? 'thetao returned null — the point is on a land cell for this dataset'
        : `thetao = ${sstValue} °C (accepted ${SST_MIN_C}–${SST_MAX_C})`,
    ),
  );
  results.push(assertDatasetEcho('c2-sst-dataset', sst));
  results.push(
    assertGridDistance('b1-sst-distance', sst.distanceKm, routing.maxGridDistanceKm, 'thetao'),
  );

  // ── (a2/a3) wave height and direction: PRESENT TOGETHER, or not supported ─
  const height = entry.cmems.waveHeight;
  const direction = entry.cmems.waveDirection;

  if (routing.wave === null) {
    // The Marmara. Not an outage and not a gap: CMEMS carries no wave field here at all, so
    // the correct probe outcome is "declared not_supported and NOT queried".
    results.push(
      check(
        'a2-wave-not-supported',
        entry.seaBasin === SeaBasin.Marmara && height === null && direction === null,
        `basin ${entry.seaBasin} has no CMEMS wave field; expected both wave calls to be skipped`,
      ),
    );
  } else {
    if (height === null || direction === null) {
      results.push(
        check(
          'a3-wave-pair',
          false,
          `basin ${entry.seaBasin} HAS a CMEMS wave field, but ` +
            `${height === null ? 'height' : 'direction'} was not queried`,
        ),
      );
    } else {
      results.push(assertTransport('a2-wave-height-transport', height));
      results.push(assertTransport('a3-wave-direction-transport', direction));
      results.push(
        check(
          'a2-wave-height-present',
          height.value !== null,
          height.value === null
            ? 'VHM0 returned null on a basin that has a wave field — the point is on a land cell'
            : `VHM0 = ${height.value} m`,
        ),
      );
      // The pair check, spelled out because it is the interesting one: one present and one
      // absent means the two variables disagree about whether this cell is water, which is a
      // provider/arithmetic fault rather than a legitimate gap.
      results.push(
        check(
          'a3-wave-pair',
          (height.value === null) === (direction.value === null),
          `VHM0 ${height.value === null ? 'null' : 'present'} vs VMDR ` +
            `${direction.value === null ? 'null' : 'present'} — they must agree`,
        ),
      );
      results.push(assertDatasetEcho('c2-wave-height-dataset', height));
      results.push(assertDatasetEcho('c2-wave-direction-dataset', direction));
      results.push(
        assertGridDistance(
          'b2-wave-distance',
          height.distanceKm,
          routing.maxGridDistanceKm,
          'VHM0',
        ),
      );
    }
  }

  // ── (a4/a5) wind, from Open-Meteo — CMEMS is an ocean service and has none ─
  const openMeteo = entry.openMeteo;
  results.push(
    check(
      'a4-wind-speed-present',
      openMeteo.windSpeed10m !== null,
      `wind_speed_10m = ${String(openMeteo.windSpeed10m)} m/s`,
    ),
  );
  results.push(
    check(
      'a5-wind-direction-present',
      openMeteo.windDirection10m !== null,
      `wind_direction_10m = ${String(openMeteo.windDirection10m)}°`,
    ),
  );
  results.push(
    assertGridDistance(
      'b3-open-meteo-distance',
      openMeteo.distanceKm,
      OPEN_METEO_MAX_GRID_DISTANCE_KM,
      'open-meteo',
    ),
  );

  // ── (c1) the SNAPPED centre — not our requested coordinate — is in the basin box ──
  // Checking the snapped centre is the point: our coordinate is what we typed, the centre is
  // where the provider actually read from, and only the second can reveal a drift.
  const gridLatitude = sst.gridLatitude;
  const gridLongitude = sst.gridLongitude;
  if (gridLatitude === null || gridLongitude === null) {
    results.push(
      check('c1-basin-box', false, 'no grid centre returned, so containment is unknown'),
    );
  } else {
    results.push(
      check(
        'c1-basin-box',
        isInsideBoundingBox(gridLatitude, gridLongitude, BASIN_BOUNDING_BOXES[entry.seaBasin]),
        `snapped centre ${gridLatitude.toFixed(4)}, ${gridLongitude.toFixed(4)} against the ` +
          `${entry.seaBasin} box`,
      ),
    );
  }

  // ── (c3) Marmara only: the Black Sea WAVE product must answer null here ───
  if (entry.seaBasin === SeaBasin.Marmara) {
    const crossCheck = entry.cmems.crossCheck;
    if (crossCheck === null) {
      results.push(check('c3-marmara-cross-check', false, 'the cross-check call was not made'));
    } else {
      results.push(assertTransport('c3-marmara-cross-check-transport', crossCheck));
      results.push(
        check(
          'c3-marmara-cross-check',
          crossCheck.value === null &&
            crossCheck.requestedDatasetId === MARMARA_CROSS_CHECK_LAYER.datasetId,
          crossCheck.value === null
            ? 'the Black Sea wave product returns null here, as a genuine Marmara point must'
            : `the Black Sea wave product returned ${crossCheck.value} — this point is NOT in ` +
                `the Marmara, it has drifted into Black Sea water`,
        ),
      );
    }
  } else {
    results.push(
      check(
        'c3-marmara-cross-check',
        entry.cmems.crossCheck === null,
        'cross-check applies to Marmara points only',
      ),
    );
  }

  return results;
}

/**
 * Run-level verdicts — the ones no single entry can answer.
 *
 * (c4) is the important one: the two points of a two-sea province must be more than 30 km
 * apart. Closer than that and, whatever the basin labels claim, both have almost certainly been
 * dropped into the same sea — the exact silent mis-mapping this whole two-phase design exists
 * to prevent.
 */
export function evaluateRunAssertions(
  entries: readonly MarineProbeEntry[],
): ProbeAssertionResult[] {
  const results: ProbeAssertionResult[] = [];

  const seenSlugs = new Set<string>();
  const duplicateSlugs: string[] = [];
  for (const entry of entries) {
    for (const slug of [entry.slugTr, entry.slugEn]) {
      if (seenSlugs.has(slug)) duplicateSlugs.push(slug);
      seenSlugs.add(slug);
    }
  }
  results.push(
    check(
      'run-unique-slugs',
      duplicateSlugs.length === 0,
      duplicateSlugs.length === 0
        ? `${String(seenSlugs.size)} distinct slugs`
        : `duplicate slug(s): ${duplicateSlugs.join(', ')}`,
    ),
  );

  const seenProvinceBasin = new Set<string>();
  const duplicatePairs: string[] = [];
  for (const entry of entries) {
    const key = `${entry.plateCode}:${entry.seaBasin}`;
    if (seenProvinceBasin.has(key)) duplicatePairs.push(key);
    seenProvinceBasin.add(key);
  }
  // Mirrors UNIQUE (province_plate_code, sea_basin) so the artifact fails BEFORE the database
  // does, with a message that names the pair instead of a constraint code.
  results.push(
    check(
      'run-unique-province-basin',
      duplicatePairs.length === 0,
      duplicatePairs.length === 0
        ? 'no province carries two points in the same basin'
        : `duplicate (province, basin): ${duplicatePairs.join(', ')}`,
    ),
  );

  const byPlate = new Map<string, MarineProbeEntry[]>();
  for (const entry of entries) {
    const bucket = byPlate.get(entry.plateCode);
    if (bucket) bucket.push(entry);
    else byPlate.set(entry.plateCode, [entry]);
  }

  const tooClose: string[] = [];
  const separations: string[] = [];
  for (const [plateCode, bucket] of byPlate) {
    if (bucket.length < 2) continue;
    for (let a = 0; a < bucket.length; a += 1) {
      for (let b = a + 1; b < bucket.length; b += 1) {
        const first = bucket[a];
        const second = bucket[b];
        if (first === undefined || second === undefined) continue;
        const km = haversineKm(first.latitude, first.longitude, second.latitude, second.longitude);
        separations.push(`${plateCode}: ${km.toFixed(1)} km`);
        if (km <= TWO_SEA_MIN_SEPARATION_KM) {
          tooClose.push(
            `${plateCode} (${first.seaBasin} ↔ ${second.seaBasin}) = ${km.toFixed(1)} km`,
          );
        }
      }
    }
  }
  results.push(
    check(
      'c4-two-sea-separation',
      tooClose.length === 0,
      tooClose.length === 0
        ? `two-sea separations, ceiling ${TWO_SEA_MIN_SEPARATION_KM} km: ${separations.join('; ') || 'none'}`
        : `too close: ${tooClose.join('; ')}`,
    ),
  );

  return results;
}

/**
 * Derive the (point, layer, source) support matrix from the recorded evidence.
 *
 * This is what the RUNTIME reads to decide `status: 'not_supported'` and to skip a call
 * entirely. Derived rather than declared: a hand-written matrix could claim support the probe
 * never observed.
 */
export function deriveLayerSupport(entry: MarineProbeEntry): LayerSupportEntry[] {
  const waveSupported = entry.cmems.waveHeight !== null && entry.cmems.waveHeight.value !== null;
  const waveReason =
    BASIN_CMEMS_ROUTING[entry.seaBasin].wave === null
      ? 'CMEMS carries no wave field in this basin — permanently, so no call is made'
      : waveSupported
        ? 'CMEMS returned a wave value at this point'
        : 'CMEMS returned null for the wave field at this point';

  return [
    {
      layerId: MarineLayerId.SeaSurfaceTemperature,
      source: MarineSource.Cmems,
      supported: entry.cmems.seaSurfaceTemperature.value !== null,
      reason: 'CMEMS temperature is available in all four basins',
    },
    {
      layerId: MarineLayerId.SeaSurfaceTemperature,
      source: MarineSource.OpenMeteo,
      supported: entry.openMeteo.seaSurfaceTemperature !== null,
      reason: 'Open-Meteo fallback for temperature',
    },
    {
      layerId: MarineLayerId.WaveHeight,
      source: MarineSource.Cmems,
      supported: waveSupported,
      reason: waveReason,
    },
    {
      layerId: MarineLayerId.WaveHeight,
      source: MarineSource.OpenMeteo,
      supported: entry.openMeteo.waveHeight !== null,
      reason: 'Open-Meteo wave height — the ONLY source in the Marmara',
    },
    {
      layerId: MarineLayerId.WaveDirection,
      source: MarineSource.Cmems,
      supported: entry.cmems.waveDirection !== null && entry.cmems.waveDirection.value !== null,
      reason: waveReason,
    },
    {
      layerId: MarineLayerId.WaveDirection,
      source: MarineSource.OpenMeteo,
      supported: entry.openMeteo.waveDirection !== null,
      reason: 'Open-Meteo wave direction — the ONLY source in the Marmara',
    },
    {
      layerId: MarineLayerId.WindSpeed10m,
      source: MarineSource.OpenMeteo,
      supported: entry.openMeteo.windSpeed10m !== null,
      reason: 'CMEMS is an ocean service and carries no wind field anywhere',
    },
    {
      layerId: MarineLayerId.WindDirection10m,
      source: MarineSource.OpenMeteo,
      supported: entry.openMeteo.windDirection10m !== null,
      reason: 'CMEMS is an ocean service and carries no wind field anywhere',
    },
  ];
}

/** Collected failures across every entry and the run itself, formatted for a human. */
export function collectAssertionFailures(artifact: MarinePointsProbeArtifact): string[] {
  const failures: string[] = [];

  for (const entry of artifact.entries) {
    for (const result of evaluateProbeAssertions(entry)) {
      if (!result.passed) failures.push(`${entry.slugTr} / ${result.id}: ${result.detail}`);
    }
  }
  for (const result of evaluateRunAssertions(artifact.entries)) {
    if (!result.passed) failures.push(`run / ${result.id}: ${result.detail}`);
  }

  return failures;
}

/**
 * The load phase's integrity gate: RE-DERIVE every verdict and refuse a disagreement.
 *
 * Two separate things are checked, and the second is the one that matters. First, everything
 * must pass. Second, the re-derived verdicts must MATCH the ones the probe recorded — because
 * the recorded array is a claim inside the file being validated, and a file cannot corroborate
 * itself. A hand-edited artifact that flips a `passed` flag is caught here, not at the seam
 * where a wrong point is already in the database.
 */
/**
 * The artifact must describe the CURRENT candidate list — the staleness gate.
 *
 * Without it the two-phase split has a hole that defeats its own purpose: edit a coordinate in
 * `marine-candidates.ts`, forget to re-probe, and `load` cheerfully seeds the OLD artifact. Every
 * assertion passes (they were true, once), the deploy is green, and the published point is a
 * coordinate nobody verified — the precise silent mis-mapping this design exists to prevent.
 *
 * Identity AND coordinates are compared, in order. Order matters because `displayOrder` is the
 * array index: moving a row changes the hub's sequence, so a reordered table with a stale
 * artifact is also a real divergence.
 */
export function assertArtifactMatchesCandidates(artifact: MarinePointsProbeArtifact): void {
  const drift: string[] = [];

  if (artifact.entries.length !== MARINE_POINT_CANDIDATES.length) {
    drift.push(
      `the artifact holds ${String(artifact.entries.length)} point(s), the candidate table has ` +
        `${String(MARINE_POINT_CANDIDATES.length)}`,
    );
  }

  for (const [index, candidate] of MARINE_POINT_CANDIDATES.entries()) {
    const entry = artifact.entries[index];
    if (entry === undefined) {
      drift.push(`${candidate.slugTr}: absent from the artifact`);
      continue;
    }
    for (const field of [
      'slugTr',
      'slugEn',
      'nameTr',
      'nameEn',
      'plateCode',
      'provinceNameTr',
      'seaBasin',
      'latitude',
      'longitude',
      'displayOrder',
    ] as const) {
      if (entry[field] !== candidate[field]) {
        drift.push(
          `${candidate.slugTr}.${field}: candidate table says ${JSON.stringify(candidate[field])}, ` +
            `artifact says ${JSON.stringify(entry[field])}`,
        );
      }
    }
  }

  if (drift.length > 0) {
    throw new MarineImportError(
      `the committed artifact does not describe the current candidate table — it is STALE. ` +
        `Re-run \`pnpm db:import:marine-points --phase=probe\`; do not seed a coordinate that was ` +
        `never probed:\n  ${drift.join('\n  ')}`,
    );
  }
}

/**
 * The evidence gate: the recorded verdicts must be reproducible from the recorded evidence, and
 * all of them must pass.
 *
 * Split from the staleness gate so each can be exercised on its own — and because they fail for
 * genuinely different reasons: this one means "a point was not verified", the other means "the
 * verification is out of date".
 */
export function assertProbeVerdictsAreSound(artifact: MarinePointsProbeArtifact): void {
  if (artifact.entries.length === 0) {
    throw new MarineImportError('the artifact contains no points. Re-run --phase=probe.');
  }

  const drifted: string[] = [];
  for (const entry of artifact.entries) {
    const recomputed = evaluateProbeAssertions(entry);
    const recordedById = new Map(entry.assertions.map((a) => [a.id, a]));
    for (const result of recomputed) {
      const recorded = recordedById.get(result.id);
      if (recorded === undefined) {
        drifted.push(`${entry.slugTr} / ${result.id}: absent from the recorded assertions`);
      } else if (recorded.passed !== result.passed) {
        drifted.push(
          `${entry.slugTr} / ${result.id}: artifact says passed=${String(recorded.passed)}, ` +
            `re-derivation says ${String(result.passed)}`,
        );
      }
    }
  }
  if (drifted.length > 0) {
    throw new MarineImportError(
      `the artifact's recorded verdicts do not match a re-derivation from its own evidence — ` +
        `it has been edited or partially regenerated:\n  ${drifted.join('\n  ')}`,
    );
  }

  const failures = collectAssertionFailures(artifact);
  if (failures.length > 0) {
    throw new MarineImportError(
      `${String(failures.length)} probe assertion(s) FAILED — refusing to seed a point that was ` +
        `not verified against a live provider response:\n  ${failures.join('\n  ')}`,
    );
  }
}

/**
 * The load phase's full integrity gate: the artifact must be CURRENT and it must be SOUND.
 *
 * Staleness is checked first, deliberately. If the candidate table moved, every downstream
 * complaint would be about coordinates that are no longer proposed, and the operator would be
 * debugging the wrong thing — the useful message is "re-probe", not "assertion X failed".
 */
export function assertArtifactIsLoadable(artifact: MarinePointsProbeArtifact): void {
  assertArtifactMatchesCandidates(artifact);
  assertProbeVerdictsAreSound(artifact);
}
