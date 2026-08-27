import { MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { BookVideo } from '../book/entities/book-video.entity';
import { YoutubeVideoSnapshot } from '../book/entities/youtube-video-snapshot.entity';
import { VideoProgress } from './entities/video-progress.entity';
import { VideoProgressController } from './video-progress.controller';
import { VideoProgressNoStoreMiddleware } from './video-progress-no-store.middleware';
import { VideoProgressService } from './video-progress.service';

/**
 * UYELIK-05: the video-progress module — one entity, one migration, protected read-one/upsert-one
 * endpoints, no scheduled work and no external provider. `AuthModule` is imported for
 * {@link AccessTokenGuard}'s own dependency — `AccessTokenGuard` is provided by `AuthModule` and
 * this module only needs it usable, never redeclares it. As of the PR #141 round-1 fix that
 * dependency is `AuthUserLookupService`, not a raw `Repository<User>` — this module only needs
 * `AuthModule`'s export surface (`AccessTokenGuard` + `AuthUserLookupService`) usable, not any
 * repository underneath it.
 */
@Module({
  imports: [TypeOrmModule.forFeature([VideoProgress, BookVideo, YoutubeVideoSnapshot]), AuthModule],
  controllers: [VideoProgressController],
  providers: [VideoProgressService],
})
export class VideoProgressModule implements NestModule {
  /**
   * `Cache-Control: no-store` on both routes this module registers — see
   * {@link VideoProgressNoStoreMiddleware}'s own docblock for the full mechanism (PR #141 round-1
   * review IMPORTANT finding: a `@Header()` decorator misses a guard-rejected response, exactly the
   * defect class `CODE136-I2`/`TA136-I1` already found and fixed for the auth routes).
   */
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(VideoProgressNoStoreMiddleware).forRoutes(VideoProgressController);
  }
}
