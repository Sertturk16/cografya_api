import { GribMessage } from '@mattnucc/gribberish';
import {
  ECMWF_DATA_REPRESENTATION_TEMPLATE,
  ECMWF_GRID_COLUMNS,
  ECMWF_GRID_DEFINITION_TEMPLATE,
  ECMWF_GRID_FIRST_LATITUDE,
  ECMWF_GRID_FIRST_LONGITUDE,
  ECMWF_GRID_ROWS,
  ECMWF_GRID_SCANNING_MODE,
  ECMWF_GRID_STEP_DEGREES,
  ECMWF_PARAM_IDENTIFICATION,
  ECMWF_PRODUCT_DEFINITION_TEMPLATE,
  type EcmwfParam,
} from '../ecmwf.constants';
import { EcmwfContractError } from '../ecmwf.errors';
import type { EcmwfRangeMember } from '../ecmwf-index';
import { readMessageProfile, scanGribMessages, type Grib2MessageProfile } from './grib2-envelope';

/**
 * The ONE place `@mattnucc/gribberish` is called from.
 *
 * ## Why the dependency is fenced this narrowly
 * Owner ruling DEC 2026-07-31d picked this decoder as a **controlled first implementation while
 * hosting is undecided**, not as a permanent provider commitment, and attached five binding
 * conditions. Three of them are enforced right here:
 *
 * - *"the decoder stays behind a narrow adapter"* — this file, and nothing else, imports the
 *   package. Everything above it sees {@link DecodedGribField}, a plain object of numbers. A
 *   migration to ecCodes replaces this file and touches nothing else;
 * - *"fail closed on unknown or mismatched messages"* — the envelope is read and checked before
 *   a single value is unpacked (`grib2-envelope.ts`), and the decoder's own account of the
 *   message is then checked back against it;
 * - *"WASM is a platform fallback only, ecCodes is the real independent fallback"* — the package
 *   selects native or WASM per platform by itself. This adapter never treats a decode failure as
 *   "try the other one", because the two are the same Rust code and would fail identically.
 *
 * ## The cross-check, and why it is not paranoia
 * The decoder is asked what it thinks the message says, and refused when it disagrees with the
 * envelope: grid shape, bitmap presence, reference time, forecast time, and the count of finite
 * values against section 5's own count. That last one is the measured risk made testable — the
 * wave fields carry a bitmap masking 372 612 of 1 038 240 cells, and a decoder that got CCSDS
 * right but the bitmap wrong would hand back a full-length array of plausible numbers with the
 * land silently filled in. `finite === numberOfEncodedValues` is that failure's signature.
 *
 * That cross-check is between two readings of the SAME bytes, so it cannot see a message that is
 * internally perfect and simply from another cycle. The caller's own request closes that last gap
 * — see {@link EcmwfExpectedAttribution}.
 *
 * ## A decoder panic ABORTS THE PROCESS — known, partly closed, and surfaced
 * The published binary is built with `panic = abort`: a Rust panic inside it is not a JavaScript
 * exception, no `try/catch` here can see it, and the Node process dies with exit 134
 * ("fatal runtime error: failed to initiate panic"). Found by CI, not by design — a mutation test
 * that made section 5's value count disagree with the section 6 bitmap took the whole test runner
 * down with it.
 *
 * That specific path is now closed BEFORE the decoder is entered: `grib2-envelope.ts` counts the
 * bitmap's set bits and this adapter refuses a message whose two counts contradict each other,
 * along with every structural malformation (truncation, a wrong declared length, a missing
 * terminator, an unpinned template).
 *
 * **What is NOT closed:** a message that passes every envelope check but whose CCSDS payload is
 * internally corrupt could still panic. In M3a that is a hand-run tool and the blast radius is a
 * failed probe. In M3b the ingest runs inside the API server, so the same input would take the
 * server down — which the "a provider outage degrades the widget, never the page" rule does not
 * permit. Isolating the decode (a worker thread, or ecCodes out of process) is an M3b
 * architecture decision and is surfaced to Atlas rather than decided here.
 *
 * ## Bytes are bound to meaning by the INDEX, never by the decoder's names
 * `gribberish` reports NOAA/wgrib2 abbreviations: `10u` comes back as `UGRD`, `swh` as `HTSGW`
 * and `mwd` as `WWSDIR` ("combined wave direction"). Matching on those would be matching on a
 * different vocabulary than the one we requested bytes with. The parameter of a message is
 * therefore decided by the `.index` record and the byte offset it gave us — and then
 * corroborated against the message's own GRIB2 discipline/category/number triple, so the binding
 * is checked rather than asserted.
 */

