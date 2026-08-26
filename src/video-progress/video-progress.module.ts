import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { BookVideo } from '../book/entities/book-video.entity';
import { YoutubeVideoSnapshot } from '../book/entities/youtube-video-snapshot.entity';
import { VideoProgress } from './entities/video-progress.entity';
import { VideoProgressController } from './video-progress.controller';
import { VideoProgressService } from './video-progress.service';

/**
 * UYELIK-05: the video-progress module — one entity, one migration, protected read-one/upsert-one
 * endpoints, no scheduled work and no external provider. `AuthModule` is imported for
 * {@link AccessTokenGuard}'s own `User` repository dependency — `AccessTokenGuard` is provided by
 * `AuthModule` and this module only needs it usable, never redeclares it.
 */
@Module({
  imports: [TypeOrmModule.forFeature([VideoProgress, BookVideo, YoutubeVideoSnapshot]), AuthModule],
  controllers: [VideoProgressController],
  providers: [VideoProgressService],
})
export class VideoProgressModule {}
