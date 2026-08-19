import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNumber, Max, Min } from 'class-validator';
import {
  ELEVATION_BBOX_MAX_LAT,
  ELEVATION_BBOX_MAX_LON,
  ELEVATION_BBOX_MIN_LAT,
  ELEVATION_BBOX_MIN_LON,
} from '../elevation.types';

/**
 * Turn a query-string value into a number, or into `undefined` so `@IsNumber()` refuses it.
 *
 * NOT `@Type(() => Number)`, and the reason is a defect this repo has already measured twice
 * (review #121 CODE121-M1, then SFH121R2-M1 on the same field): `@Type` runs first and coerces
 * `''`, `' '`, `'\t'` and `['']` all to `0`. Zero is inside this endpoint's latitude range, so
 * `?fromLat=` — the shape a template emits for an unset field — would have been silently read as
 * "the equator" and answered 200 with a profile of a line nobody drew. A blank becomes `undefined`
 * here, which `@IsNumber()` rejects with a 400 naming the field.
 *
 * An ABSENT parameter never reaches this transform at all; it is caught by `@IsNumber()` too,
 * because none of the four is optional.
 */
function toFiniteNumber({ value }: { value: unknown }): unknown {
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  return Number(value);
}

/**
 * The request contract of `GET /api/elevation/profile`: four numbers, each validated on its own.
 *
 * ## Why four scalars rather than one `from=41.28,36.33` string
 * A single string needs a hand-written parser, and a hand-written parser's rules live in code
 * where no consumer can read them. Four fields declare their bounds in `class-validator` AND in
 * `@ApiProperty`, so the same numbers are enforced by the server and PUBLISHED in
 * `openapi/openapi.json` — which is where the web repo reads them (`ENGINEERING.md` §2).
 *
 * ## Unknown query parameters are REJECTED, not ignored
 * The global pipe runs `whitelist: true` + `forbidNonWhitelisted: true`, so `?utm_source=x`
 * answers 400. This endpoint takes no exception (`ENGINEERING.md` §2: an endpoint with a query
 * DTO does not carve one).
 *
 * ## There is no `sampleCount` parameter, deliberately
 * The sample count is a server constant (AK-25 md.4). It is what makes the per-request tile
 * ceiling arithmetic rather than configuration, and a client-chosen value would fork the profile
 * cache key N ways. The value applied is published in the response.
 *
 * ## The frame is the Türkiye map, and outside it is a 400
 * Not a 200 with an empty profile: the Faz-1 tools are fixed to the Türkiye frame (SPEC §6.5(a)),
 * and an unbounded coordinate is an unbounded tile fetch on a deliberately wall-less endpoint.
 */
export class ElevationProfileQueryDto {
  @ApiProperty({
    type: 'number',
    minimum: ELEVATION_BBOX_MIN_LAT,
    maximum: ELEVATION_BBOX_MAX_LAT,
    example: 41.287,
    description:
      'Hattın başlangıç enlemi (decimal degrees). Çerçeve, Türkiye sınırlarının yastıklanmış ' +
      'hâlidir; dışarısı 400 döner. Değer sunucuda 3 ondalığa yuvarlanır ve yanıtta `from` ' +
      'olarak geri verilir.',
  })
  @Transform(toFiniteNumber)
  @IsNumber()
  @Min(ELEVATION_BBOX_MIN_LAT)
  @Max(ELEVATION_BBOX_MAX_LAT)
  fromLat!: number;

  @ApiProperty({
    type: 'number',
    minimum: ELEVATION_BBOX_MIN_LON,
    maximum: ELEVATION_BBOX_MAX_LON,
    example: 36.33,
    description: 'Hattın başlangıç boylamı (decimal degrees). Aynı çerçeve ve aynı yuvarlama.',
  })
  @Transform(toFiniteNumber)
  @IsNumber()
  @Min(ELEVATION_BBOX_MIN_LON)
  @Max(ELEVATION_BBOX_MAX_LON)
  fromLon!: number;

  @ApiProperty({
    type: 'number',
    minimum: ELEVATION_BBOX_MIN_LAT,
    maximum: ELEVATION_BBOX_MAX_LAT,
    example: 39.904,
    description: 'Hattın bitiş enlemi (decimal degrees).',
  })
  @Transform(toFiniteNumber)
  @IsNumber()
  @Min(ELEVATION_BBOX_MIN_LAT)
  @Max(ELEVATION_BBOX_MAX_LAT)
  toLat!: number;

  @ApiProperty({
    type: 'number',
    minimum: ELEVATION_BBOX_MIN_LON,
    maximum: ELEVATION_BBOX_MAX_LON,
    example: 41.277,
    description:
      'Hattın bitiş boylamı (decimal degrees). Yuvarlamadan sonra iki uç aynı noktaya düşerse ' +
      '400 döner: sıfır uzunlukta bir hattın kesiti yoktur.',
  })
  @Transform(toFiniteNumber)
  @IsNumber()
  @Min(ELEVATION_BBOX_MIN_LON)
  @Max(ELEVATION_BBOX_MAX_LON)
  toLon!: number;
}
