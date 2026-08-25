import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from '@jest/globals';
import { AUTH_ERROR_KEYS } from './auth-error-keys';

/**
 * **AUTH-C1** (D16) — the auth sözleşme guard. Runs against the COMMITTED `openapi/openapi.json`,
 * needs no database and no HTTP stack, so it lives in the UNIT lane (`ENGINEERING.md` §8: "a
 * module that needs no database belongs there") — the `book.contract.spec.ts` emsali this class
 * follows: donmuş bir sözleşme guard'ının container gerektirmeyen hızlı işte koşması, drift
 * yakalama olasılığını artırır.
 *
 * **Structural only** (`CONVENTIONS.md` §2): no literal fact about a university, a department or
 * an ilçe is asserted here — this file pins the AUTH surface's SHAPE, not its content.
 */
describe('openapi/openapi.json — auth contract (AUTH-C1)', () => {
  const raw = readFileSync(join(__dirname, '..', '..', 'openapi', 'openapi.json'), 'utf8');
  const document = JSON.parse(raw) as {
    paths: Record<string, Record<string, unknown>>;
    components: {
      schemas: Record<string, { properties?: Record<string, unknown>; required?: string[] }>;
      securitySchemes?: Record<string, { type?: string; scheme?: string; bearerFormat?: string }>;
    };
  };

  type OperationWithSecurity = { security?: { [key: string]: string[] }[] };
  type EnumProperty = { enum?: string[] };
  type SecretFieldProperty = { writeOnly?: boolean; example?: unknown };

  it('publishes exactly the nine auth paths, with the right HTTP methods', () => {
    const expected: Record<string, string> = {
      '/api/auth/register': 'post',
      '/api/auth/verify-email': 'post',
      '/api/auth/verify-email/resend': 'post',
      '/api/auth/login': 'post',
      '/api/auth/refresh': 'post',
      '/api/auth/logout': 'post',
      '/api/auth/password-reset/request': 'post',
      '/api/auth/password-reset/confirm': 'post',
      '/api/auth/session': 'get',
    };
    const entries = Object.entries(expected);
    expect(entries.length).toBe(9);
    for (const [path, method] of entries) {
      const operations = document.paths[path];
      expect(`${path}:present=${String(operations !== undefined)}`).toBe(`${path}:present=true`);
      expect(`${path}:${method}=${String(operations?.[method] !== undefined)}`).toBe(
        `${path}:${method}=true`,
      );
    }
  });

  it('publishes exactly the ten DTO schema names §13.3 froze', () => {
    const expectedSchemas = [
      'RegisterRequestDto',
      'VerifyEmailRequestDto',
      'ResendVerificationRequestDto',
      'LoginRequestDto',
      'RefreshRequestDto',
      'LogoutRequestDto',
      'PasswordResetRequestDto',
      'PasswordResetConfirmDto',
      'AuthResultDto',
      'SessionDto',
    ];
    expect(expectedSchemas.length).toBe(10);
    for (const name of expectedSchemas) {
      expect(`${name}:${String(document.components.schemas[name] !== undefined)}`).toBe(
        `${name}:true`,
      );
    }
  });

  it('publishes AuthResultDto’s exact four required fields', () => {
    const schema = document.components.schemas.AuthResultDto;
    const fields = [
      'accessToken',
      'accessTokenExpiresInSeconds',
      'refreshToken',
      'refreshTokenExpiresInSeconds',
    ];
    for (const field of fields) {
      expect(schema?.properties?.[field]).toBeDefined();
    }
    expect([...(schema?.required ?? [])].sort()).toEqual([...fields].sort());
  });

  it('publishes SessionDto’s exact three required fields — the minimum PII set (§7.3)', () => {
    const schema = document.components.schemas.SessionDto;
    const fields = ['id', 'firstName', 'accountRole'];
    for (const field of fields) {
      expect(schema?.properties?.[field]).toBeDefined();
    }
    expect([...(schema?.required ?? [])].sort()).toEqual([...fields].sort());
    // §7.3's negative half: none of the excluded PII fields ever leaked into this schema.
    for (const excluded of [
      'email',
      'phone',
      'lastName',
      'districtId',
      'educationLevel',
      'universityName',
      'departmentName',
    ]) {
      expect(schema?.properties?.[excluded]).toBeUndefined();
    }
  });

  /**
   * **What this case measures, stated because it was once read as more than it is**
   * (`SEC136-I4`). `raw.includes(key)` proves a key is DECLARED somewhere in the published
   * document — nothing more. It cannot tell a key that some code path throws from a key that only
   * appears inside a prose description, and for `errors.auth.rateLimited` that difference was
   * real: the key was published on `register`'s 429 while the actual body carried
   * `@nestjs/throttler`'s English prose.
   *
   * The gap is closed where it can be closed — by a control that reads a real response body:
   * `test/auth-security.e2e-spec.ts`'s T3 drives a genuine 429 and asserts its `message` equals
   * `AUTH_ERROR_KEYS.rateLimited`, and the remaining nine keys are each asserted on the response
   * that produces them across the endpoint and security suites. This case keeps its narrower job,
   * which is a contract-publication check, and now says so instead of implying the wider one.
   */
  it('DECLARES every one of the ten i18n error keys (§6.3) somewhere in the contract', () => {
    const values = Object.values(AUTH_ERROR_KEYS);
    expect(values.length).toBe(10);
    for (const key of values) {
      expect(`${key}:published=${String(raw.includes(key))}`).toBe(`${key}:published=true`);
    }
  });

  it('publishes the access-token bearer security scheme, used only by GET /api/auth/session', () => {
    const scheme = document.components.securitySchemes?.['access-token'];
    expect(scheme).toEqual({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' });

    const sessionSecurity = document.paths['/api/auth/session']?.get as
      OperationWithSecurity | undefined;
    expect(sessionSecurity?.security).toEqual([{ 'access-token': [] }]);

    // No OTHER auth route carries a security requirement — every one of the other eight is
    // unauthenticated by design (D3, D8: the guard is opt-in, never global).
    for (const [path, operations] of Object.entries(document.paths)) {
      if (!path.startsWith('/api/auth/') || path === '/api/auth/session') continue;
      for (const operation of Object.values(operations)) {
        expect((operation as { security?: unknown }).security).toBeUndefined();
      }
    }
  });

  /**
   * D17: enum member sets are asserted IN PLACE on each property, never by looking for a named
   * `components.schemas` entry — the repo's existing convention publishes enums inline
   * (`UniversityType` is the measured precedent: `enum` in the property, absent from
   * `components.schemas`), and `openapi-typescript` turns an inline enum into the same
   * string-literal union a named schema would, so Vera's generated type is unaffected either way.
   */
  it('publishes all four registration enums with their exact, closed member sets, inline', () => {
    const registerProperties = document.components.schemas.RegisterRequestDto?.properties as
      Record<string, EnumProperty> | undefined;

    const expectedMembers: Record<string, string[]> = {
      accountRole: ['STUDENT', 'TEACHER'],
      educationLevel: ['SECONDARY', 'UNDERGRADUATE', 'GRADUATE'],
      gradeLevel: [
        'GRADE_5',
        'GRADE_6',
        'GRADE_7',
        'GRADE_8',
        'GRADE_9',
        'GRADE_10',
        'GRADE_11',
        'GRADE_12',
        'MEZUN',
        'KPSS',
        'DIGER',
      ],
      studyStream: [
        'SAYISAL',
        'SOZEL',
        'ESIT_AGIRLIK',
        'TYT',
        'DIL',
        'LGS',
        'MSU',
        'ARA_SINIF',
        'KPSS',
        'DIGER',
      ],
    };

    for (const [field, members] of Object.entries(expectedMembers)) {
      const property = registerProperties?.[field];
      expect(`${field}:present=${String(property !== undefined)}`).toBe(`${field}:present=true`);
      expect([...(property?.enum ?? [])].sort()).toEqual([...members].sort());
    }

    // D17's negative half: no named enum schema was minted for any of the four.
    for (const named of ['AccountRole', 'EducationLevel', 'GradeLevel', 'StudyStream']) {
      expect(document.components.schemas[named]).toBeUndefined();
    }
  });

  it('never publishes an example on a secret-bearing field, and every one is writeOnly', () => {
    const secretFieldsBySchema: Record<string, string[]> = {
      RegisterRequestDto: ['password'],
      VerifyEmailRequestDto: ['code'],
      LoginRequestDto: ['password'],
      RefreshRequestDto: ['refreshToken'],
      LogoutRequestDto: ['refreshToken'],
      PasswordResetConfirmDto: ['resetToken', 'password'],
    };
    for (const [schemaName, fields] of Object.entries(secretFieldsBySchema)) {
      const properties = document.components.schemas[schemaName]?.properties as
        Record<string, SecretFieldProperty> | undefined;
      for (const field of fields) {
        const property = properties?.[field];
        expect(`${schemaName}.${field}:writeOnly=${String(property?.writeOnly === true)}`).toBe(
          `${schemaName}.${field}:writeOnly=true`,
        );
        expect(`${schemaName}.${field}:hasExample=${String('example' in (property ?? {}))}`).toBe(
          `${schemaName}.${field}:hasExample=false`,
        );
      }
    }
  });
});
