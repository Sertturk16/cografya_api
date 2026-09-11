import { MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { BookVideo } from '../book/entities/book-video.entity';
import { VideoIdentityController } from './video-identity.controller';
import { VideoIdentityNoStoreMiddleware } from './video-identity-no-store.middleware';
import { VideoIdentityService } from './video-identity.service';

/**
 * P2 (`UYE-VIDEO-KIMLIK-UCU`): the guarded video-identity module — one entity, no migration, one
 * protected read, no scheduled work and no external provider. `AuthModule` is imported for
 * {@link AccessTokenGuard}'s own dependency, exactly as `VideoProgressModule` does — this module
 * only needs `AuthModule`'s export surface (`AccessTokenGuard` + `AuthUserLookupService`) usable,
 * never redeclares it.
 *
 * `BookVideo` joins `forFeature` here rather than via `BookModule` (plan §5.2): `BookModule`'s own
 * `exports` carries no `Book`/`BookVideo` repository, and importing that whole module would also
 * pull in its YouTube sync providers and scheduled tours for the sake of one repository — the same
 * reasoning `VideoProgressModule`'s own docblock states for the identical choice.
 *
 * **Not `BookModule`:** `BookController`'s own docblock states "No auth guard, by design" as a
 * class-level design claim; adding a second, guarded controller inside that module would
 * contradict the claim even though NestJS would technically allow the per-route guard.
 *
 * **Not `VideoProgressModule`:** semantically a different concern — progress is a persisted,
 * per-user state, identity is a stateless content lookup identical for every member — so this is a
 * sibling module, not an extension of that one.
 */
@Module({
  imports: [TypeOrmModule.forFeature([BookVideo]), AuthModule],
  controllers: [VideoIdentityController],
  providers: [VideoIdentityService],
})
export class VideoIdentityModule implements NestModule {
  /**
   * `Cache-Control: no-store` on every response this module's one route produces — see
   * {@link VideoIdentityNoStoreMiddleware}'s own docblock for the full mechanism.
   */
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(VideoIdentityNoStoreMiddleware).forRoutes(VideoIdentityController);
  }
}
