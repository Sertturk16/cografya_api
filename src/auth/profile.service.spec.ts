import type { DataSource, Repository } from 'typeorm';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AccountRole, EducationLevel, GradeLevel, StudyStream } from './account.types';
import { marketingConsentPatch, ProfileService, type ProfileRow } from './profile.service';
import { User } from './entities/user.entity';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const DISTRICT_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_DISTRICT_ID = '33333333-3333-4333-8333-333333333333';

/**
 * The joined row `readProfileRow`'s single query returns. Column names are the SQL aliases,
 * not entity property names — the mapping between the two is exactly what these tests pin.
 */
function row(overrides: Partial<ProfileRow> = {}): ProfileRow {
  return {
    first_name: 'Ayşe',
    last_name: 'Yılmaz',
    email: 'reader@example.test',
    phone: '+905551234567',
    account_role: AccountRole.Student,
    education_level: EducationLevel.Undergraduate,
    grade_level: null,
    study_stream: null,
    school_name: null,
    university_name: 'Boğaziçi Üniversitesi',
    department_name: 'Coğrafya Öğretmenliği',
    created_at: new Date('2026-01-02T03:04:05.000Z'),
    district_id: DISTRICT_ID,
    district_name: 'Kadıköy',
    province_plate_code: '34',
    province_name: 'İstanbul',
    marketing_consent_at: null,
    ...overrides,
  };
}

type UpdateMock = jest.Mock<(criteria: unknown, patch: unknown) => Promise<{ affected: number }>>;

interface Harness {
  service: ProfileService;
  queryMock: jest.Mock;
  updateMock: UpdateMock;
}

/**
 * Every read this service makes goes through `dataSource.query`; the only repository call left
 * is the explicit column-by-column `update`. Stubbing both is therefore the whole surface.
 */
function harness(queryResults: unknown[]): Harness {
  const queryMock = jest.fn<() => Promise<unknown>>();
  for (const result of queryResults) {
    queryMock.mockResolvedValueOnce(result);
  }
  const updateMock: UpdateMock = jest
    .fn<(criteria: unknown, patch: unknown) => Promise<{ affected: number }>>()
    .mockResolvedValue({ affected: 1 });

  const users = { update: updateMock } as unknown as Repository<User>;
  const dataSource = { query: queryMock } as unknown as DataSource;

  return { service: new ProfileService(users, dataSource), queryMock, updateMock };
}

