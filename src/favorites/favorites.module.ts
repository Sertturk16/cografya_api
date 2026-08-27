import { MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { Country } from '../country/entities/country.entity';
import { Province } from '../province/entities/province.entity';
import { Favorite } from './entities/favorite.entity';
import { FavoritesController } from './favorites.controller';
import { FavoritesNoStoreMiddleware } from './favorites-no-store.middleware';
import { FavoritesService } from './favorites.service';

/**
 * UYELIK-07: the favorites module — one entity, one migration, five protected list/add/remove
 * endpoints, no scheduled work and no external provider. `AuthModule` is imported for
 * {@link AccessTokenGuard}'s own dependency, mirroring `VideoProgressModule`'s own precedent
 * exactly — this module only needs `AuthModule`'s export surface (`AccessTokenGuard` +
 * `AuthUserLookupService`) usable, never any repository underneath it.
 *
 * `Province`/`Country` are registered here directly via `TypeOrmModule.forFeature`, not by
 * importing `ProvinceModule`/`CountryModule` — the same pattern `VideoProgressModule` already
 * uses for `BookVideo`/`YoutubeVideoSnapshot` (entities owned by a sibling module, re-registered
 * locally rather than pulling in that module's own controllers/providers).
 */
@Module({
  imports: [TypeOrmModule.forFeature([Favorite, Province, Country]), AuthModule],
  controllers: [FavoritesController],
  providers: [FavoritesService],
})
export class FavoritesModule implements NestModule {
  /**
   * `Cache-Control: no-store` on all five routes this module registers — see
   * {@link FavoritesNoStoreMiddleware}'s own docblock for the full mechanism.
   */
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(FavoritesNoStoreMiddleware).forRoutes(FavoritesController);
  }
}
