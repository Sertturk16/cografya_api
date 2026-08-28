import { BadRequestException } from '@nestjs/common';
import type { MeasurementPointDto } from './dto/measurement-point.dto';
import { MeasurementType } from './entities/measurement.entity';
import { MEASUREMENTS_ERROR_KEYS } from './measurements-error-keys';

/** The minimum point count each `type` needs to be a real geometry (plan §5.9.1). */
const MIN_POINTS_BY_TYPE: Record<MeasurementType, number> = {
  [MeasurementType.Coordinate]: 1,
  [MeasurementType.Distance]: 2,
  // Matches `cografya_web`'s own `AREA_MIN_POINTS` (`components/tools/tool-island.tsx`).
  [MeasurementType.Area]: 3,
};

/**
 * Cross-field structural validation — pure, no DB, unit-tested (plan §5.9.1).
 *
 * Extracted as its own function rather than inlined in the service (unlike
 * `GameRoundsService.submit`'s inline ifs) specifically so it lands in the `ENGINEERING.md` §8
 * unit-test lane: "a module that needs no database belongs there, not in the Testcontainers e2e
 * suite." This is the same family of enforcement as the DTO-level `@ArrayMinSize`/
 * `@ArrayMaxSize` bound on `points` (plan §5.12) — "the payload is exactly what's needed to
 * reconstruct the measurement, no more, no less" — but it is type-DEPENDENT, so it cannot be
 * expressed as a single decorator on the DTO the way the flat 1..20 bound can.
 *
 * `coordinate` additionally rejects MORE than one point — a coordinate save is a single point by
 * definition, not "at least one".
 */
export function validateMeasurementShape(
  type: MeasurementType,
  points: readonly MeasurementPointDto[],
): void {
  const minPoints = MIN_POINTS_BY_TYPE[type];
  if (points.length < minPoints) {
    throw new BadRequestException(MEASUREMENTS_ERROR_KEYS.invalidShape);
  }
  if (type === MeasurementType.Coordinate && points.length > 1) {
    throw new BadRequestException(MEASUREMENTS_ERROR_KEYS.invalidShape);
  }
}