describe('ProfileService.getProfile', () => {
  it('returns the personal block alongside the education block', async () => {
    const { service } = harness([[row()]]);

    const dto = await service.getProfile(USER_ID);

    expect(dto.firstName).toBe('Ayşe');
    expect(dto.lastName).toBe('Yılmaz');
    expect(dto.email).toBe('reader@example.test');
    expect(dto.phone).toBe('+905551234567');
    expect(dto.districtId).toBe(DISTRICT_ID);
    expect(dto.districtName).toBe('Kadıköy');
    expect(dto.provincePlateCode).toBe('34');
    expect(dto.provinceName).toBe('İstanbul');
    expect(dto.createdAt).toBe('2026-01-02T03:04:05.000Z');
  });

  it('still returns the education block and the derived isComplete', async () => {
    const { service } = harness([[row()]]);

    const dto = await service.getProfile(USER_ID);

    expect(dto.accountRole).toBe(AccountRole.Student);
    expect(dto.educationLevel).toBe(EducationLevel.Undergraduate);
    expect(dto.universityName).toBe('Boğaziçi Üniversitesi');
    expect(dto.departmentName).toBe('Coğrafya Öğretmenliği');
    expect(dto.gradeLevel).toBeNull();
    expect(dto.isComplete).toBe(true);
  });

  it('reads the province and district in the SAME query as the user', async () => {
    const { service, queryMock } = harness([[row()]]);

    await service.getProfile(USER_ID);

    expect(queryMock).toHaveBeenCalledTimes(1);
    const sql = String(queryMock.mock.calls[0]?.[0]);
    expect(sql).toContain('districts');
    expect(sql).toContain('provinces');
  });

  it('never selects the password hash', async () => {
    const { service, queryMock } = harness([[row()]]);

    await service.getProfile(USER_ID);

    expect(String(queryMock.mock.calls[0]?.[0])).not.toContain('password_hash');
  });

  it('throws unauthenticated when the row is gone', async () => {
    const { service } = harness([[]]);

    await expect(service.getProfile(USER_ID)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

describe('ProfileService.replaceAccount', () => {
  const dto = {
    firstName: 'Ayşe',
    lastName: 'Demir',
    phone: '+905551112233',
    provincePlateCode: '34',
    districtId: DISTRICT_ID,
  };

  it('updates the five personal columns and returns the re-read profile', async () => {
    // 1st query: the district-membership check. 2nd: the re-read behind getProfile.
    const { service, updateMock } = harness([
      [{ id: DISTRICT_ID }],
      [row({ last_name: 'Demir', phone: '+905551112233' })],
    ]);

    const result = await service.replaceAccount(USER_ID, dto);

    expect(updateMock).toHaveBeenCalledWith(
      { id: USER_ID },
      {
        firstName: 'Ayşe',
        lastName: 'Demir',
        phone: '+905551112233',
        districtId: DISTRICT_ID,
      },
    );
    expect(result.lastName).toBe('Demir');
    expect(result.phone).toBe('+905551112233');
  });

  it('rejects a district that does not belong to the province', async () => {
    const { service, updateMock } = harness([[]]);

    await expect(
      service.replaceAccount(USER_ID, { ...dto, districtId: OTHER_DISTRICT_ID }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('checks district membership BEFORE it writes', async () => {
    const { service, queryMock, updateMock } = harness([[], []]);

    await expect(service.replaceAccount(USER_ID, dto)).rejects.toBeInstanceOf(BadRequestException);

    expect(queryMock).toHaveBeenCalledTimes(1);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('throws unauthenticated when the update touches no row', async () => {
    const { service, updateMock } = harness([[{ id: DISTRICT_ID }]]);
    updateMock.mockResolvedValue({ affected: 0 });

    await expect(service.replaceAccount(USER_ID, dto)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});

describe('marketing consent (T-101)', () => {
  const dto = {
    firstName: 'Ayşe',
    lastName: 'Demir',
    phone: '+905551112233',
    provincePlateCode: '34',
    districtId: DISTRICT_ID,
  };

  it('reads marketingConsent as false when the column is null', async () => {
    const { service } = harness([[row()]]);
    expect((await service.getProfile(USER_ID)).marketingConsent).toBe(false);
  });

  it('reads marketingConsent as true when a consent instant is stored', async () => {
    const { service } = harness([
      [row({ marketing_consent_at: new Date('2026-09-24T10:00:00.000Z') })],
    ]);
    expect((await service.getProfile(USER_ID)).marketingConsent).toBe(true);
  });

  it('leaves the consent column untouched when the key is absent', () => {
    expect(marketingConsentPatch(undefined)).toEqual({});
  });

  it('withdraws consent with an explicit null', () => {
    expect(marketingConsentPatch(false)).toEqual({ marketingConsentAt: null });
  });

  it('grants consent while keeping an earlier grant instant', () => {
    const patch = marketingConsentPatch(true);
    expect(typeof patch.marketingConsentAt).toBe('function');
    const sql = (patch.marketingConsentAt as () => string)();
    expect(sql).toBe('COALESCE("marketing_consent_at", now())');
  });

  it('passes the consent patch through replaceAccount', async () => {
    const { service, updateMock } = harness([[{ id: DISTRICT_ID }], [row()]]);

    await service.replaceAccount(USER_ID, { ...dto, marketingConsent: false });

    expect(updateMock).toHaveBeenCalledWith(
      { id: USER_ID },
      expect.objectContaining({ marketingConsentAt: null }),
    );
  });
});

describe('ProfileService.replaceProfile (education block, unchanged behaviour)', () => {
  let studentRow: ProfileRow;

  beforeEach(() => {
    studentRow = row();
  });

  it('writes the six education columns and derives isComplete', async () => {
    const { service, updateMock } = harness([
      [{ account_role: AccountRole.Student }],
      [studentRow],
    ]);

    const result = await service.replaceProfile(USER_ID, {
      educationLevel: EducationLevel.Undergraduate,
      gradeLevel: null,
      studyStream: null,
      schoolName: null,
      universityName: 'Boğaziçi Üniversitesi',
      departmentName: 'Coğrafya Öğretmenliği',
    });

    expect(updateMock).toHaveBeenCalledWith(
      { id: USER_ID },
      {
        educationLevel: EducationLevel.Undergraduate,
        gradeLevel: null,
        studyStream: null,
        schoolName: null,
        universityName: 'Boğaziçi Üniversitesi',
        departmentName: 'Coğrafya Öğretmenliği',
      },
    );
    expect(result.isComplete).toBe(true);
  });

  it('validates the shape against the PERSISTED role, never the request', async () => {
    const { service, updateMock } = harness([[{ account_role: AccountRole.Teacher }]]);

    await expect(
      service.replaceProfile(USER_ID, {
        educationLevel: EducationLevel.Secondary,
        gradeLevel: GradeLevel.Grade9,
        studyStream: StudyStream.Sayisal,
        schoolName: null,
        universityName: null,
        departmentName: null,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(updateMock).not.toHaveBeenCalled();
  });
});
