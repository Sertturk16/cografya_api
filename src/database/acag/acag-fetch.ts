import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { SEED_PROVINCES } from '../seeds/province.seed-data';
import {
  ACAG_EXPECTED_FIRST_YEAR,
  ACAG_EXPECTED_LAST_YEAR,
  ACAG_EXPECTED_PROVINCE_COUNT,
  assertAllPassed,
  runAcagStructuralAssertions,
} from './acag-assertions';
import {
  ACAG_DATASET_URL,
  ACAG_DATASET_VERSION,
  ACAG_LICENCE_NAME,
  ACAG_LICENCE_URL,
} from '../../province/acag-attribution.constant';
import {
  ACAG_ARTIFACT_SCHEMA_VERSION,
  ACAG_MANIFEST_FILE_NAME,
  ACAG_SERIES_FILE_NAME,
  type AcagFileRecord,
  type AcagManifest,
  type AcagProvinceRecord,
  type AcagSeriesArtifact,
} from './acag-artifact.types';
import {
  analyseWindowGeometry,
  assertSameGrid,
  readYearValues,
  selectAcagCells,
  type AcagCellSelection,
  type AcagGridGeometry,
} from './acag-extract';
import { readAcagWindow, readDecoderIdentity, type AcagWindow } from './acag-hdf5.adapter';
import { AcagContractError } from './acag.errors';

/**
 * `--phase=fetch` — the ONLY phase that touches the network (ENGINEERING §5).
 *
 * Run BY HAND. Polite by construction: **serial** (never parallel), spaced by
 * {@link REQUEST_SPACING_MS} between files, timed out per request, and identifying itself with a
 * real contact address in the User-Agent.
 *
 * ## Peak disk stays one file, not the whole corpus
 * 27 annual files × ~450 MB is ~12.2 GB of transfer, which Atlas authorised — but not 12.2 GB
 * resident. Each year is downloaded → hashed → its window decoded → the 81 values extracted →
 * **the raw file deleted** before the next year starts. Peak disk is therefore ~450 MB.
 * `--keep-raw` opts out for debugging; it never becomes the default, and the manifest records
 * which happened per file.
 *
 * ## No API key exists on this line
 * ACAG/S3 serves these objects anonymously (measured: an unauthenticated `list-type=2` returns
 * 200). So the key-redaction corollary of ENGINEERING §5 has nothing to bind to here: there is no
 * key to read from `process.env`, none to redact from a log line, and none that could reach an
 * artifact. That is stated rather than implemented — a scan for a secret this line never handles
 * would be scaffolding that verifies nothing.
 *
 * ## Why the whole corpus is decoded before ANYTHING is written
 * The artifacts are written once, at the end, after the structural gate passes. A run that failed
 * on year 19 must not leave 18 years of half-corpus on disk looking like a finished artifact.
 */

/** The bucket the AWS Registry of Open Data record points at (`surface-pm2-5-v6gl`). */
export const ACAG_BUCKET_BASE_URL = 'http://satpmdata.s3.amazonaws.com';

/**
 * The provider's own dot-free spelling of the version, as it appears in S3 keys and file names
 * (`V6.GL.03` → `V6GL03`).
 *
 * DERIVED from {@link ACAG_DATASET_VERSION} rather than written out, so the version identity has
 * exactly one editable home (review CODE123-I1). Bumping the version constant moves the download
 * path, the file names, the artifact pins and the published attribution together; before this,
 * an operator could bump the three in `src/database/acag/` and leave the licence block naming the
 * previous release. The spec pins the derivation's current output so the transformation itself
 * cannot drift silently.
 */
export const ACAG_VERSION_TOKEN = ACAG_DATASET_VERSION.replaceAll('.', '');

/**
 * The GLOBAL fine-resolution annual series.
 *
 * **Not a regional tile, and this is load-bearing.** Measured 2026-08-19: the EU tile spans
 * −14.995…39.995°E and the AF tile stops at 38.005°N, so 12 provinces (Ağrı, Ardahan, Artvin,
 * Bayburt, Bingöl, Bitlis, Erzurum, Iğdır, Kars, Muş, Rize, Van) are covered by NO tile. Only the
 * global file reaches 81/81.
 */
