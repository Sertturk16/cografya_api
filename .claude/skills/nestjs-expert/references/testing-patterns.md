# Testing Patterns

## Unit Test Setup

```typescript
import { describe, expect, it, jest } from '@jest/globals';
import { NotFoundException } from '@nestjs/common';
import type { DataSource, Repository } from 'typeorm';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const ISO = '2026-01-01T00:00:00.000Z';

function harness() {
  const findOne = jest.fn<(options: unknown) => Promise<Note | null>>();
  const query = jest.fn<(sql: string, params: unknown[]) => Promise<unknown>>();
  const repo = { findOne } as unknown as Repository<Note>;
  const dataSource = { query } as unknown as DataSource;
  return { service: new NotesService(repo, dataSource), findOne, query };
}

describe('NotesService', () => {
  // ...
});
```

## Service Tests

```typescript
describe('create', () => {
  it('should upsert the note and return it as a DTO', async () => {
    const { service, query } = harness();
    const dto = { clientNoteId: 'n1', title: 'Ege' };
    const at = new Date(ISO);
    query.mockResolvedValue([{ id: '1', title: 'Ege', created_at: at, updated_at: at }]);

    const result = await service.create(USER_ID, dto);

    expect(String(query.mock.calls[0]?.[0])).toContain('ON CONFLICT');
    expect(query.mock.calls[0]?.[1]).toEqual([USER_ID, 'n1', 'Ege']);
    expect(result).toEqual({ id: '1', title: 'Ege', createdAt: ISO, updatedAt: ISO });
  });
});

describe('findOne', () => {
  it('should return note', async () => {
    const { service, findOne } = harness();
    const at = new Date(ISO);
    findOne.mockResolvedValue({ id: '1', title: 'Ege', createdAt: at, updatedAt: at } as Note);

    const result = await service.findOne(USER_ID, '1');
    expect(result).toEqual({ id: '1', title: 'Ege', createdAt: ISO, updatedAt: ISO });
  });

  it('should throw NotFoundException', async () => {
    const { service, findOne } = harness();
    findOne.mockResolvedValue(null);
    await expect(service.findOne(USER_ID, '1')).rejects.toThrow(NotFoundException);
  });
});
```

## Controller Tests

```typescript
// test/notes.e2e-spec.ts — controllers are exercised through the e2e app (setup as in E2E Tests)
describe('NotesController (e2e)', () => {
  it('should create note', async () => {
    const dto = { clientNoteId: 'n1', title: 'Ege' };
    const res = await request(app.getHttpServer())
      .post('/api/notes')
      .set('Authorization', `Bearer ${authToken}`)
      .send(dto)
      .expect(200);
    expect(res.body).toMatchObject({ title: 'Ege' });
  });

  it('should reject a missing token', () => {
    return request(app.getHttpServer()).post('/api/notes').send({}).expect(401);
  });
});

// src/notes/notes.contract.spec.ts — pins the published openapi fields
import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

type Schemas = Record<string, { properties?: Record<string, unknown> }>;

describe('openapi/openapi.json — notes contract', () => {
  const spec = readFileSync(join(__dirname, '..', '..', 'openapi', 'openapi.json'), 'utf8');
  const document = JSON.parse(spec) as { paths: object; components: { schemas: Schemas } };

  it('publishes exactly the NoteDto fields', () => {
    expect(Object.keys(document.paths)).toContain('/api/notes');
    const properties = document.components.schemas.NoteDto?.properties ?? {};
    expect(Object.keys(properties).sort()).toEqual(['createdAt', 'id', 'title', 'updatedAt']);
  });
});
```

## E2E Tests

```typescript
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AccessTokenService } from '../src/auth/access-token.service';
import { applyGlobalPrefix } from '../src/common/bootstrap';
import { buildDataSourceOptions } from '../src/database/data-source-options';

describe('Notes (e2e, real Postgres)', () => {
  let container: StartedPostgreSqlContainer;
  let dataSource: DataSource;
  let app: INestApplication;
  let authToken: string;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    const url = container.getConnectionUri();
    process.env.DATABASE_URL = url;
    process.env.WEB_ORIGIN = 'http://localhost:3000';
    dataSource = new DataSource(buildDataSourceOptions(url));
    await dataSource.initialize();
    await dataSource.runMigrations();

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { AppModule } = require('../src/app.module') as typeof import('../src/app.module');
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleFixture.createNestApplication();
    applyGlobalPrefix(app);
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();

    // Get auth token
    const user = await createUser(dataSource); // saves an ACTIVE users row
    authToken = await app.get(AccessTokenService).mint(user.id, user.tokenVersion);
  }, 300_000);

  afterAll(async () => {
    await app?.close();
    if (dataSource?.isInitialized) await dataSource.destroy();
    await container?.stop();
  });

  it('/api/notes (POST)', () => {
    return request(app.getHttpServer())
      .post('/api/notes')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ clientNoteId: 'n1', title: 'Ege' })
      .expect(200)
      .expect((res) => {
        expect(res.body.title).toBe('Ege');
      });
  });

  it('/api/notes/:id (GET) - 404', () => {
    return request(app.getHttpServer())
      .get('/api/notes/22222222-2222-4222-8222-222222222222')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(404);
  });
});
```

## Mock Factory

```typescript
import { jest } from '@jest/globals';
import type { Repository } from 'typeorm';

function harness() {
  const getOne = jest.fn<() => Promise<User | null>>().mockResolvedValue(null);
  const queryBuilder = { addSelect: () => queryBuilder, where: () => queryBuilder, getOne };
  const deleteMock = jest.fn<(criteria: unknown) => Promise<{ affected: number }>>();
  const users = {
    createQueryBuilder: () => queryBuilder,
    delete: deleteMock,
  } as unknown as Repository<User>;
  return { service: new UsersService(users), getOne, deleteMock };
}
```

## Quick Reference

| Pattern | Use Case |
|---------|----------|
| `new Service(stubs)` / `Test.createTestingModule()` | Service spec setup / e2e app |
| `jest.fn<Sig>()` (from `@jest/globals`) | Mock function |
| `mockResolvedValue()` | Mock async return |
| `mockReturnValue()` | Mock sync return |
| `supertest` | E2E HTTP testing |
| `beforeAll` / `afterAll` | Setup/teardown |
