import type { EarthquakeAttributionDto } from './dto/earthquake-attribution.dto';
import { EARTHQUAKE_PROVIDER_AFAD } from './earthquake.types';

/**
 * The AFAD attribution this leg must publish — DATA and a LEGAL duty, not a nicety.
 *
 * ## Why a compiled constant rather than a seeded table (the marine/CAMS precedent)
 * A missing attribution row is not a degraded widget, it is a breach of the TDVMS Yönetmeliği
 * (RG 28.08.2015/29459) m.9/4, which makes crediting the providing institution mandatory
 * (DEC 2026-07-30j). As a compiled constant the breach is structurally impossible: the strings
 * exist at compile time, they are read in the diff, and the spec beside this file pins them
 * byte-for-byte. An unseeded database would otherwise publish AFAD data uncredited. Consequence:
 * E3 ships no migration and no seed for attribution.
 *
 * ## The strings are copied VERBATIM from the provenance ledger
 * Canonical home: `provenance/integrations.md`, row "AFAD TDVMS earthquakes". They are an
 * untouchable class (`CONTENT-STYLE.md` §22: licence, liability and KVKK text), so they are never
 * translated, shortened, re-cased or re-punctuated. The separator in the notice is an EN DASH
 * (U+2013), not a hyphen-minus, and the spec asserts that code point on its own — a hyphen
 * substitution leaves every other byte correct and would pass a test written from memory.
 *
 * `QUESTIONS.md` D-3 carries an abbreviated variant ("AFAD – TDVMS"). The dated ruling wins
 * (DEC 2026-07-30j); the short form is not published anywhere on this leg.
 *
 * ## `licenceUrl` is null on purpose
 * AFAD publishes no CC-style licence URL. The obligation arises from a regulation, so inventing a
 * plausible URL would be a false statement about the terms.
 *
 * ## No endorsement, either direction (`CONVENTIONS.md` §7)
 * Nothing here may read as "AFAD onaylı" or "resmî AFAD uygulaması". The shared denylist
 * (`src/common/attribution/endorsement-guard.ts`) runs over every string this leg serves in the
 * spec — which catches known phrasings rather than proving non-endorsement; a novel one still
 * needs a human reading the diff.
 */

/** The institution, as credited. See the file docblock for the verbatim rule. */
export const AFAD_PROVIDER_NAME = 'T.C. İçişleri Bakanlığı AFAD';

/** The required attribution line, verbatim from the ledger. The dash is U+2013. */
export const AFAD_REQUIRED_NOTICE_TR =
  'Kaynak: T.C. İçişleri Bakanlığı AFAD – Türkiye Deprem Veri Merkezi Sistemi (TDVMS)';

/** The regulation the duty arises from, verbatim. Same untouchable class as the notice. */
export const AFAD_REGULATION_REFERENCE = 'TDVMS Yönetmeliği, RG 28.08.2015/29459, m.9/4';

/**
 * The attribution array carried by EVERY response of this leg — hub, province and meta, at every
 * `dataStatus`, cold path included.
 *
 * The notice attaches to the published SECTION, not to whether a particular value resolved (the
 * marine `buildMarineAttributions` reasoning): a licence notice that blinks with provider health
 * does not discharge a "shall be attached" clause.
 *
 * A fresh array and a fresh object per call, deliberately: the objects are handed to the
 * serializer, and a shared frozen instance would turn any future mutation by a consumer into a
 * cross-request bug.
 */
export function buildEarthquakeAttributions(): EarthquakeAttributionDto[] {
  return [
    {
      providerId: EARTHQUAKE_PROVIDER_AFAD,
      providerName: AFAD_PROVIDER_NAME,
      requiredNoticeTr: AFAD_REQUIRED_NOTICE_TR,
      regulationReference: AFAD_REGULATION_REFERENCE,
      licenceUrl: null,
    },
  ];
}
