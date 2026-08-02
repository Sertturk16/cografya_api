import { Injectable, NotFoundException, type CanActivate } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.schema';

/**
 * Gates the three marine VALUE endpoints on `MARINE_ENABLED` — with a 404, deliberately
 * (SPEC-ADDENDUM §7.9 lock: while the feature is off, these paths "do not exist"; a 503 would
 * advertise a temporary outage of something we have not launched, and would teach crawlers to
 * retry it).
 *
 * A GUARD rather than conditional module registration (Atlas ruling U-2): the observable
 * behaviour is identical, but the module graph stays the same in every environment — the
 * providers exist, e2e can exercise both states by flipping one env var, and there is no
 * second registration topology to keep correct. `/points` and `/layers` stay ungated (their
 * documented always-on posture: a Postgres read and a constant, no upstream on any branch).
 *
 * The 404 body is the framework's default — no authored prose, per the i18n rule.
 */
@Injectable()
export class MarineEnabledGuard implements CanActivate {
  constructor(private readonly config: ConfigService<Env, true>) {}

  canActivate(): boolean {
    if (!this.config.getOrThrow('MARINE_ENABLED', { infer: true })) {
      throw new NotFoundException();
    }
    return true;
  }
}
