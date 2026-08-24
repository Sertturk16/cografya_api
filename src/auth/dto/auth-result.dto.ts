import { ApiProperty } from '@nestjs/swagger';

/**
 * The response body of every auth endpoint that mints a fresh token pair — register-after-verify,
 * login and refresh (§13.3). `password-reset/confirm` deliberately does NOT return this: it ends
 * with 204 and no new session (§5.4.3's "reset deosn't open a session" rule).
 *
 * **D9 lives here — this is its ONLY recorded home** (`ENGINEERING.md` §2's ruling that a
 * Response tier is decided "when the first write endpoint lands and recorded in this file"
 * cannot be honoured this turn: `MIRROR.md` §1 keeps `cografya_api/ENGINEERING.md` read-only in
 * V3, so the ruling is recorded here and in the plan instead, and flagged to Atlas as an open
 * question — parent plan §20 Q1, Faz 2 dispatch closed it: `ENGINEERING.md` stays untouched).
 *
 * **D9 — Request/Response are two separate DTO tiers, never one class reused in both
 * directions.** Every `…RequestDto` in this package carries a secret going IN (`password`, a
 * verification code, a reset token); `AuthResultDto` carries secrets coming OUT
 * (`accessToken`/`refreshToken`) and nothing else. Reusing one class for both directions turns
 * "echo the request back" into a one-line accident that leaks a password. The two tiers never
 * share a base class for the same reason `ENGINEERING.md` §2 gives for query DTOs: there is
 * nothing correct for them to share.
 */
export class AuthResultDto {
  @ApiProperty({
    description: 'Kısa ömürlü access JWT (§5.1) — `Authorization: Bearer <token>` ile sunulur.',
  })
  accessToken!: string;

  @ApiProperty({
    example: 900,
    description: 'accessToken kaç saniye içinde geçersiz olur (ACCESS_TOKEN_TTL_SECONDS).',
  })
  accessTokenExpiresInSeconds!: number;

  @ApiProperty({
    description:
      'Opak refresh token (§5.2.1) — sonraki `/api/auth/refresh` çağrısının gövdesinde sunulur.',
  })
  refreshToken!: string;

  @ApiProperty({
    example: 2_592_000,
    description: 'refreshToken kaç saniye içinde geçersiz olur (REFRESH_TOKEN_TTL_DAYS × 86400).',
  })
  refreshTokenExpiresInSeconds!: number;
}
