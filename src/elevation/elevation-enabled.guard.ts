import { Injectable, NotFoundException, type CanActivate } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.schema';

/**
 * Gates the profile endpoint on `ELEVATION_ENABLED` — with a 404, following `MarineEnabledGuard`.
 *
 * A 404 rather than a 503: while the feature is off this path does not exist. A 503 would
 * advertise a temporary outage of something that has never launched and would teach crawlers to
 * come back for it.
 *
 * A GUARD rather than conditional module registration (the marine Atlas ruling U-2): the module
 * graph then stays identical in every environment, an e2e exercises both states by flipping one
 * variable, and there is no second wiring topology to keep correct. It also makes the important
 * guarantee checkable — with the flag off the guard throws BEFORE the handler, so no branch
 * reaches a provider.
 *
 * The 404 body is the framework's default: no authored prose, per the i18n rule.
 */
@Injectable()
export class ElevationEnabledGuard implements CanActivate {
  constructor(private readonly config: ConfigService<Env, true>) {}

  canActivate(): boolean {
    if (!this.config.getOrThrow('ELEVATION_ENABLED', { infer: true })) {
      throw new NotFoundException();
    }
    return true;
  }
}