/**
 * What the CALLER asked the provider for — the one claim about these bytes that nothing else can
 * corroborate.
 *
 * Every other check in this file compares the bytes against themselves or against a pinned
 * constant: the message says it is CCSDS on a 1440 × 721 grid, and it is. But WHICH cycle and
 * WHICH step a message belongs to is only ever checked against the decoder's own reading of the
 * same header — so a stale CDN copy, a mid-run re-publication, or a mistyped URL hands back a
 * perfectly valid message from the wrong valid time with every gate green. Wind and waves would
 * then be attributed to a time they do not describe, and in M3b that becomes a published
 * `modelRunAtUtc` that is simply false.
 *
 * The request is the only independent witness, so it is passed in and compared.
 */
export interface EcmwfExpectedAttribution {
  /** The cycle that was requested. GRIB section 1's reference time must be exactly this. */
  readonly referenceTimeUtc: Date;
  /** The forecast step that was requested, hours. Section 4's forecast time must be exactly this. */
  readonly forecastHours: number;
}

/** One decoded field: raw values in scanning-mode-0 order, plus the envelope they came from. */
export interface DecodedGribField {
  /** OUR parameter name, from the `.index` record — never the decoder's abbreviation. */
  readonly param: EcmwfParam;
  readonly profile: Grib2MessageProfile;
  /**
   * `rows * columns` values, row-major from 90° N / 180° E. Masked cells are `NaN`.
   *
   * Deliberately not normalised to `null` here: this is the decoder boundary, and turning the
   * mask into `null` is a semantic step that belongs to `ecmwf-support.ts`, where the
   * classification that reads it also lives.
   */
  readonly values: readonly number[];
}

/**
 * Decode the messages inside ONE byte-range response.
 *
 * `expected` is the range plan's member list: the parameters, in file order, at the relative
 * offsets the `.index` promised. The response must match it exactly — same count, same offsets,
 * same lengths. A response that merely CONTAINS the right messages somewhere else is a response
 * whose parameter attribution we cannot justify, and attribution is the thing that decides
 * whether a number is published as wind or as wave direction.
 *
 * `attribution` is the other half of that claim: WHICH cycle and step these bytes were asked for.
 * It is required rather than optional, because a caller that cannot say what it requested has no
 * business deciding what the numbers mean (see {@link EcmwfExpectedAttribution}).
 */
export function decodeGribRange(
  bytes: Uint8Array,
  expected: readonly EcmwfRangeMember[],
  attribution: EcmwfExpectedAttribution,
): DecodedGribField[] {
  const locations = scanGribMessages(bytes);

  if (locations.length !== expected.length) {
    throw new EcmwfContractError(
      `the response holds ${String(locations.length)} GRIB message(s) but the .index promised ` +
        `${String(expected.length)} (${expected.map((member) => member.param).join(', ')}).`,
    );
  }

  return locations.map((location, index) => {
    const member = expected[index];
    if (member === undefined) {
      throw new EcmwfContractError(`no expected message for position ${String(index)}.`);
    }
    if (location.offset !== member.relativeOffset || location.length !== member.length) {
      throw new EcmwfContractError(
        `message ${String(index)} of the response sits at ${String(location.offset)}+` +
          `${String(location.length)}, but the .index placed "${member.param}" at ` +
          `${String(member.relativeOffset)}+${String(member.length)}. The bytes are not the ones ` +
          `that were asked for, so the parameter attribution cannot be trusted.`,
      );
    }

    const param = assertKnownParam(member.param);
    const profile = readMessageProfile(bytes, location);
    assertSupportedProfile(profile, param, attribution);

    const values = decodeValues(bytes, location, profile, param);
    return { param, profile, values };
  });
}

