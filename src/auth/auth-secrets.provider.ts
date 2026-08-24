import { randomBytes } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.schema';

/**
 * Resolves the two auth signing secrets — `JWT_SECRET` and `AUTH_HMAC_PEPPER` — once per
 * process (§11, D6).
 *
 * Both are OPTIONAL in development/test and REQUIRED in production: `env.schema.ts`'s own
 * `superRefine` cross-check refuses to boot a production process missing either one (the
 * `REDIS_URL` E1 precedent, → DEC 2026-07-29b). Because that refusal already happened by the
 * time this provider is constructed, the ephemeral branch below is reachable ONLY in
 * development and test.
 *
 * When a secret is unset, this provider mints a random, PROCESS-LIFETIME value — restarting
 * the process invalidates every live token minted or verified under it, which is acceptable
 * in dev/test and refused outright in production by the boot schema. It says so LOUDLY, once,
 * regardless of whether one or both secrets needed minting. The secret VALUE is never logged,
 * here or anywhere downstream.
 */
@Injectable()
export class AuthSecretsProvider {
  private readonly logger = new Logger('AUTH');
  private readonly jwtSecret: string;
  private readonly hmacPepper: string;

  constructor(config: ConfigService<Env, true>) {
    const configuredJwtSecret = config.get('JWT_SECRET', { infer: true });
    const configuredHmacPepper = config.get('AUTH_HMAC_PEPPER', { infer: true });

    let mintedEphemeral = false;

    if (configuredJwtSecret === undefined) {
      this.jwtSecret = randomBytes(32).toString('base64url');
      mintedEphemeral = true;
    } else {
      this.jwtSecret = configuredJwtSecret;
    }

    if (configuredHmacPepper === undefined) {
      this.hmacPepper = randomBytes(32).toString('base64url');
      mintedEphemeral = true;
    } else {
      this.hmacPepper = configuredHmacPepper;
    }

    if (mintedEphemeral) {
      this.logger.warn('AUTH — ephemeral per-process signing key; tokens do not survive a restart');
    }
  }

  /** The access JWT's HS256 signing/verification key. */
  getJwtSecret(): string {
    return this.jwtSecret;
  }

  /** The pepper for the verification-code and rate-limit-subject HMAC digests (§5.3, §9.2). */
  getHmacPepper(): string {
    return this.hmacPepper;
  }
}
