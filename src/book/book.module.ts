import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BookController } from './book.controller';
import { BookService } from './book.service';
import { BookVideoQuestion } from './entities/book-video-question.entity';
import { BookVideo } from './entities/book-video.entity';
import { Book } from './entities/book.entity';

/**
 * The book read module (B3).
 *
 * `youtube_video_snapshots` is deliberately absent from `forFeature`: nothing in this module reads
 * the perishable table. B4 registers it when it lands the sync leg and the serving path.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Book, BookVideo, BookVideoQuestion])],
  controllers: [BookController],
  providers: [BookService],
})
export class BookModule {}
