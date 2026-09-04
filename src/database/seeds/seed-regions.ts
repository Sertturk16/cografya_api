import { isDeepStrictEqual } from 'node:util';
import type { DataSource } from 'typeorm';
import { Region } from '../../region/entities/region.entity';
import { SEED_REGIONS, type RegionSeed } from './region.seed-data';

export interface SeedRegionsResult {
  inserted: number;
  updated: number;
  unchanged: number;
  total: number;
}

function rowMatchesSeed(row: Region, seed: RegionSeed): boolean {
  const gdpMatches =
    row.gdpShareApproxPercent === null || seed.gdpShareApproxPercent === null
      ? row.gdpShareApproxPercent === seed.gdpShareApproxPercent
      : Number(row.gdpShareApproxPercent) === Number(seed.gdpShareApproxPercent);

  const matches =
    row.region === seed.region &&
    row.slug === seed.slug &&
    row.nameTr === seed.nameTr &&
    row.headingName === seed.headingName &&
    row.metaTitle === seed.metaTitle &&
    row.metaDescription === seed.metaDescription &&
    row.h1 === seed.h1 &&
    row.introTr === seed.introTr &&
    row.highestPointName === (seed.highestPointName ?? null) &&
    row.highestPointElevationM === (seed.highestPointElevationM ?? null) &&
    row.highestPointProvince === (seed.highestPointProvince ?? null) &&
    isDeepStrictEqual(row.coastalSeas, seed.coastalSeas) &&
    isDeepStrictEqual(row.neighborRegions, seed.neighborRegions) &&
    isDeepStrictEqual(row.neighborCountries, seed.neighborCountries) &&
    isDeepStrictEqual(row.subregions, seed.subregions) &&
    gdpMatches &&
    row.locationAndBordersTr === seed.locationAndBordersTr &&
    row.landformsTr === seed.landformsTr &&
    row.climateAndVegetationTr === seed.climateAndVegetationTr &&
    row.hydrographyTr === seed.hydrographyTr &&
    row.settlementAndPopulationTr === seed.settlementAndPopulationTr &&
    row.economyTr === seed.economyTr &&
    row.subregionsTr === seed.subregionsTr &&
    row.disasterAndEarthquakeTr === seed.disasterAndEarthquakeTr &&
    row.comparisonTr === seed.comparisonTr &&
    isDeepStrictEqual(row.faqs, seed.faqs) &&
    row.sourcesNoteTr === seed.sourcesNoteTr &&
    isDeepStrictEqual(row.footnotes, seed.footnotes);

  if (!matches) {
    const diffs: string[] = [];
    if (row.region !== seed.region) diffs.push('region');
    if (row.slug !== seed.slug) diffs.push('slug');
    if (row.nameTr !== seed.nameTr) diffs.push('nameTr');
    if (row.headingName !== seed.headingName) diffs.push('headingName');
    if (row.metaTitle !== seed.metaTitle) diffs.push('metaTitle');
    if (row.metaDescription !== seed.metaDescription) diffs.push('metaDescription');
    if (row.h1 !== seed.h1) diffs.push('h1');
    if (row.introTr !== seed.introTr) diffs.push('introTr');
    if (row.highestPointName !== (seed.highestPointName ?? null)) diffs.push('highestPointName');
    if (row.highestPointElevationM !== (seed.highestPointElevationM ?? null))
      diffs.push('highestPointElevationM');
    if (row.highestPointProvince !== (seed.highestPointProvince ?? null))
      diffs.push('highestPointProvince');
    if (!isDeepStrictEqual(row.coastalSeas, seed.coastalSeas)) diffs.push('coastalSeas');
    if (!isDeepStrictEqual(row.neighborRegions, seed.neighborRegions))
      diffs.push('neighborRegions');
    if (!isDeepStrictEqual(row.neighborCountries, seed.neighborCountries))
      diffs.push('neighborCountries');
    if (!isDeepStrictEqual(row.subregions, seed.subregions)) diffs.push('subregions');
    if (!gdpMatches)
      diffs.push(`gdp: row=${row.gdpShareApproxPercent} seed=${seed.gdpShareApproxPercent}`);
    if (row.locationAndBordersTr !== seed.locationAndBordersTr) diffs.push('locationAndBordersTr');
    if (row.landformsTr !== seed.landformsTr) diffs.push('landformsTr');
    if (row.climateAndVegetationTr !== seed.climateAndVegetationTr)
      diffs.push('climateAndVegetationTr');
    if (row.hydrographyTr !== seed.hydrographyTr) diffs.push('hydrographyTr');
    if (row.settlementAndPopulationTr !== seed.settlementAndPopulationTr)
      diffs.push('settlementAndPopulationTr');
    if (row.economyTr !== seed.economyTr) diffs.push('economyTr');
    if (row.subregionsTr !== seed.subregionsTr) diffs.push('subregionsTr');
    if (row.disasterAndEarthquakeTr !== seed.disasterAndEarthquakeTr)
      diffs.push('disasterAndEarthquakeTr');
    if (row.comparisonTr !== seed.comparisonTr) diffs.push('comparisonTr');
    if (!isDeepStrictEqual(row.faqs, seed.faqs)) diffs.push('faqs');
    if (row.sourcesNoteTr !== seed.sourcesNoteTr) diffs.push('sourcesNoteTr');
    if (!isDeepStrictEqual(row.footnotes, seed.footnotes)) diffs.push('footnotes');
    console.log(`[seedRegions mismatch ${seed.slug}]:`, diffs.join(', '));
  }

  return matches;
}

/**
 * Transactional, idempotent seeder for the 7 geographic regions of Türkiye.
 */
export async function seedRegions(
  dataSource: DataSource,
  regions: readonly RegionSeed[] = SEED_REGIONS,
): Promise<SeedRegionsResult> {
  let inserted = 0;
  let updated = 0;
  let unchanged = 0;

  await dataSource.transaction(async (manager) => {
    const repo = manager.getRepository(Region);

    for (const seed of regions) {
      try {
        const existing = await repo.findOne({ where: { region: seed.region } });

        if (!existing) {
          await repo.save(repo.create(seed));
          inserted += 1;
        } else if (rowMatchesSeed(existing, seed)) {
          unchanged += 1;
        } else {
          repo.merge(existing, seed);
          await repo.save(existing);
          updated += 1;
        }
      } catch (cause) {
        throw new Error(`Seeding region [${seed.region}] ${seed.nameTr} failed.`, { cause });
      }
    }
  });

  return { inserted, updated, unchanged, total: regions.length };
}