export const ACAG_KEY_PREFIX = `${ACAG_VERSION_TOKEN}/FineResolution/GL/Annual`;

/** Spacing between two downloads. Nothing here is time-critical; the provider is a university. */
export const REQUEST_SPACING_MS = 2_000;

/** Per-request ceiling. A 450 MB body over a slow link still finishes well inside this. */
export const REQUEST_TIMEOUT_MS = 15 * 60 * 1000;

/** Identifies the client and gives the provider a way to reach us. */
export const ACAG_USER_AGENT =
  'cografya-platform/1.0 (+https://github.com/Sertturk16; contact o.can.sertturk@gmail.com)';

/**
 * The window read from the global grid: Türkiye's bounding box.
 *
 * The same box the ERA5 line requested from Copernicus (`data/era5-land/era5-manifest.json`
 * `areaSent` = N 42.5 · W 25.5 · S 35.5 · E 45), widened by 0.2° so no province centre can land
 * on the window's edge. Cutting the window from a fixed box rather than from the province set
 * keeps the decode deterministic and reviewable.
 */
export const ACAG_WINDOW = {
  minLatitude: 35.3,
  maxLatitude: 42.7,
  minLongitude: 25.3,
  maxLongitude: 45.2,
} as const;

export function acagFileNameForYear(year: number): string {
  return `${ACAG_VERSION_TOKEN}.CNNPM25.GL.${String(year)}01-${String(year)}12.nc`;
}

export function acagObjectKeyForYear(year: number): string {
  return `${ACAG_KEY_PREFIX}/${acagFileNameForYear(year)}`;
}

export function acagUrlForYear(year: number): string {
  return `${ACAG_BUCKET_BASE_URL}/${acagObjectKeyForYear(year)}`;
}

export function acagYears(): number[] {
  const years: number[] = [];
  for (let year = ACAG_EXPECTED_FIRST_YEAR; year <= ACAG_EXPECTED_LAST_YEAR; year += 1) {
    years.push(year);
  }
  return years;
}

export interface AcagFetchOptions {
  /** Absolute directory for the raw `.nc` files. MUST be outside the repo. */
  rawDir: string;
  /** Absolute directory the committed artifacts are written to. */
  outputDir: string;
  /** Read already-downloaded files from `rawDir` instead of hitting the network. */
  fromDir: boolean;
  /** Keep the raw `.nc` after extraction (debugging only). */
  keepRaw: boolean;
  log: (message: string) => void;
}

