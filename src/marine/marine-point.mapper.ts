import type { MarinePointListItemDto } from './dto/marine-point-list-item.dto';
import type { MarinePoint } from './entities/marine-point.entity';

/**
 * Entity → the lean point identity payload, spelled ONCE: the same block is embedded by
 * `/points`, `/overview`, `/points/{slug}/conditions` and `/provinces/{plate}/conditions`, and
 * two mappers is how one surface's `plateCode` quietly diverges from another's.
 */
export function toMarinePointListItem(point: MarinePoint): MarinePointListItemDto {
  return {
    slugTr: point.slugTr,
    slugEn: point.slugEn,
    nameTr: point.nameTr,
    nameEn: point.nameEn,
    coastLabelTr: point.coastLabelTr,
    coastLabelEn: point.coastLabelEn,
    plateCode: point.provincePlateCode,
    latitude: point.latitude,
    longitude: point.longitude,
    seaBasin: point.seaBasin,
    displayOrder: point.displayOrder,
  };
}
