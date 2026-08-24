/**
 * Normalizes a Turkish mobile number's common local-dialling forms onto `+90…`.
 *
 * Strips whitespace, hyphens and parentheses, then folds the two local prefixes the
 * registration form's users actually type — a leading `0` (`05XX…`) and the bare country code
 * (`905XX…`, no `+`) — onto `+90…`. A value already starting with `+90` is left untouched.
 *
 * This is PURE STRING NORMALIZATION, not validation: a string this function cannot fold into
 * the mobile shape is returned with only whitespace/punctuation stripped, so the DTO's
 * `@Matches(/^\+905[0-9]{9}$/)` (PR-2) still refuses it — this helper never invents a country
 * code guess or silently accepts a landline/invalid number.
 */
export function canonicalizePhone(raw: string): string {
  const stripped = raw.replace(/[\s\-()]/g, '');

  if (stripped.startsWith('+90')) return stripped;
  if (stripped.startsWith('90')) return `+${stripped}`;
  if (stripped.startsWith('0')) return `+90${stripped.slice(1)}`;

  return stripped;
}
