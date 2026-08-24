import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ACCESS_TOKEN_TTL_SECONDS, AUTH_TOKEN_AUDIENCE, AUTH_TOKEN_ISSUER } from './auth.constants';
import { AuthSecretsProvider } from './auth-secrets.provider';

/** A UUIDv4 shape (`gen_random_uuid()`'s output), never accepted loosely as "any string". */
const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** The access JWT's closed claim set (§5.1) — nothing else is ever minted or accepted. */
export interface AccessTokenPayload {
  readonly sub: string;
  readonly sv: number;
  readonly typ: 'access';
  readonly iss: string;
  readonly aud: string;
  readonly iat: number;
  readonly exp: number;
  readonly jti: string;
}

const EXPECTED_CLAIM_KEYS = ['aud', 'exp', 'iat', 'iss', 'jti', 'sub', 'sv', 'typ'] as const;

/** Thrown on ANY verification failure — signature, shape or claim-set. Never partial. */
export class AccessTokenVerificationError extends Error {
  constructor() {
    super('Access token verification failed.');
    this.name = 'AccessTokenVerificationError';
  }
}

/**
 * Mints and verifies the short-lived access JWT (§5.1).
 *
 * The claim set is closed BY CONSTRUCTION, not by convention: the only fields ever passed as
 * the JWT PAYLOAD are `sv` and `typ`. `sub`, `iss`, `aud`, `jti`, `iat` and `exp` are
 * `jsonwebtoken`'s own registered-claim SIGN OPTIONS (`subject`, `issuer`, `audience`,
 * `jwtid`, `expiresIn`) — never duplicated in the payload object, which is what keeps the two
 * from silently drifting apart (`jsonwebtoken` refuses a payload that ALSO declares a
 * registered claim already set via options). Never carries PII: no email, name, phone,
 * `districtId`, `accountRole`, `educationLevel`, `gradeLevel`, `studyStream`,
 * `universityName`, `departmentName`, `role` or `passwordHash` ever reaches this class.
 *
 * **Module wiring note (a deliberate deviation from the plan's `JwtModule.registerAsync`
 * shorthand):** `AuthModule` registers `JwtModule.register({})` — no module-level secret —
 * and this service passes `secret: this.secrets.getJwtSecret()` explicitly on every
 * `signAsync`/`verifyAsync` call instead. `JwtModule.registerAsync`'s factory-based
 * `JWT_MODULE_OPTIONS` provider would need `AuthSecretsProvider` injected into the DYNAMIC
 * submodule `JwtModule.registerAsync` constructs, which is a DIFFERENT injector context than
 * `AuthModule`'s own `providers` array (Nest resolves a dynamic module's async factory
 * dependencies only from that module's OWN providers or from modules named in its own
 * `imports`, not from the sibling that imports it) — routing `AuthSecretsProvider` through
 * there would need a separate module wrapper for one class. Passing the secret per call is
 * simpler, and is also strictly MORE explicit and auditable, in the same spirit as this
 * class's per-call `algorithms`/`issuer`/`audience`/`clockTolerance` (§5.1's "verification is
 * always explicit").
 */
@Injectable()
export class AccessTokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly secrets: AuthSecretsProvider,
  ) {}

  /** Mints an access token carrying only `sub` (via `subject`) and `sv`. */
  async mint(userId: string, tokenVersion: number): Promise<string> {
    return this.jwtService.signAsync(
      { sv: tokenVersion, typ: 'access' as const },
      {
        secret: this.secrets.getJwtSecret(),
        algorithm: 'HS256',
        issuer: AUTH_TOKEN_ISSUER,
        audience: AUTH_TOKEN_AUDIENCE,
        subject: userId,
        jwtid: randomUUID(),
        expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      },
    );
  }

  /**
   * Verifies signature, algorithm, issuer, audience and expiry with `clockTolerance: 0` and
   * `algorithms: ['HS256']` explicit (never read `alg` off the token itself — the algorithm-
   * confusion class), then asserts the decoded payload carries EXACTLY the closed claim set
   * and that `typ === 'access'`. Throws `AccessTokenVerificationError` on any failure —
   * signature, shape, or claim mismatch alike — and never returns a partial result.
   */
  async verify(token: string): Promise<AccessTokenPayload> {
    let decoded: Record<string, unknown>;
    try {
      decoded = await this.jwtService.verifyAsync<Record<string, unknown>>(token, {
        secret: this.secrets.getJwtSecret(),
        algorithms: ['HS256'],
        issuer: AUTH_TOKEN_ISSUER,
        audience: AUTH_TOKEN_AUDIENCE,
        clockTolerance: 0,
      });
    } catch {
      // Deliberately WIDE — do not narrow to `if (error instanceof JsonWebTokenError) …; throw
      // error;`. `jsonwebtoken`'s underlying `jws` dependency parses the payload segment with an
      // UNPROTECTED `JSON.parse` before the signature is ever checked, so a token whose payload
      // is valid base64url but invalid JSON throws a raw `SyntaxError` — not a
      // `JsonWebTokenError` — and that `SyntaxError`'s `message` embeds the first bytes of the
      // attacker-supplied payload (measured against the pinned dependency versions, VAL135-I1).
      // A narrower catch would let that error — and the leaked bytes inside it — escape
      // unwrapped. Pinned by the "payload segment is valid base64url but not valid JSON" case in
      // access-token.service.spec.ts, which must stay red under any such narrowing.
      throw new AccessTokenVerificationError();
    }

    const actualKeys = Object.keys(decoded).sort();
    const hasExactClaimSet =
      actualKeys.length === EXPECTED_CLAIM_KEYS.length &&
      actualKeys.every((key, index) => key === EXPECTED_CLAIM_KEYS[index]);
    if (!hasExactClaimSet) throw new AccessTokenVerificationError();

    const { sub, sv, typ } = decoded;
    if (typ !== 'access') throw new AccessTokenVerificationError();
    if (typeof sub !== 'string' || !UUID_V4_PATTERN.test(sub)) {
      throw new AccessTokenVerificationError();
    }
    if (typeof sv !== 'number' || !Number.isInteger(sv) || sv < 0) {
      throw new AccessTokenVerificationError();
    }

    return decoded as unknown as AccessTokenPayload;
  }
}