export interface AcagFetchResult {
  manifest: AcagManifest;
  series: AcagSeriesArtifact;
  manifestPath: string;
  seriesPath: string;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * SHA-256 of a file, STREAMED (review CODE123-M13 / SFH123-M3).
 *
 * The previous form was `hash.update(await readFile(path))`, which buffers the whole ~450 MB file
 * into the heap — in the module that streams the download precisely to avoid that, and whose
 * adapter argues the entire `h5wasm`-over-`jsfive` choice on a memory budget.
 */
async function sha256OfFile(path: string): Promise<string> {
  const hash = createHash('sha256');
  await pipeline(createReadStream(path), hash);
  return hash.digest('hex');
}

/**
 * Download one year to a `.part` file, VERIFY it, then rename it into place
 * (review CODE123-I3 / SFH123-M5).
 *
 * ## Why the rename is the whole point
 * Writing straight to the final name makes an interrupted transfer indistinguishable from a
 * complete one. That is not a hypothetical on this line: 27 files × ~450 MB over ~70 minutes is a
 * run where a dropped connection is the ORDINARY failure. The operator then does the documented
 * thing — re-run with `--from-dir`, the offline half — and `stat()` finds the truncated file under
 * its final name, `assertHdf5Magic` passes (the superblock is at byte 0), and `sha256OfFile`
 * writes the truncated file's digest into the manifest as that year's permanent provenance. If the
 * truncation fell past the Türkiye window the decode even succeeds, and 81 values are published
 * from a partial file whose recorded hash matches nothing the provider ever served — making the
 * README's "a copy can always be proven to be *the* copy" false, silently.
 *
 * A partial file now never carries the final name, so `--from-dir` cannot see one. This is the
 * `era5-fetch.ts` choreography, which the `.gitignore` entry added by this line already
 * anticipated (`*.nc.part`).
 */
async function downloadYear(
  year: number,
  target: string,
  log: (m: string) => void,
): Promise<number> {
  const url = acagUrlForYear(year);
  const partial = `${target}.part`;
  // A leftover `.part` from an earlier interrupted run must not be appended to or mistaken for
  // this run's bytes.
  await rm(partial, { force: true });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let declaredBytes: number | null = null;
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': ACAG_USER_AGENT, Accept: 'application/octet-stream' },
    });
    if (!response.ok) {
      throw new AcagContractError(
        `GET ${url} → HTTP ${String(response.status)} ${response.statusText}.`,
      );
    }
    if (response.body === null) {
      throw new AcagContractError(`GET ${url} returned no body.`);
    }
    const contentLength = response.headers.get('content-length');
    if (contentLength !== null && /^\d+$/.test(contentLength)) {
      declaredBytes = Number(contentLength);
    }
    // Streamed to disk: a 450 MB body must never be buffered whole in the heap.
    await pipeline(
      Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]),
      createWriteStream(partial),
    );
  } finally {
    clearTimeout(timer);
  }

  const { size } = await stat(partial);
  if (size === 0) {
    throw new AcagContractError(`GET ${url} wrote 0 bytes.`);
  }
  // The provider's own declaration is the only independent statement of how big the file should
  // be; `stat()` alone can only say what we happened to write. When the header is absent the run
  // says so on the log line below rather than claiming a verification it did not perform.
  if (declaredBytes !== null && declaredBytes !== size) {
    throw new AcagContractError(
      `GET ${url}: wrote ${String(size)} B but the provider declared ` +
        `Content-Length ${String(declaredBytes)} B — the transfer was truncated. The partial file ` +
        `is left at ${partial} and is NOT usable by --from-dir.`,
    );
  }

  await rename(partial, target);
  log(
    `  downloaded ${String(size)} B` +
      (declaredBytes === null ? ' (no Content-Length to verify against)' : ' (Content-Length OK)'),
  );
  return size;
}

/** Decode one year's window, with the raw file already on disk. */
async function decodeYear(path: string): Promise<{ window: AcagWindow; decodeMs: number }> {
  const startedAt = Date.now();
  const window = await readAcagWindow({ path, ...ACAG_WINDOW });
  return { window, decodeMs: Date.now() - startedAt };
}

/**
 * Run the whole fetch phase.
 *
 * Ordering is deliberate: the FIRST year establishes the cell selection (and therefore the
 * geometry every later year is checked against), then every subsequent year must land on exactly
 * the same grid. Trusting later years to match would let a re-gridded file write its values into
 * the previous grid's cells.
 */