/**
 * Refuse a message whose envelope is not the exact product this leg was measured against.
 *
 * Every check below is a fact read off the live 2026-07-30 12z cycle with ecCodes and committed
 * in `test/fixtures/ecmwf/eccodes-reference.json`. None of them is defensive programming for a
 * case nobody expects: each one is a way the provider could change what it publishes without
 * changing what it looks like.
 *
 * `expected` adds the one check the bytes cannot make for themselves — that this message is the
 * cycle and step that were REQUESTED, not merely a self-consistent message from some other run.
 */
export function assertSupportedProfile(
  profile: Grib2MessageProfile,
  param: EcmwfParam,
  expected: EcmwfExpectedAttribution,
): void {
  const problems: string[] = [];

  // The stale-copy guard. Everything else here asks "are these bytes a message we understand?";
  // this asks "are they the message we asked for?". A CDN serving yesterday's object under
  // today's URL, or a cycle re-published mid-download, produces a fully valid GRIB message whose
  // only defect is that it belongs to a different valid time — invisible to every other gate,
  // and the whole point of the ingest is to say WHEN a number is for.
  if (profile.referenceTimeUtc.getTime() !== expected.referenceTimeUtc.getTime()) {
    problems.push(
      `the message's model run is ${profile.referenceTimeUtc.toISOString()}, but the bytes were ` +
        `requested from the ${expected.referenceTimeUtc.toISOString()} cycle — a stale or ` +
        `re-published copy would attribute these values to the wrong valid time`,
    );
  }
  if (profile.forecastHours !== expected.forecastHours) {
    problems.push(
      `the message is step +${String(profile.forecastHours)} h, but ` +
        `+${String(expected.forecastHours)} h was requested`,
    );
  }

  if (profile.gridDefinitionTemplate !== ECMWF_GRID_DEFINITION_TEMPLATE) {
    problems.push(
      `grid definition template is ${String(profile.gridDefinitionTemplate)}, expected ` +
        `${String(ECMWF_GRID_DEFINITION_TEMPLATE)} (regular lat/lon)`,
    );
  }
  if (profile.productDefinitionTemplate !== ECMWF_PRODUCT_DEFINITION_TEMPLATE) {
    problems.push(
      `product definition template is ${String(profile.productDefinitionTemplate)}, expected ` +
        `${String(ECMWF_PRODUCT_DEFINITION_TEMPLATE)}`,
    );
  }
  if (profile.dataRepresentationTemplate !== ECMWF_DATA_REPRESENTATION_TEMPLATE) {
    problems.push(
      `data representation template is ${String(profile.dataRepresentationTemplate)}, expected ` +
        `${String(ECMWF_DATA_REPRESENTATION_TEMPLATE)} (CCSDS/AEC). A packing change is a ` +
        `decision, not something to decode through`,
    );
  }
  if (profile.columns !== ECMWF_GRID_COLUMNS || profile.rows !== ECMWF_GRID_ROWS) {
    problems.push(
      `grid is ${String(profile.columns)} × ${String(profile.rows)}, expected ` +
        `${String(ECMWF_GRID_COLUMNS)} × ${String(ECMWF_GRID_ROWS)}`,
    );
  }
  if (profile.numberOfDataPoints !== ECMWF_GRID_COLUMNS * ECMWF_GRID_ROWS) {
    problems.push(
      `section 3 declares ${String(profile.numberOfDataPoints)} data points, expected ` +
        `${String(ECMWF_GRID_COLUMNS * ECMWF_GRID_ROWS)}`,
    );
  }
  if (profile.firstLatitude !== ECMWF_GRID_FIRST_LATITUDE) {
    problems.push(
      `first row is at ${String(profile.firstLatitude)}°, expected ` +
        `${String(ECMWF_GRID_FIRST_LATITUDE)}°`,
    );
  }
  if (profile.firstLongitude !== ECMWF_GRID_FIRST_LONGITUDE) {
    problems.push(
      `first column is at ${String(profile.firstLongitude)}°, expected ` +
        `${String(ECMWF_GRID_FIRST_LONGITUDE)}° — the whole point mapping is built on this axis, ` +
        `and a shifted one produces plausible values from the wrong side of the planet`,
    );
  }
  if (profile.scanningMode !== ECMWF_GRID_SCANNING_MODE) {
    problems.push(
      `scanning mode is ${String(profile.scanningMode)}, expected ` +
        `${String(ECMWF_GRID_SCANNING_MODE)} (west→east, north→south, no alternation)`,
    );
  }
  if (
    profile.longitudeIncrement !== ECMWF_GRID_STEP_DEGREES ||
    profile.latitudeIncrement !== ECMWF_GRID_STEP_DEGREES
  ) {
    problems.push(
      `grid increments are ${String(profile.longitudeIncrement)}° × ` +
        `${String(profile.latitudeIncrement)}°, expected ${String(ECMWF_GRID_STEP_DEGREES)}°`,
    );
  }

  const identification = ECMWF_PARAM_IDENTIFICATION[param];
  if (
    profile.discipline !== identification.discipline ||
    profile.parameterCategory !== identification.category ||
    profile.parameterNumber !== identification.number
  ) {
    problems.push(
      `the .index called these bytes "${param}" (discipline ${String(identification.discipline)}, ` +
        `category ${String(identification.category)}, number ${String(identification.number)}) but ` +
        `the message identifies itself as discipline ${String(profile.discipline)}, category ` +
        `${String(profile.parameterCategory)}, number ${String(profile.parameterNumber)}`,
    );
  }

  if (profile.numberOfEncodedValues > profile.numberOfDataPoints) {
    problems.push(
      `section 5 declares ${String(profile.numberOfEncodedValues)} encoded values, more than the ` +
        `${String(profile.numberOfDataPoints)} points on the grid`,
    );
  }
  if (!profile.bitmapPresent && profile.numberOfEncodedValues !== profile.numberOfDataPoints) {
    problems.push(
      `no bitmap is present, yet section 5 encodes ${String(profile.numberOfEncodedValues)} of ` +
        `${String(profile.numberOfDataPoints)} points — an unmasked field must encode all of them`,
    );
  }
  // THE guard that must run before the decoder, not after it. A message whose section 5 count
  // disagrees with its own section 6 bitmap makes the decoder index past the end of its value
  // array, and that Rust panic ABORTS THE PROCESS — it is not a JavaScript exception and no
  // `try/catch` above can see it (verified: exit 134, "failed to initiate panic"). Every other
  // check in this file could in principle be done afterwards; this one cannot.
  if (
    profile.bitmapPresent &&
    profile.bitmapSetBits !== null &&
    profile.bitmapSetBits !== profile.numberOfEncodedValues
  ) {
    problems.push(
      `the section 6 bitmap marks ${String(profile.bitmapSetBits)} cells as present while ` +
        `section 5 encodes ${String(profile.numberOfEncodedValues)} values — the message ` +
        `contradicts itself, and handing it to the decoder would abort the process`,
    );
  }

  if (problems.length > 0) {
    throw new EcmwfContractError(
      `refusing a GRIB message that is not the product this leg was measured against ` +
        `(param "${param}", offset ${String(profile.offset)}):\n  - ${problems.join('\n  - ')}`,
    );
  }
}

