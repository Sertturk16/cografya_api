import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import type { CreateMeasurementRequestDto } from './dto/create-measurement-request.dto';
import type { MeasurementDto } from './dto/measurement.dto';
import type { UpdateMeasurementTitleRequestDto } from './dto/update-measurement-title-request.dto';
import { Measurement } from './entities/measurement.entity';
import { validateMeasurementShape } from './measurement-shape.validator';
import { MEASUREMENTS_ERROR_KEYS } from './measurements-error-keys';

/**
 * Total-row-count cap per user, ever (plan §5.3/§15 — the escalated quota-semantic choice,
 * accepted at Atlas's ruling). Grounded, not invented: the same order of magnitude as
 * `GAME_ROUND_SUBMIT_RATE_LIMIT.limit` (300, a different axis in the same repo) and `favorites`'
 * own "≤ 280 rows/user, ever" bounded-list precedent.
 */
export const MEASUREMENTS_PER_USER_MAX = 300;

/**
 * Create / list-mine / get-one / update-title / delete for `measurements`, all scoped to the
 * caller's own rows (plan §5.9). Every method takes `userId` from `@CurrentUser()` only — no
 * request shape (body, param or query) anywhere in this module carries a `userId` field, so there
 * is no field a caller could override (the cross-user-isolation invariant).
 *
 * Never constructs an exception message, a log line, or any string that embeds a request's
 * `points`/a row's `points` raw values — every thrown exception here is a static i18n key,
 * matching every sibling error key (plan §5.11).
 */
@Injectable()
export class MeasurementsService {
  constructor(
    @InjectRepository(Measurement)
    private readonly measurements: Repository<Measurement>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * `POST /api/measurements` — idempotent create, quota-gated (plan §5.3).
   *
   * The shape check runs BEFORE the transaction opens (a pure, DB-free rejection needs no
   * connection). Inside one transaction: a transaction-scoped Postgres advisory lock keyed on
   * `userId` serializes concurrent creates for the SAME user only (`pg_advisory_xact_lock` is
   * released automatically at COMMIT/ROLLBACK); a false collision between two DIFFERENT users'
   * `hashtext(userId)` values only ever costs a harmless serialization, never a false PASS of the
   * quota check below. The existence check runs BEFORE the quota check so a retry (idempotent
   * replay) is never quota-limited.
   */
  async create(userId: string, body: CreateMeasurementRequestDto): Promise<MeasurementDto> {
    validateMeasurementShape(body.type, body.points);

    return this.dataSource.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [userId]);

      const existing = await manager.findOne(Measurement, {
        where: { userId, clientMeasurementId: body.clientMeasurementId },
      });
      if (existing !== null) return toDto(existing);

      const count = await manager.count(Measurement, { where: { userId } });
      if (count >= MEASUREMENTS_PER_USER_MAX) {
        throw new ForbiddenException(MEASUREMENTS_ERROR_KEYS.quotaExceeded);
      }

      const saved = await manager.save(
        manager.create(Measurement, {
          userId,
          clientMeasurementId: body.clientMeasurementId,
          type: body.type,
          points: body.points,
          title: body.title ?? null,
        }),
      );
      return toDto(saved);
    });
  }

  /**
   * `GET /api/measurements` — a plain, unpaginated array (plan §5.4): the quota hard-caps the
   * corpus at `MEASUREMENTS_PER_USER_MAX` rows per user, ever, the same "bounded and small" shape
   * `ENGINEERING.md` §2 already names for `favorites`. Ordered `createdAt DESC` — a saved-item
   * list's natural reading order (most recent save first).
   */
  async listMine(userId: string): Promise<MeasurementDto[]> {
    const rows = await this.measurements.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
    return rows.map(toDto);
  }

  /**
   * `GET /api/measurements/:id` — own row only (plan §5.5). Zero rows throws one undifferentiated
   * `notFound`, whether the id truly does not exist or belongs to another user — nothing about
   * another user's row is ever observable.
   */
  async getOne(userId: string, id: string): Promise<MeasurementDto> {
    const row = await this.measurements.findOne({ where: { id, userId } });
    if (row === null) throw new NotFoundException(MEASUREMENTS_ERROR_KEYS.notFound);
    return toDto(row);
  }

  /**
   * `PATCH /api/measurements/:id` — title-only rename (plan §5.6). Same ownership/404 shape as
   * {@link getOne}, not `remove`'s unconditional shape: a 404 on someone else's id, not a
   * 200-no-op. `type`/`points`/`clientMeasurementId` are never touched here; `updated_at` advances
   * via `@UpdateDateColumn` on save.
   */
  async updateTitle(
    userId: string,
    id: string,
    body: UpdateMeasurementTitleRequestDto,
  ): Promise<MeasurementDto> {
    const row = await this.measurements.findOne({ where: { id, userId } });
    if (row === null) throw new NotFoundException(MEASUREMENTS_ERROR_KEYS.notFound);
    row.title = body.title;
    const saved = await this.measurements.save(row);
    return toDto(saved);
  }

  /**
   * `DELETE /api/measurements/:id` — unconditionally idempotent (plan §5.7): 0 rows deleted and 1
   * row deleted are both success, filtered by `userId` so this can never remove another user's
   * row. No advisory lock needed — a delete only ever REDUCES the per-user count, so two
   * concurrent deletes of two different rows race safely with no special handling.
   */
  async remove(userId: string, id: string): Promise<void> {
    await this.measurements.delete({ id, userId });
  }
}

function toDto(row: Measurement): MeasurementDto {
  return {
    id: row.id,
    type: row.type,
    points: row.points,
    title: row.title,
    clientMeasurementId: row.clientMeasurementId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
