import { describe, expect, it } from '@jest/globals';
import { BadRequestException } from '@nestjs/common';
import type { MeasurementPointDto } from './dto/measurement-point.dto';
import { MeasurementType } from './entities/measurement.entity';
import { validateMeasurementShape } from './measurement-shape.validator';

/** `count` synthetic, in-range points — the actual lon/lat values never matter to this pure function. */
function points(count: number): MeasurementPointDto[] {
  return Array.from({ length: count }, (_, index) => ({ lon: index, lat: index }));
}

describe('validateMeasurementShape', () => {
  describe('coordinate — exactly 1 point', () => {
    it('0 points -> throws BadRequestException(invalidShape)', () => {
      expect(() => validateMeasurementShape(MeasurementType.Coordinate, points(0))).toThrow(
        BadRequestException,
      );
    });

    it('1 point -> does not throw', () => {
      expect(() => validateMeasurementShape(MeasurementType.Coordinate, points(1))).not.toThrow();
    });

    it('2 points -> throws BadRequestException(invalidShape) — a coordinate is single-point only', () => {
      expect(() => validateMeasurementShape(MeasurementType.Coordinate, points(2))).toThrow(
        BadRequestException,
      );
    });
  });

  describe('distance — at least 2 points', () => {
    it('0 points -> throws', () => {
      expect(() => validateMeasurementShape(MeasurementType.Distance, points(0))).toThrow(
        BadRequestException,
      );
    });

    it('1 point -> throws', () => {
      expect(() => validateMeasurementShape(MeasurementType.Distance, points(1))).toThrow(
        BadRequestException,
      );
    });

    it('2 points -> does not throw', () => {
      expect(() => validateMeasurementShape(MeasurementType.Distance, points(2))).not.toThrow();
    });
  });

  describe('area — at least 3 points', () => {
    it('0 points -> throws', () => {
      expect(() => validateMeasurementShape(MeasurementType.Area, points(0))).toThrow(
        BadRequestException,
      );
    });

    it('1 point -> throws', () => {
      expect(() => validateMeasurementShape(MeasurementType.Area, points(1))).toThrow(
        BadRequestException,
      );
    });

    it('2 points -> throws', () => {
      expect(() => validateMeasurementShape(MeasurementType.Area, points(2))).toThrow(
        BadRequestException,
      );
    });

    it('3 points -> does not throw', () => {
      expect(() => validateMeasurementShape(MeasurementType.Area, points(3))).not.toThrow();
    });
  });
});
