import { randomUUID } from 'node:crypto';
import { JwtService } from '@nestjs/jwt';
import { describe, expect, it } from '@jest/globals';
import {
  AccessTokenService,
  AccessTokenVerificationError,
  type AccessTokenPayload,
} from './access-token.service';
import { ACCESS_TOKEN_TTL_SECONDS, AUTH_TOKEN_AUDIENCE, AUTH_TOKEN_ISSUER } from './auth.constants';
import type { AuthSecretsProvider } from './auth-secrets.provider';

const SECRET = 'a'.repeat(32);
const SUBJECT = '11111111-1111-4111-8111-111111111111';

function stubSecrets(secret: string): AuthSecretsProvider {
  return {
    getJwtSecret: () => secret,
    getHmacPepper: () => 'unused-in-this-suite',
  } as unknown as AuthSecretsProvider;
}

function decodeSegment(segment: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8')) as Record<string, unknown>;
}

function base64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function buildService(): AccessTokenService {
  return new AccessTokenService(new JwtService({}), stubSecrets(SECRET));
}

describe('AccessTokenService.mint', () => {
  it('produces a token whose claim key set is EXACTLY the closed list — nothing forbidden', async () => {
    const service = buildService();
    const token = await service.mint(SUBJECT, 3);
    const [, payloadSegment] = token.split('.');
    const payload = decodeSegment(payloadSegment as string);

    expect(Object.keys(payload).sort()).toEqual(
      ['aud', 'exp', 'iat', 'iss', 'jti', 'sub', 'sv', 'typ'].sort(),
    );

    const forbidden = [
      'email',
      'firstName',
      'lastName',
      'phone',
      'districtId',
      'accountRole',
      'educationLevel',
      'gradeLevel',
      'studyStream',
      'universityName',
      'departmentName',
      'role',
      'passwordHash',
    ];
    for (const key of forbidden) {
      expect(payload).not.toHaveProperty(key);
    }
  });

  it('carries sub/sv/typ/iss/aud correctly', async () => {
    const service = buildService();
    const token = await service.mint(SUBJECT, 5);
    const [, payloadSegment] = token.split('.');
    const payload = decodeSegment(payloadSegment as string);

    expect(payload).toMatchObject({
      sub: SUBJECT,
      sv: 5,
      typ: 'access',
      iss: AUTH_TOKEN_ISSUER,
      aud: AUTH_TOKEN_AUDIENCE,
    });
  });

  it('sets exp EXACTLY ACCESS_TOKEN_TTL_SECONDS after iat — the imported constant, not a retyped number', async () => {
    const service = buildService();
    const token = await service.mint(SUBJECT, 0);
    const [, payloadSegment] = token.split('.');
    const payload = decodeSegment(payloadSegment as string) as { iat: number; exp: number };

    expect(payload.exp - payload.iat).toBe(ACCESS_TOKEN_TTL_SECONDS);
  });
});

