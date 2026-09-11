import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BookVideo } from '../book/entities/book-video.entity';
import type { VideoIdentityDto } from './dto/video-identity.dto';
import { VIDEO_IDENTITY_ERROR_KEYS } from './video-identity-error-keys';

/**
 * One `BookVideo` repository read, for the caller-independent guarded identity lookup (plan §5.3).
 *
 * No transaction: a single read against a single table, with no cross-read consistency concern
 * the way `BookService.findBySlug`'s three-query snapshot has.
 */
@Injectable()
export class VideoIdentityService {
  constructor(
    @InjectRepository(BookVideo)
    private readonly videos: Repository<BookVideo>,
  ) {}

  async getIdentity(bookVideoId: string): Promise<VideoIdentityDto> {
    const video = await this.videos.findOne({ where: { id: bookVideoId } });
    if (video === null) throw new NotFoundException(VIDEO_IDENTITY_ERROR_KEYS.notFound);
    return { youtubeVideoId: video.youtubeVideoId };
  }
}
