import type { Era5ProvinceCellRecord, Era5ProvinceSeries } from './era5-artifact.types';
import { flatIndex, type Era5DecodedFile } from './era5-decode';
import { FALLBACK_SEARCH_RADIUS_CELLS, selectEra5Cell, type Era5CellSelection } from './era5-grid';
import {
  assertPrecipitationInRange,
  assertTemperatureInRange,
  kelvinToCelsius,
  totalPrecipitationToMonthlyMm,
} from './era5-units';
import { Era5ContractError } from './era5.errors';

/**
 * Province extraction under the A-1 ruling: **administrative-centre point, plus a DECLARED
 * nearest-land-cell fallback** (SPEC §4).
 *
 * ## Why the fallback is legitimate here and a silent neighbour drift is not
 * SPEC §5.2 forbids quietly reading a neighbouring cell when a point lands on sea. A-1 permits
 * ONE bounded step, and only because three things are recorded for every province it fires on:
 * the flag, the cell actually used, and the distance in KILOMETRES. Those three go into the
 * manifest, from there into `data-provenance.md`, and from there onto the page. Strip any of them
 * and this becomes exactly the silent drift the SPEC bans — which is why `era5-assertions.ts`
 * gates on all three, and why the fallback SET is compared against a closed expected list.
 *
 * ## The five, and why the list is closed
 * `07 Antalya`, `33 Mersin`, `52 Ordu`, `57 Sinop`, `61 Trabzon` — measured, and stable, because
 * the sea mask does NOT vary with time (identical in all 360 months). A SIXTH province appearing
 * means the grid or a seed coordinate moved, which is a change we must see, not absorb.
 */

/** The closed, measured fallback set (SPEC §4.2). A different set stops the run. */
export const EXPECTED_FALLBACK_PLATE_CODES: readonly string[] = ['07', '33', '52', '57', '61'];

export interface Era5ExtractionPoint {
  plateCode: string;
  latitude: number;
  longitude: number;
}

export interface Era5Extraction {
  provinces: readonly Era5ProvinceCellRecord[];
  series: readonly Era5ProvinceSeries[];
  fallbackPlateCodes: readonly string[];
  /** Whether every inspected cell kept its NaN state across every month. */
  maskTimeInvariant: boolean;
}

