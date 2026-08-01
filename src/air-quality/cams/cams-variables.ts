import { AirQualityPollutant } from '../air-quality.types';

/**
 * The THREE spellings of each pollutant, reconciled in exactly one place.
 *
 * Measured fact (probe-olcumleri.md §4.1): the variable names INSIDE the NetCDF file are not
 * the names the ADS request sends — `particulate_matter_2.5um` comes back as `pm2p5_conc` —
 * and our contract token (`pm2_5`) is a third spelling. Three near-identical spellings mixed
 * by hand is a guaranteed transposition surface, so this table is the only lawful translator;
 * a unit test locks every row, and the decode path treats a missing expected file variable as
 * a hard {@link import('./cams.errors').CamsContractError}, never a silently absent pollutant.
 *
 * The per-variable `species` attribute in the file ("PM2.5 Aerosol", …) is human-readable and
 * is NEVER used for mapping.
 */
export interface CamsVariableMapping {
  /** Token in our OpenAPI contract. */
  readonly pollutant: AirQualityPollutant;
  /** Name sent in the ADS request's `variable` array (provider enum, verified). */
  readonly requestName: string;
  /** Variable name inside the downloaded NetCDF file (measured, not documented anywhere). */
  readonly fileVariableName: string;
}

/** Canonical order = the contract's canonical pollutant order. */
export const CAMS_VARIABLES: readonly CamsVariableMapping[] = [
  {
    pollutant: AirQualityPollutant.Pm2_5,
    requestName: 'particulate_matter_2.5um',
    fileVariableName: 'pm2p5_conc',
  },
  {
    pollutant: AirQualityPollutant.Pm10,
    requestName: 'particulate_matter_10um',
    fileVariableName: 'pm10_conc',
  },
  {
    pollutant: AirQualityPollutant.No2,
    requestName: 'nitrogen_dioxide',
    fileVariableName: 'no2_conc',
  },
  { pollutant: AirQualityPollutant.O3, requestName: 'ozone', fileVariableName: 'o3_conc' },
  {
    pollutant: AirQualityPollutant.So2,
    requestName: 'sulphur_dioxide',
    fileVariableName: 'so2_conc',
  },
];

/** Mapping row for one contract token; the decode path's lookup. */
export function camsVariableFor(pollutant: AirQualityPollutant): CamsVariableMapping {
  const mapping = CAMS_VARIABLES.find((candidate) => candidate.pollutant === pollutant);
  if (mapping === undefined) {
    // Unreachable while the table covers the enum; stated so a new enum member cannot pass
    // through decode with an undefined file variable.
    throw new Error(`no CAMS variable mapping for pollutant "${pollutant}"`);
  }
  return mapping;
}

/**
 * The canonical unit string as the file carries it: `µg/m3` with U+00B5 MICRO SIGN — measured
 * at the byte level (`C2 B5 67 2F 6D 33`), NOT the Greek small mu U+03BC. The comparison in
 * the decode path is code-point exact; a lookalike unit string is a `schema_error`, because a
 * silently mis-matched unit is a 10⁹-class numeric error waiting behind an equality test that
 * "looks" true (SPEC §5.4/§8.3).
 */
export const CAMS_CANONICAL_UNIT = 'µg/m3';
