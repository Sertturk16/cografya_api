import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DistrictController } from './district.controller';
import { DistrictService } from './district.service';
import { District } from './entities/district.entity';
import { ReferenceConstantsController } from './reference-constants.controller';

/**
 * The reference lists the registration form reads.
 *
 * One module rather than one per list, because they share a route prefix, a cache posture and a
 * reason to exist. PR-2 added the üniversite and bölüm lists as compile-time constants — no
 * entity, no migration, no repository, and no service either — so `forFeature` stays at
 * `District` and `providers` names only the ilçe service.
 */
@Module({
  imports: [TypeOrmModule.forFeature([District])],
  controllers: [DistrictController, ReferenceConstantsController],
  providers: [DistrictService],
})
export class ReferenceModule {}
