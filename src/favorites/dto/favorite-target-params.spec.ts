import { describe, expect, it } from '@jest/globals';
import { validateSync } from 'class-validator';
import { FavoriteEntityType } from './favorite.dto';
import { FavoriteTargetParams, isFavoriteTargetShapeValid } from './favorite-target-params.dto';

function targetParamErrors(entityType: FavoriteEntityType, entityId: string): string[] {
  const params = new FavoriteTargetParams();
  params.entityType = entityType;
  params.entityId = entityId;
  return validateSync(params).flatMap((error) => Object.values(error.constraints ?? {}));
}

/**
 * `FavoriteTargetShapeValid` is a CLOSED-SET validator: it must accept every one of today's four
 * `entityType` branches and reject a shape violation in every one of them, or a future edit can
 * silently narrow (or widen) one branch with nothing here to notice (plan §14 manifest #6's own
 * reason for this file existing). Four accept + four reject, one pair per `entityType` — not an
 * arbitrary sample.
 */
describe('isFavoriteTargetShapeValid / FavoriteTargetShapeValid', () => {
  describe('accepts a well-formed entityId for each of the four types', () => {
    it.each([
      [FavoriteEntityType.Province, '34'],
      [FavoriteEntityType.Country, 'TR'],
      [FavoriteEntityType.Region, 'ic-anadolu'],
      [FavoriteEntityType.Continent, 'ASYA'],
    ])('%s / %s', (entityType, entityId) => {
      expect(isFavoriteTargetShapeValid(entityType, entityId)).toBe(true);
      expect(targetParamErrors(entityType, entityId)).toEqual([]);
    });
  });

  describe('rejects a malformed entityId — including a shape valid for a DIFFERENT type', () => {
    it.each([
      // Wrong digit count for a province plate code.
      [FavoriteEntityType.Province, '340'],
      // Digits where two uppercase letters are required — the shape a `province` entityId has,
      // asserted against `country`: this is the case a per-field-only regex (with no knowledge
      // of the sibling `entityType` field) could not catch, which is the whole reason this rule
      // is a whole-object validator rather than a plain per-field `@Matches`.
      [FavoriteEntityType.Country, '34'],
      // Uppercase letters are not part of the kebab-case slug alphabet.
      [FavoriteEntityType.Region, 'Ic-Anadolu'],
      // Continent labels are upper-snake, never lowercase.
      [FavoriteEntityType.Continent, 'asya'],
    ])('%s / %s', (entityType, entityId) => {
      expect(isFavoriteTargetShapeValid(entityType, entityId)).toBe(false);
      expect(targetParamErrors(entityType, entityId)).not.toEqual([]);
    });
  });

  it('rejects an entityType outside the enum regardless of entityId', () => {
    expect(isFavoriteTargetShapeValid('planet', '34')).toBe(false);
  });

  it('bounds the region slug at its column width (50 chars) even though the coarse entityId rule allows 64', () => {
    expect(isFavoriteTargetShapeValid(FavoriteEntityType.Region, 'a'.repeat(50))).toBe(true);
    expect(isFavoriteTargetShapeValid(FavoriteEntityType.Region, 'a'.repeat(51))).toBe(false);
  });

  it('names the rule in its message, so a 400 body says what was wrong', () => {
    expect(targetParamErrors(FavoriteEntityType.Continent, 'TR')).toContain(
      'entityId does not match the required shape for the declared entityType ' +
        '(province: two digits; country: two uppercase letters; region: a kebab-case slug up to ' +
        '50 characters; continent: an upper-snake enum label)',
    );
  });
});