export function extractEra5Provinces(
  decoded: Era5DecodedFile,
  points: readonly Era5ExtractionPoint[],
): Era5Extraction {
  const temperature = decoded.variables.find((entry) => entry.mapping.kind === 'temperature');
  const precipitation = decoded.variables.find((entry) => entry.mapping.kind === 'precipitation');
  if (temperature === undefined) {
    throw new Era5ContractError('extraction needs the temperature variable and it is absent.');
  }

  const latitudeLength = decoded.latitudeAxis.length;
  const longitudeLength = decoded.longitudeAxis.length;
  const monthCount = decoded.months.length;

  /** Masked-ness at a given time step, from the TEMPERATURE grid (the land mask is the same). */
  const isMaskedAt = (timeIndex: number, latIndex: number, lonIndex: number): boolean => {
    const value =
      temperature.values[flatIndex(timeIndex, latIndex, lonIndex, latitudeLength, longitudeLength)];
    return value === undefined || Number.isNaN(value);
  };
  const isMasked = (latIndex: number, lonIndex: number): boolean =>
    isMaskedAt(0, latIndex, lonIndex);

  const provinces: Era5ProvinceCellRecord[] = [];
  const series: Era5ProvinceSeries[] = [];
  const fallbackPlateCodes: string[] = [];
  let maskTimeInvariant = true;

  for (const point of points) {
    const label = `province ${point.plateCode}`;
    const selection: Era5CellSelection = selectEra5Cell({
      latitudeAxis: decoded.latitudeAxis,
      longitudeAxis: decoded.longitudeAxis,
      latitudeAnalysis: decoded.latitudeAnalysis,
      longitudeAnalysis: decoded.longitudeAnalysis,
      requestedLatitude: point.latitude,
      requestedLongitude: point.longitude,
      isMasked,
      label,
    });
    if (selection.fallbackUsed) fallbackPlateCodes.push(point.plateCode);

    // Mask time-invariance over the SEARCH WINDOW, not just the chosen cell: if a window cell
    // flickered between land and sea across the 360 months, the "nearest land cell" would depend
    // on which month we happened to look at, and the committed manifest would be a coin flip.
    if (!assertMaskInvariant(selection, isMaskedAt, monthCount, latitudeLength, longitudeLength)) {
      maskTimeInvariant = false;
    }

    const tempMeanC: number[] = [];
    const precipitationMm: number[] = [];
    for (let timeIndex = 0; timeIndex < monthCount; timeIndex += 1) {
      const month = decoded.months[timeIndex];
      if (month === undefined) {
        throw new Era5ContractError(`${label}: month ${String(timeIndex)} is missing.`);
      }
      const offset = flatIndex(
        timeIndex,
        selection.latIndex,
        selection.lonIndex,
        latitudeLength,
        longitudeLength,
      );

      const kelvin = temperature.values[offset];
      if (kelvin === undefined || Number.isNaN(kelvin)) {
        // Completeness is ABSOLUTE on this line (SPEC §5.3): one missing value stops the run.
        // MGM's "unpublishable province" class does not exist on a uniform global grid.
        throw new Era5ContractError(
          `${label}: temperature is masked at ${String(month.year)}-` +
            `${String(month.month).padStart(2, '0')} in a cell selected as LAND — the mask is not ` +
            'time-invariant after all.',
        );
      }
      const celsius = kelvinToCelsius(kelvin);
      assertTemperatureInRange(celsius, `${label} ${String(month.year)}-${String(month.month)}`);
      tempMeanC.push(celsius);

      if (precipitation !== undefined) {
        const metresPerDay = precipitation.values[offset];
        if (metresPerDay === undefined || Number.isNaN(metresPerDay)) {
          throw new Era5ContractError(
            `${label}: precipitation is masked at ${String(month.year)}-` +
              `${String(month.month).padStart(2, '0')} in a LAND cell.`,
          );
        }
        const millimetres = totalPrecipitationToMonthlyMm(metresPerDay, month.year, month.month);
        assertPrecipitationInRange(
          millimetres,
          `${label} ${String(month.year)}-${String(month.month)}`,
        );
        precipitationMm.push(millimetres);
      }
    }

    provinces.push({
      plateCode: point.plateCode,
      requestedLatitude: point.latitude,
      requestedLongitude: point.longitude,
      latIndex: selection.latIndex,
      lonIndex: selection.lonIndex,
      cellLatitude: selection.cellLatitude,
      cellLongitude: selection.cellLongitude,
      fallbackUsed: selection.fallbackUsed,
      fallbackDistanceKm: selection.fallbackDistanceKm,
      annualMeanTempC: mean(tempMeanC),
      annualTotalPrecipitationMm:
        precipitationMm.length === 0 ? 0 : (sum(precipitationMm) * 12) / precipitationMm.length,
    });
    series.push({ plateCode: point.plateCode, tempMeanC, precipitationMm });
  }

  return {
    provinces,
    series,
    fallbackPlateCodes: [...fallbackPlateCodes].sort(),
    maskTimeInvariant,
  };
}

/**
 * Check that every cell in this province's search window keeps its NaN state across all months.
 * Returns `false` rather than throwing so the caller can record the finding in the manifest and
 * let `era5-assertions.ts` decide — the artifact of a FAILED run is what explains the failure.
 */
function assertMaskInvariant(
  selection: Era5CellSelection,
  isMaskedAt: (timeIndex: number, latIndex: number, lonIndex: number) => boolean,
  monthCount: number,
  latitudeLength: number,
  longitudeLength: number,
): boolean {
  for (
    let latOffset = -FALLBACK_SEARCH_RADIUS_CELLS;
    latOffset <= FALLBACK_SEARCH_RADIUS_CELLS;
    latOffset += 1
  ) {
    for (
      let lonOffset = -FALLBACK_SEARCH_RADIUS_CELLS;
      lonOffset <= FALLBACK_SEARCH_RADIUS_CELLS;
      lonOffset += 1
    ) {
      const latIndex = selection.latIndex + latOffset;
      const lonIndex = selection.lonIndex + lonOffset;
      if (latIndex < 0 || latIndex >= latitudeLength) continue;
      if (lonIndex < 0 || lonIndex >= longitudeLength) continue;
      const reference = isMaskedAt(0, latIndex, lonIndex);
      for (let timeIndex = 1; timeIndex < monthCount; timeIndex += 1) {
        if (isMaskedAt(timeIndex, latIndex, lonIndex) !== reference) return false;
      }
    }
  }
  return true;
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : sum(values) / values.length;
}
