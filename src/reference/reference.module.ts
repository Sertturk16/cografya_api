import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DistrictController } from './district.controller';
import { DistrictService } from './district.service';
import { District } from './entities/district.entity';

/**
 * The reference lists the registration form reads.
 *
 * One module rather than one per list, because they share a route prefix, a cache posture and a
 * reason to exist. The plan's PR-2 adds the üniversite and bölüm lists here as compile-time
 * constants — no entity, no migration, no repository — so `forFeature` stays at `District`.
 */
@Module({
  imports: [TypeOrmModule.forFeature([District])],
  controllers: [DistrictController],
  providers: [DistrictService],
})
export class ReferenceModule {}
