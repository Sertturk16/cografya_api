import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, Max, Min } from 'class-validator';

/**
 * `{lon, lat}` — one vertex of a saved measurement's geometry (plan §5.8).
 *
 * Field names match `cografya_web`'s own `GeoPoint` interface (`lib/map/measure.ts`) VERBATIM and
 * deliberately, since UYELIK-12 will reconstruct a saved measurement directly from this contract
 * — `lon`/`lat`, never `longitude`/`latitude`. The numeric bounds match the client's own
 * `parseLatLon` bounds exactly.
 */
export class MeasurementPointDto {
  @ApiProperty({ type: Number, minimum: -180, maximum: 180, example: 32.85 })
  @IsNumber()
  @Min(-180)
  @Max(180)
  lon!: number;

  @ApiProperty({ type: Number, minimum: -90, maximum: 90, example: 39.92 })
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat!: number;
}
