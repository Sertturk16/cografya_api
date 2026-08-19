import { EarthquakeBindingKind } from '../earthquake.types';

/**
 * HOW an event relates to the province it is filed under, and WHICH province that is.
 *
 * These are two separate decisions, and confusing them is the exact factual error this leg exists
 * to prevent: AFAD's `province` names the nearest TURKISH province, so an Azerbaijani M3.6 arrives
 * carrying `Iğdır` and a naive page would publish it as "an earthquake in Iğdır" (SPEC §3.5,
 * `QUESTIONS.md` D-1). The API therefore emits a plate code AND a kind, and the web repo builds
 * the sentence from both — the API never writes "an earthquake occurred in X".
 */

/**
 * Water-body words, in the provider's own vocabulary.
 *
 * A CLOSED list, matched case-insensitively in the Turkish locale. It decides one thing only:
 * whether a bracketed location that IS in Türkiye describes water (`offshore_near` — a province
 * CONTEXT) or land (`inside`). Reservoir events are water: `Keban Barajı - [05.48 km] Merkez
 * (Elazığ)` is measured, and a dam lake is no more "in Elazığ's streets" than a bay is.
 */
const WATER_BODY_WORDS = [
  'deniz',
  'denizi',
  'körfez',
  'körfezi',
  'göl',
  'gölü',
  'baraj',
  'barajı',
  'boğaz',
  'boğazı',
] as const;

/**
 * Sea names that are ONE compound word, matched against the WHOLE place name.
 *
 * Two of the four seas around Türkiye are written as single compounds — `Akdeniz`, `Karadeniz` —
 * so the token list above can never see them: `Akdeniz` is one token and it is not `deniz`. AFAD
 * sends both (SPEC §3.5 records `Akdeniz` among the measured open-sea strings), and a bracketed
 * coastal event carries `country: "Türkiye"` (§3.10: `country` is null for open sea only, 6/630) —
 * so `Akdeniz - [31.40 km] Kumluca (Antalya)` reached the land branch and was filed `inside`, the
 * exact "an earthquake in Antalya" reading `binding_kind` exists to prevent (SPEC §5.4(b)).
 *
 * **Matched as a full name, deliberately NOT as a token.** `Karadeniz Ereğli` is a settlement and
 * `Akdeniz` is one of Mersin's districts; a token match would file both as water the moment either
 * appeared as a `<place>`. The measured provider strings for these two seas are the bare names, so
 * the narrower rule costs nothing real and cannot invent an offshore event on land.
 */
const COMPOUND_WATER_BODY_NAMES = ['akdeniz', 'karadeniz'] as const;

const TURKIYE = 'Türkiye';

export interface BindingKindInput {
  /** The provider's `country`: `Türkiye`, another country, or `null` for open water. */
  readonly providerCountry: string | null;
  /** Whether `location` carried the `[NN km]` bracket. */
  readonly hasDistanceBracket: boolean;
  /** The derived place name — what the bracket, if any, was measured FROM. */
  readonly placeNameTr: string;
}

/**
 * Classify the binding.
 *
 * The table is SPEC §5.4(b) plus the residual Atlas ruled on 2026-08-12: `Türkiye` + bracketed +
 * not water is **`inside`**. That case existed in the data and in no row of the original table,
 * while the column is NOT NULL — so ingest would have had to write something the contract never
 * named. An earthquake on Turkish soil described by its distance to a nearby town is in the
 * country; the bracket measures proximity to a settlement, not being offshore.
 */
export function resolveBindingKind(input: BindingKindInput): EarthquakeBindingKind {
  if (input.providerCountry === null) return EarthquakeBindingKind.OffshoreNear;
  if (input.providerCountry !== TURKIYE) return EarthquakeBindingKind.AcrossBorder;
  if (!input.hasDistanceBracket) return EarthquakeBindingKind.Inside;
  return isWaterBodyName(input.placeNameTr)
    ? EarthquakeBindingKind.OffshoreNear
    : EarthquakeBindingKind.Inside;
}

/** Does this place name describe a sea, gulf, strait, lake or reservoir? */
export function isWaterBodyName(placeName: string): boolean {
  const folded = placeName.trim().toLocaleLowerCase('tr');
  if ((COMPOUND_WATER_BODY_NAMES as readonly string[]).includes(folded)) return true;

  const words = folded
    // Split on everything that is not a letter, so `Ege Denizi'nin` and `Van Gölü` both reduce to
    // comparable tokens without a stemmer.
    .split(/[^\p{L}]+/u)
    .filter((word) => word.length > 0);
  return words.some((word) => (WATER_BODY_WORDS as readonly string[]).includes(word));
}

/**
 * The key both sides of the province join are reduced to.
 *
 * Turkish-locale lower-casing is load-bearing: the invariant `'I'.toLowerCase() === 'i'` is FALSE
 * here (`I` → `ı`), so an ASCII fold would put `Iğdır` and `ığdır` in different buckets and the
 * province would silently lose its cross-link.
 */
export function normaliseProvinceName(name: string): string {
  return name.trim().toLocaleLowerCase('tr').replace(/\s+/g, ' ');
}
