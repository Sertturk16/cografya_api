import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MarinePoint } from './entities/marine-point.entity';
import { MarineController } from './marine.controller';
import { MarineService } from './marine.service';

/**
 * Marine module — M1 scope: the reference-point read + the static layer catalogue.
 *
 * No HTTP client, no cache, no scheduled provider. Those arrive with M2 (cache/single-flight/
 * budget infrastructure), M3 (Open-Meteo) and M4 (CMEMS + warmup). Registering none of them
 * now keeps this module's failure surface at exactly "Postgres is reachable".
 */
@Module({
  imports: [TypeOrmModule.forFeature([MarinePoint])],
  controllers: [MarineController],
  providers: [MarineService],
})
export class MarineModule {}