export async function runAcagFetch(options: AcagFetchOptions): Promise<AcagFetchResult> {
  const { rawDir, outputDir, fromDir, keepRaw, log } = options;
  await mkdir(rawDir, { recursive: true });
  await mkdir(outputDir, { recursive: true });

  const points = SEED_PROVINCES.map((province) => ({
    plateCode: province.plateCode,
    latitude: province.latitude,
    longitude: province.longitude,
  }));
  log(`[acag] ${String(points.length)} province centre point(s) from the geography seed.`);

  // ── EVERYTHING BELOW THIS LINE IS CHECKED BEFORE A SINGLE BYTE IS DOWNLOADED ──
  //
  // (review SFH123-I3.) All of it depends only on constants and `node_modules`, so failing on it
  // AFTER the loop would spend ~70 minutes and ~12.2 GB of a university's bandwidth and then throw
  // — and because the loop deletes each raw file as it goes, nothing in that window is recoverable
  // with `--from-dir`, so the only recovery is a second 12.2 GB pull. ENGINEERING §5 requires this
  // phase to be "polite by construction"; a preventable double-download is the opposite.
  //
  // This is the SAME class of defect this line already paid for once: the decoder identity used to
  // resolve by specifier, which decoded 27 files correctly and then threw while writing the
  // manifest (see the adapter's docblock). The mechanism was fixed then; the PLACEMENT is fixed
  // here.
  if (points.length !== ACAG_EXPECTED_PROVINCE_COUNT) {
    throw new AcagContractError(
      `the geography seed carries ${String(points.length)} province(s), expected ` +
        `${String(ACAG_EXPECTED_PROVINCE_COUNT)}. A-01 would fail at the end of the run; ` +
        'refusing to download 12 GB first.',
    );
  }
  // Resolved once, up front, and reused when the manifest is written.
  const decoder = readDecoderIdentity();
  // The artifacts are written at the very end; prove now that they CAN be.
  const writeProbe = join(outputDir, '.acag-write-probe');
  try {
    await writeFile(writeProbe, '', 'utf8');
  } catch (error: unknown) {
    throw new AcagContractError(
      `${outputDir} is not writable, and the artifacts are written only at the END of the run.`,
      { cause: error },
    );
  } finally {
    await rm(writeProbe, { force: true });
  }

  const years = acagYears();
  const files: AcagFileRecord[] = [];
  const valuesByYear = new Map<number, Map<string, number>>();

  let selections: AcagCellSelection[] | null = null;
  let referenceGeometry: AcagGridGeometry | null = null;
  let referenceWindow: AcagWindow | null = null;

  for (const [index, year] of years.entries()) {
    const fileName = acagFileNameForYear(year);
    const rawPath = join(rawDir, fileName);
    log(`[acag] ${String(index + 1)}/${String(years.length)} — ${String(year)}`);

    let downloadMs = 0;
    let bytes: number;
    if (fromDir) {
      const stats = await stat(rawPath).catch(() => null);
      if (stats === null) {
        throw new AcagContractError(
          `--from-dir was given but ${rawPath} does not exist. The offline re-run needs every ` +
            'year already present.',
        );
      }
      bytes = stats.size;
    } else {
      if (index > 0) await sleep(REQUEST_SPACING_MS);
      const startedAt = Date.now();
      bytes = await downloadYear(year, rawPath, log);
      downloadMs = Date.now() - startedAt;
    }

    const sha256 = await sha256OfFile(rawPath);
    const { window, decodeMs } = await decodeYear(rawPath);
    const geometry = analyseWindowGeometry(window);

    if (selections === null || referenceGeometry === null || referenceWindow === null) {
      selections = selectAcagCells(window, geometry, points);
      referenceGeometry = geometry;
      referenceWindow = window;
      log(
        `  window ${String(window.latitudeAxis.length)} × ${String(window.longitudeAxis.length)} ` +
          `at [${String(window.rowOffset)}, ${String(window.columnOffset)}] of ` +
          `${String(window.fullShape.latitudeLength)} × ` +
          `${String(window.fullShape.longitudeLength)}; cell ${String(geometry.cellSizeDeg)}°`,
      );
    } else {
      assertSameGrid(referenceGeometry, referenceWindow, geometry, window, year);
    }

    valuesByYear.set(year, readYearValues(window, selections, year));
    files.push({
      year,
      objectKey: acagObjectKeyForYear(year),
      url: fromDir ? '' : acagUrlForYear(year),
      fileName,
      bytes,
      sha256,
      timeCoverageAttribute: window.timeCoverageAttribute,
      downloadMs,
      decodeMs,
      rawDeleted: false,
    });

    if (!keepRaw && !fromDir) {
      await rm(rawPath, { force: true });
      const record = files[files.length - 1];
      if (record !== undefined) record.rawDeleted = true;
    }
    log(`  decoded in ${String(decodeMs)} ms · sha256 ${sha256.slice(0, 12)}…`);
  }

  if (selections === null || referenceGeometry === null || referenceWindow === null) {
    throw new AcagContractError('no year was processed — the year list is empty.');
  }

  const provinces: AcagProvinceRecord[] = selections.map((selection) => ({
    plateCode: selection.plateCode,
    requestedLatitude: selection.requestedLatitude,
    requestedLongitude: selection.requestedLongitude,
    latitudeIndex: selection.latitudeIndex,
    longitudeIndex: selection.longitudeIndex,
    cellLatitude: selection.cellLatitude,
    cellLongitude: selection.cellLongitude,
    cellDistanceKm: selection.cellDistanceKm,
    values: years.map((year) => {
      const value = valuesByYear.get(year)?.get(selection.plateCode);
      if (value === undefined) {
        throw new AcagContractError(
          `province ${selection.plateCode} has no value for ${String(year)} after extraction.`,
        );
      }
      return { year, valueUgM3: value };
    }),
  }));

  const series: AcagSeriesArtifact = {
    schemaVersion: ACAG_ARTIFACT_SCHEMA_VERSION,
    datasetVersion: ACAG_DATASET_VERSION,
    unit: 'µg/m3',
    gridCellSizeDeg: referenceGeometry.cellSizeDeg,
    years,
    provinces,
  };

  const manifestWithoutHash: Omit<AcagManifest, 'seriesSha256' | 'assertions'> = {
    schemaVersion: ACAG_ARTIFACT_SCHEMA_VERSION,
    generatedAtUtc: new Date().toISOString(),
    sourceMode: fromDir ? 'from-dir' : 'download',
    userAgent: ACAG_USER_AGENT,
    datasetVersion: ACAG_DATASET_VERSION,
    datasetUrl: ACAG_DATASET_URL,
    licenceName: ACAG_LICENCE_NAME,
    licenceUrl: ACAG_LICENCE_URL,
    bucketBaseUrl: ACAG_BUCKET_BASE_URL,
    decoder,
    window: {
      fullLatitudeLength: referenceWindow.fullShape.latitudeLength,
      fullLongitudeLength: referenceWindow.fullShape.longitudeLength,
      rowOffset: referenceWindow.rowOffset,
      columnOffset: referenceWindow.columnOffset,
      rowCount: referenceWindow.latitudeAxis.length,
      columnCount: referenceWindow.longitudeAxis.length,
      latitudeStep: referenceGeometry.latitude.step,
      longitudeStep: referenceGeometry.longitude.step,
      latitudeFirst: referenceGeometry.latitude.first,
      latitudeLast: referenceGeometry.latitude.last,
      longitudeFirst: referenceGeometry.longitude.first,
      longitudeLast: referenceGeometry.longitude.last,
    },
    files,
  };

  // The gate runs BEFORE anything is written: a failed run leaves no artifact to mistake for a
  // finished one.
  const assertions = runAcagStructuralAssertions({
    manifest: {
      datasetVersion: manifestWithoutHash.datasetVersion,
      files,
      schemaVersion: ACAG_ARTIFACT_SCHEMA_VERSION,
    },
    series,
  });
  assertAllPassed(assertions, 'fetch phase');

  // Both artifacts are written to `.part` and renamed only after BOTH are complete
  // (review CODE123-M11, the `era5-fetch.ts` choreography). A crash between two direct writes
  // would leave a new series file beside an old manifest whose `seriesSha256` no longer describes
  // it — recoverable from git, but a confusing state that also clobbers committed evidence.
  const seriesPath = join(outputDir, ACAG_SERIES_FILE_NAME);
  const manifestPath = join(outputDir, ACAG_MANIFEST_FILE_NAME);
  const seriesJson = `${JSON.stringify(series, null, 2)}\n`;
  const seriesSha256 = createHash('sha256').update(seriesJson, 'utf8').digest('hex');
  const manifest: AcagManifest = { ...manifestWithoutHash, seriesSha256, assertions };
  const manifestJson = `${JSON.stringify(manifest, null, 2)}\n`;

  await writeFile(`${seriesPath}.part`, seriesJson, 'utf8');
  await writeFile(`${manifestPath}.part`, manifestJson, 'utf8');
  await rename(`${seriesPath}.part`, seriesPath);
  await rename(`${manifestPath}.part`, manifestPath);

  return { manifest, series, manifestPath, seriesPath };
}