function decodeValues(
  bytes: Uint8Array,
  location: { offset: number; length: number },
  profile: Grib2MessageProfile,
  param: EcmwfParam,
): readonly number[] {
  let message: GribMessage;
  try {
    message = GribMessage.parseFromBuffer(bytes, location.offset);
  } catch (error: unknown) {
    throw new EcmwfContractError(
      `the decoder could not parse the "${param}" message at offset ${String(location.offset)}.`,
      { cause: error },
    );
  }

  const shape = message.gridShape;
  if (shape.cols !== profile.columns || shape.rows !== profile.rows) {
    throw new EcmwfContractError(
      `decoder and GRIB header disagree about the grid of "${param}": decoder says ` +
        `${String(shape.cols)} × ${String(shape.rows)}, header says ${String(profile.columns)} × ` +
        `${String(profile.rows)}.`,
    );
  }
  if (message.hasBitmap !== profile.bitmapPresent) {
    throw new EcmwfContractError(
      `decoder and GRIB header disagree about the bitmap of "${param}": decoder says ` +
        `${String(message.hasBitmap)}, section 6 says ${String(profile.bitmapPresent)}.`,
    );
  }
  if (message.referenceDate.getTime() !== profile.referenceTimeUtc.getTime()) {
    throw new EcmwfContractError(
      `decoder and GRIB header disagree about the model run of "${param}": decoder says ` +
        `${message.referenceDate.toISOString()}, section 1 says ` +
        `${profile.referenceTimeUtc.toISOString()}.`,
    );
  }
  if (message.forecastDate.getTime() !== profile.validTimeUtc.getTime()) {
    throw new EcmwfContractError(
      `decoder and GRIB header disagree about the valid time of "${param}": decoder says ` +
        `${message.forecastDate.toISOString()}, sections 1+4 say ` +
        `${profile.validTimeUtc.toISOString()}.`,
    );
  }

  const values = message.data;
  if (values.length !== profile.numberOfDataPoints) {
    throw new EcmwfContractError(
      `the decoder returned ${String(values.length)} values for "${param}", but the grid has ` +
        `${String(profile.numberOfDataPoints)} points.`,
    );
  }

  // The bitmap check that actually bites. A decoder that ignored the mask returns exactly
  // `numberOfDataPoints` finite values instead of `numberOfEncodedValues` — same array length,
  // same plausible magnitudes, land quietly turned into sea.
  let finite = 0;
  for (const value of values) {
    if (Number.isFinite(value)) finite += 1;
  }
  if (finite !== profile.numberOfEncodedValues) {
    throw new EcmwfContractError(
      `the decoder produced ${String(finite)} finite values for "${param}", but section 5 says ` +
        `${String(profile.numberOfEncodedValues)} points carry one` +
        (profile.bitmapPresent ? ' — the section 6 bitmap has not been applied correctly.' : '.'),
    );
  }

  return values;
}

