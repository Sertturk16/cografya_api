import { BadRequestException } from '@nestjs/common';
import type { DataSource } from 'typeorm';

/**
 * D15's one-query check: `districtId` exists AND belongs to the province named by
 * `provincePlateCode`.
 *
 * It is a free function rather than a method because two services now need it —
 * `RegistrationService.register` (a new account declares a location) and
 * `ProfileService.replaceAccount` (an existing member moves). The rule is one rule; a second
 * copy would be a second place for the join to drift.
 *
 * It is NOT a `class-validator` constraint for the reason D15 already records: a DB-going
 * validator needs `useContainer(app, { fallbackOnErrors: true })` and `src/main.ts` is frozen
 * (Y1). The framework's own 400 shape is preserved by throwing the same
 * `BadRequestException` with a string[] body the pipe would have produced.
 */
export async function assertDistrictBelongsToProvince(
  dataSource: DataSource,
  districtId: string,
  provincePlateCode: string,
): Promise<void> {
  const rows = await dataSource.query<{ id: string }[]>(
    `SELECT d.id
       FROM districts d
       INNER JOIN provinces p ON p.id = d.province_id
      WHERE d.id = $1 AND p.plate_code = $2`,
    [districtId, provincePlateCode],
  );
  if (rows.length === 0) {
    throw new BadRequestException([
      'districtId must exist and belong to the province named by provincePlateCode',
    ]);
  }
}
