import { MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { GameRoundSubmitRateLimit } from './entities/game-round-submit-rate-limit.entity';
import { GameRound } from './entities/game-round.entity';
import { GameRoundSubmitRateLimitGuard } from './game-round-submit-rate-limit.guard';
import { GameRoundSubmitRateLimitService } from './game-round-submit-rate-limit.service';
import { GameRoundsController } from './game-rounds.controller';
import { GameRoundsNoStoreMiddleware } from './game-rounds-no-store.middleware';
import { GameRoundsService } from './game-rounds.service';

/**
 * UYELIK-09: the game-rounds module — two entities, two migrations, two protected submit/
 * list-mine endpoints, no scheduled work and no external provider. `AuthModule` is imported for
 * {@link AccessTokenGuard}'s own dependency, mirroring `FavoritesModule`'s own precedent exactly
 * — this module only needs `AuthModule`'s export surface usable, never any repository under it.
 *
 * No BUSINESS-key sibling entity is registered here — unlike `FavoritesModule`
 * (`Province`/`Country`), this module resolves no external business key before writing (plan
 * §5.1). `GameRoundSubmitRateLimit` (fix-round-2, `SEC145-I1`/`VAL145-I1`) is registered
 * alongside `GameRound` for the same reason `AuthRateLimit` is registered in `AuthModule`: the
 * counter table's own service reads/writes it with `DataSource.query` directly, never a
 * `Repository`, but the entity's decorators still need to exist for `migration:generate` to
 * diff against (`ENGINEERING.md` §5).
 */
@Module({
  imports: [TypeOrmModule.forFeature([GameRound, GameRoundSubmitRateLimit]), AuthModule],
  controllers: [GameRoundsController],
  providers: [GameRoundsService, GameRoundSubmitRateLimitService, GameRoundSubmitRateLimitGuard],
})
export class GameRoundsModule implements NestModule {
  /**
   * `Cache-Control: no-store` on both routes this module registers — see
   * {@link GameRoundsNoStoreMiddleware}'s own docblock for the full mechanism.
   */
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(GameRoundsNoStoreMiddleware).forRoutes(GameRoundsController);
  }
}