/**
 * Compile-time gate: the literal list inside {@link assertKnownParam} must cover `EcmwfParam`.
 *
 * Written out as literals rather than derived from the constant so TypeScript narrows without a
 * cast; this alias is what stops the two from drifting. Add a parameter to `ECMWF_PARAMS` without
 * adding it below and the build fails here, naming it — instead of the new parameter being
 * rejected at runtime by a guard nobody remembered.
 */
type AssertNever<T extends never> = T;
export type AllEcmwfParamsAreGuarded = AssertNever<
  Exclude<EcmwfParam, '10u' | '10v' | 'swh' | 'mwd'>
>;

function assertKnownParam(param: string): EcmwfParam {
  if (param === '10u' || param === '10v' || param === 'swh' || param === 'mwd') return param;
  throw new EcmwfContractError(
    `"${param}" is not a Faz-1 parameter. The decoder is only ever handed bytes this leg asked ` +
      `for, so an unknown name here means the range plan and the parameter set have diverged.`,
  );
}

/** Read one grid cell out of a decoded field. `NaN` (a masked cell) becomes `null`. */
export function readCell(field: DecodedGribField, index: number): number | null {
  if (!Number.isInteger(index) || index < 0 || index >= field.values.length) {
    throw new EcmwfContractError(
      `grid index ${String(index)} is outside the ${String(field.values.length)}-value field ` +
        `"${field.param}".`,
    );
  }
  const value = field.values[index];
  return value !== undefined && Number.isFinite(value) ? value : null;
}
