import { Length, Matches } from 'class-validator';

/**
 * Route-parameter DTOs for the marine value endpoints (plan §6's error table: a malformed
 * parameter is a 400 from the global `ValidationPipe`, an unknown-but-well-formed one is the
 * handler's 404). Patterns mirror what the seed can actually produce, so the 400 never
 * misfires on real data.
 */

/** `{slug}` of a marine point — TR or EN, both lowercase-kebab by seed construction. */
export class MarinePointSlugParams {
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'slug must be a lowercase kebab-case identifier',
  })
  @Length(1, 120)
  slug!: string;
}

/** `{plateCode}` — exactly two digits, zero-padded, like `provinces.plate_code`. */
export class MarineProvincePlateParams {
  @Matches(/^\d{2}$/, { message: 'plateCode must be exactly two digits (zero-padded)' })
  plateCode!: string;
}
