import { MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { GameRound } from './entities/game-round.entity';
import { GameRoundsController } from './game-rounds.controller';
import { GameRoundsNoStoreMiddleware } from './game-rounds-no-store.middleware';
import { GameRoundsService } from './game-rounds.service';

/**
 * UYELIK-09: the game-rounds module — one entity, one migration, two protected submit/list-mine
 * endpoints, no scheduled work and no external provider. `AuthModule` is imported for
 * {@link AccessTokenGuard}'s own dependency, mirroring `FavoritesModule`'s own precedent exactly
 * — this module only needs `AuthModule`'s export surface usable, never any repository under it.
 *
 * No sibling entity is registered here — unlike `FavoritesModule` (`Province`/`Country`), this
 * module resolves no external business key before writing (plan §5.1): `GameRound` is the only
 * entity `TypeOrmModule.forFeature()` needs.
 */
@Module({
  imports: [TypeOrmModule.forFeature([GameRound]), AuthModule],
  controllers: [GameRoundsController],
  providers: [GameRoundsService],
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