describe('AccessTokenService.verify', () => {
  it('accepts a token it minted itself and returns the exact closed payload', async () => {
    const service = buildService();
    const token = await service.mint(SUBJECT, 2);
    const payload: AccessTokenPayload = await service.verify(token);

    expect(payload.sub).toBe(SUBJECT);
    expect(payload.sv).toBe(2);
    expect(payload.typ).toBe('access');
  });

  it('rejects alg: none (an unsigned token)', async () => {
    const service = buildService();
    const now = Math.floor(Date.now() / 1000);
    const header = base64UrlJson({ alg: 'none', typ: 'JWT' });
    const payload = base64UrlJson({
      sub: SUBJECT,
      sv: 0,
      typ: 'access',
      iss: AUTH_TOKEN_ISSUER,
      aud: AUTH_TOKEN_AUDIENCE,
      iat: now,
      exp: now + ACCESS_TOKEN_TTL_SECONDS,
      jti: randomUUID(),
    });
    const noneToken = `${header}.${payload}.`;

    await expect(service.verify(noneToken)).rejects.toBeInstanceOf(AccessTokenVerificationError);
  });

  it('rejects a header swapped to HS512 — the algorithm check runs before signature trust', async () => {
    const service = buildService();
    const validToken = await service.mint(SUBJECT, 0);
    const [headerSegment, payloadSegment, signatureSegment] = validToken.split('.');
    const decodedHeader = decodeSegment(headerSegment as string);
    const swappedHeader = base64UrlJson({ ...decodedHeader, alg: 'HS512' });
    const swappedToken = `${swappedHeader}.${payloadSegment}.${signatureSegment}`;

    await expect(service.verify(swappedToken)).rejects.toBeInstanceOf(AccessTokenVerificationError);
  });

  it('rejects a genuinely HS512-signed token — algorithms is a real allowlist, not cosmetic', async () => {
    const service = buildService();
    const hs512Token = await new JwtService({}).signAsync(
      { sv: 0, typ: 'access' as const },
      {
        secret: SECRET,
        algorithm: 'HS512',
        issuer: AUTH_TOKEN_ISSUER,
        audience: AUTH_TOKEN_AUDIENCE,
        subject: SUBJECT,
        jwtid: randomUUID(),
        expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      },
    );

    await expect(service.verify(hs512Token)).rejects.toBeInstanceOf(AccessTokenVerificationError);
  });

  it('rejects a wrong issuer', async () => {
    const service = buildService();
    const token = await new JwtService({}).signAsync(
      { sv: 0, typ: 'access' as const },
      {
        secret: SECRET,
        algorithm: 'HS256',
        issuer: 'not-cografya-api',
        audience: AUTH_TOKEN_AUDIENCE,
        subject: SUBJECT,
        jwtid: randomUUID(),
        expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      },
    );

    await expect(service.verify(token)).rejects.toBeInstanceOf(AccessTokenVerificationError);
  });

  it('rejects a wrong audience', async () => {
    const service = buildService();
    const token = await new JwtService({}).signAsync(
      { sv: 0, typ: 'access' as const },
      {
        secret: SECRET,
        algorithm: 'HS256',
        issuer: AUTH_TOKEN_ISSUER,
        audience: 'not-cografya-web',
        subject: SUBJECT,
        jwtid: randomUUID(),
        expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      },
    );

    await expect(service.verify(token)).rejects.toBeInstanceOf(AccessTokenVerificationError);
  });

  it('rejects an expired token', async () => {
    const service = buildService();
    const token = await new JwtService({}).signAsync(
      { sv: 0, typ: 'access' as const },
      {
        secret: SECRET,
        algorithm: 'HS256',
        issuer: AUTH_TOKEN_ISSUER,
        audience: AUTH_TOKEN_AUDIENCE,
        subject: SUBJECT,
        jwtid: randomUUID(),
        expiresIn: -10,
      },
    );

    await expect(service.verify(token)).rejects.toBeInstanceOf(AccessTokenVerificationError);
  });

  it('rejects a token with a corrupted signature', async () => {
    const service = buildService();
    const token = await service.mint(SUBJECT, 0);
    const tampered = token.slice(0, -1) + (token.endsWith('A') ? 'B' : 'A');

    await expect(service.verify(tampered)).rejects.toBeInstanceOf(AccessTokenVerificationError);
  });

  it("rejects typ: 'refresh' even with an otherwise perfectly valid signature/issuer/audience", async () => {
    const service = buildService();
    const token = await new JwtService({}).signAsync(
      { sv: 0, typ: 'refresh' as const },
      {
        secret: SECRET,
        algorithm: 'HS256',
        issuer: AUTH_TOKEN_ISSUER,
        audience: AUTH_TOKEN_AUDIENCE,
        subject: SUBJECT,
        jwtid: randomUUID(),
        expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      },
    );

    await expect(service.verify(token)).rejects.toBeInstanceOf(AccessTokenVerificationError);
  });

  it('rejects a token signed under a different secret', async () => {
    const token = await new AccessTokenService(
      new JwtService({}),
      stubSecrets('b'.repeat(32)),
    ).mint(SUBJECT, 0);
    const service = buildService();

    await expect(service.verify(token)).rejects.toBeInstanceOf(AccessTokenVerificationError);
  });

  it('rejects a token carrying an extra, unlisted claim', async () => {
    const service = buildService();
    const token = await new JwtService({}).signAsync(
      { sv: 0, typ: 'access' as const, role: 'admin' },
      {
        secret: SECRET,
        algorithm: 'HS256',
        issuer: AUTH_TOKEN_ISSUER,
        audience: AUTH_TOKEN_AUDIENCE,
        subject: SUBJECT,
        jwtid: randomUUID(),
        expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      },
    );

    await expect(service.verify(token)).rejects.toBeInstanceOf(AccessTokenVerificationError);
  });

  it('rejects a non-uuid subject', async () => {
    const service = buildService();
    const token = await new JwtService({}).signAsync(
      { sv: 0, typ: 'access' as const },
      {
        secret: SECRET,
        algorithm: 'HS256',
        issuer: AUTH_TOKEN_ISSUER,
        audience: AUTH_TOKEN_AUDIENCE,
        subject: 'not-a-uuid',
        jwtid: randomUUID(),
        expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      },
    );

    await expect(service.verify(token)).rejects.toBeInstanceOf(AccessTokenVerificationError);
  });

  it('rejects a negative token version', async () => {
    const service = buildService();
    const token = await new JwtService({}).signAsync(
      { sv: -1, typ: 'access' as const },
      {
        secret: SECRET,
        algorithm: 'HS256',
        issuer: AUTH_TOKEN_ISSUER,
        audience: AUTH_TOKEN_AUDIENCE,
        subject: SUBJECT,
        jwtid: randomUUID(),
        expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      },
    );

    await expect(service.verify(token)).rejects.toBeInstanceOf(AccessTokenVerificationError);
  });
});
