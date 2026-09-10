import {
  IsEnum,
  IsString,
  Length,
  Matches,
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';
import { FavoriteEntityType } from './favorite.dto';

/**
 * `{entityType}` × `{entityId}` shape table — the per-type business-key pattern that decides the
 * 400-vs-404 split `route-params.dto.ts` already records: a MALFORMED `entityId` is a 400 from
 * the global `ValidationPipe`, a well-formed-but-unknown one is the handler's 404 (plan §5.1.2).
 *
 * - `province` — `provinces.plate_code`, exactly two digits, zero-padded (`PlateCodeParams`'
 *   own pattern, mirrored here rather than imported: this DTO is one object with a discriminator,
 *   not a union of the four single-field param classes).
 * - `country` — `countries.iso_code`, exactly two uppercase letters (`FavoriteCountryParams`'
 *   former pattern, now folded in here).
 * - `region` — `regions.slug`, kebab-case, 1–50 chars (mirrors `SlugParams`' kebab-case rule,
 *   length-capped at `regions.slug`'s own `varchar(50)` column width).
 * - `continent` — a `Continent` enum label: upper-snake ASCII, 3–16 chars (every one of the seven
 *   live labels — `ASYA`…`ANTARKTIKA` — fits; the character class is the SHAPE check only,
 *   membership in the seven live labels is the service's own 404 existence check, the same split
 *   `plateCode` uses for `6` (400) vs. `99` (404)).
 */
const ENTITY_ID_PATTERN_BY_TYPE: Record<FavoriteEntityType, RegExp> = {
  [FavoriteEntityType.Province]: /^[0-9]{2}$/,
  [FavoriteEntityType.Country]: /^[A-Z]{2}$/,
  [FavoriteEntityType.Region]: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
  [FavoriteEntityType.Continent]: /^[A-Z][A-Z_]{2,15}$/,
};

/** `regions.slug`'s own column width (`region.entity.ts`) — the region branch's extra bound. */
const REGION_SLUG_MAX_LENGTH = 50;

/**
 * Whether `entityId` matches the per-`entityType` shape table above. Exported as a plain function
 * (not only as the class-validator constraint below) so the unit spec can exercise every
 * accept/reject case directly, without standing up a full DTO/pipe round trip for each one.
 */
export function isFavoriteTargetShapeValid(entityType: unknown, entityId: unknown): boolean {
  if (typeof entityId !== 'string') return false;
  if (!Object.values(FavoriteEntityType).includes(entityType as FavoriteEntityType)) return false;

  const pattern = ENTITY_ID_PATTERN_BY_TYPE[entityType as FavoriteEntityType];
  if (!pattern.test(entityId)) return false;

  if (entityType === FavoriteEntityType.Region && entityId.length > REGION_SLUG_MAX_LENGTH) {
    return false;
  }
  return true;
}

export const FAVORITE_TARGET_SHAPE_MESSAGE =
  'entityId does not match the required shape for the declared entityType ' +
  '(province: two digits; country: two uppercase letters; region: a kebab-case slug up to ' +
  '50 characters; continent: an upper-snake enum label)';

@ValidatorConstraint({ name: 'favoriteTargetShapeValid', async: false })
class FavoriteTargetShapeConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    const candidate = args.object as { entityType?: unknown; entityId?: unknown };
    return isFavoriteTargetShapeValid(candidate.entityType, candidate.entityId);
  }

  defaultMessage(): string {
    return FAVORITE_TARGET_SHAPE_MESSAGE;
  }
}

/**
 * Applied to `entityType` — the natural discriminator field — but validates the WHOLE params
 * object via `args.object`, exactly mirroring `ProfileShapeValid`'s existing whole-object idiom
 * (`src/auth/dto/profile-shape.rule.ts`): class-validator's public API has no true class-level
 * decorator, so attaching a whole-object rule to one of its own fields is the standard working
 * pattern, and it puts the rule beside the field that drives its branch for a reader scanning the
 * DTO top-to-bottom.
 */
export function FavoriteTargetShapeValid(validationOptions?: ValidationOptions): PropertyDecorator {
  return function (object: object, propertyName: string | symbol): void {
    registerDecorator({
      name: 'favoriteTargetShapeValid',
      target: object.constructor,
      propertyName: propertyName as string,
      options: validationOptions,
      validator: FavoriteTargetShapeConstraint,
    });
  };
}

/**
 * `{entityType}/{entityId}` — the two route params every favorites add/remove route takes
 * (`FavoritesController`). `entityId`'s own decorators are a coarse, type-independent bound (any
 * business key across all four types is ASCII letters/digits/hyphens/underscores, 1–64 chars —
 * the underscore is required here, not merely permitted: two of the seven live `Continent`
 * labels, `KUZEY_AMERIKA` and `GUNEY_AMERIKA`, contain one, and a coarse rule that excluded it
 * would 400 two of seven continents before the per-type rule ever ran); the per-type sharpening
 * lives in {@link FavoriteTargetShapeValid} above, attached to `entityType` so both fields are
 * validated together against one object.
 */
export class FavoriteTargetParams {
  @IsEnum(FavoriteEntityType)
  @FavoriteTargetShapeValid()
  entityType!: FavoriteEntityType;

  @IsString()
  @Length(1, 64)
  @Matches(/^[A-Za-z0-9_-]+$/, {
    message: 'entityId must contain only letters, digits, hyphens and underscores',
  })
  entityId!: string;
}
