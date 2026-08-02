import { Matches } from 'class-validator';

/**
 * Route-parameter DTO for the province detail endpoint.
 *
 * The error table this implements (the `MarineProvincePlateParams` precedent): a MALFORMED
 * parameter is a 400 from the global `ValidationPipe`, an unknown-but-well-formed one is the
 * handler's 404. The pattern mirrors what `provinces.plate_code` can actually hold — a
 * zero-padded two-digit string — so the 400 never misfires on real data.
 */
export class AirQualityProvincePlateParams {
  @Matches(/^\d{2}$/, { message: 'plateCode must be exactly two digits (zero-padded)' })
  plateCode!: string;
}
