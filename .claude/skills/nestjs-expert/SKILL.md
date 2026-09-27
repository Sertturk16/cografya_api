---
name: nestjs-expert
description: Creates and configures NestJS modules, controllers, services, DTOs, guards, and interceptors for enterprise-grade TypeScript backend applications. Use when building NestJS REST APIs or GraphQL services, implementing dependency injection, scaffolding modular architecture, adding JWT authentication, integrating TypeORM, or working with .module.ts, .controller.ts, and .service.ts files. Invoke for guards, interceptors, pipes, validation, Swagger documentation, and unit/E2E testing in NestJS projects.
license: MIT
metadata:
  author: https://github.com/Jeffallan
  version: "1.1.0"
  domain: backend
  triggers: NestJS, Nest, Node.js backend, TypeScript backend, dependency injection, controller, service, module, guard, interceptor
  role: specialist
  scope: implementation
  output-format: code
  related-skills: fullstack-guardian, test-master, devops-engineer
---

# NestJS Expert

Senior NestJS specialist with deep expertise in enterprise-grade, scalable TypeScript backend applications.

## Core Workflow

1. **Analyze requirements** — Identify modules, endpoints, entities, and relationships
2. **Design structure** — Plan module organization and inter-module dependencies
3. **Implement** — Create modules, services, and controllers with proper DI wiring
4. **Secure** — Add guards, validation pipes, and authentication
5. **Verify** — Run `pnpm typecheck && pnpm lint` and `pnpm test:unit`; confirm the DI graph with `pnpm test:e2e`, which boots `AppModule`
6. **Test** — Write unit tests for services and E2E tests for controllers

## Reference Guide

Load detailed guidance based on context:

| Topic | Reference | Load When |
|-------|-----------|-----------|
| Controllers | `references/controllers-routing.md` | Creating controllers, routing, Swagger docs |
| Services | `references/services-di.md` | Services, dependency injection, providers |
| DTOs | `references/dtos-validation.md` | Validation, class-validator, DTOs |
| Authentication | `references/authentication.md` | JWT, `AccessTokenGuard`, guards, authorization |
| Testing | `references/testing-patterns.md` | Unit tests, E2E tests, mocking |

## Code Examples

### Controller with DTO Validation and Swagger

```typescript
// create-note-request.dto.ts
import { IsString, Length, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateNoteRequestDto {
  @ApiProperty({ example: '018f2f3a-9c3e-7b2a-8b9d-2e6f1a7c9d40', maxLength: 128 })
  @IsString()
  @Length(1, 128)
  clientNoteId!: string;

  @ApiProperty({ example: 'Ege kıyıları', maxLength: 200 })
  @IsString()
  @MaxLength(200)
  title!: string;
}

// notes.controller.ts
import { Body, Controller, Post, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AccessTokenGuard } from '../auth/access-token.guard';
import { AUTH_ERROR_KEYS } from '../auth/auth-error-keys';
import { AuthenticatedUser } from '../auth/authenticated-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { ApiErrorDto } from '../common/dto/api-error.dto';
import { NoTrustedClientExemption } from '../common/throttler/throttler-metadata';
import { NotesService } from './notes.service';
import { CreateNoteRequestDto } from './dto/create-note-request.dto';
import { NoteDto } from './dto/note.dto';

@ApiTags('notes')
@Controller('notes')
@UseGuards(AccessTokenGuard)
@NoTrustedClientExemption()
@ApiBearerAuth('access-token')
export class NotesController {
  constructor(private readonly notesService: NotesService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Create note (idempotent on clientNoteId)' })
  @ApiOkResponse({
    type: NoteDto,
    description: 'Note saved; a repeated clientNoteId returns the original row.',
  })
  @ApiUnauthorizedResponse({ type: ApiErrorDto, description: AUTH_ERROR_KEYS.unauthenticated })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateNoteRequestDto,
  ): Promise<NoteDto> {
    return this.notesService.create(user.id, dto);
  }
}
```

### Service with Dependency Injection and Error Handling

```typescript
// notes.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Note } from './entities/note.entity';
import type { CreateNoteRequestDto } from './dto/create-note-request.dto';
import type { NoteDto } from './dto/note.dto';
import { NOTES_ERROR_KEYS } from './notes-error-keys';

interface NoteRow {
  id: string;
  title: string;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class NotesService {
  constructor(
    @InjectRepository(Note)
    private readonly notesRepository: Repository<Note>,
    private readonly dataSource: DataSource,
  ) {}

  async create(userId: string, dto: CreateNoteRequestDto): Promise<NoteDto> {
    const [row] = await this.dataSource.query<NoteRow[]>(
      `INSERT INTO "notes" ("user_id", "client_note_id", "title") VALUES ($1, $2, $3)
       ON CONFLICT ("user_id", "client_note_id") DO UPDATE SET "user_id" = EXCLUDED."user_id"
       RETURNING "id", "title", "created_at", "updated_at"`,
      [userId, dto.clientNoteId, dto.title],
    );
    if (row === undefined) {
      throw new Error('notes: upsert returned no row');
    }
    return {
      id: row.id,
      title: row.title,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  async findOne(userId: string, id: string): Promise<NoteDto> {
    const note = await this.notesRepository.findOne({ where: { id, userId } });
    if (!note) {
      throw new NotFoundException(NOTES_ERROR_KEYS.notFound);
    }
    return {
      id: note.id,
      title: note.title,
      createdAt: note.createdAt.toISOString(),
      updatedAt: note.updatedAt.toISOString(),
    };
  }
}
```

### Module Definition

```typescript
// notes.module.ts
import { MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { NotesController } from './notes.controller';
import { NotesNoStoreMiddleware } from './notes-no-store.middleware';
import { NotesService } from './notes.service';
import { Note } from './entities/note.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Note]), AuthModule],
  controllers: [NotesController],
  providers: [NotesService],
  exports: [NotesService], // export only when other modules need this service
})
export class NotesModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(NotesNoStoreMiddleware).forRoutes(NotesController);
  }
}
```

### Unit Test for Service

```typescript
// notes.service.spec.ts
import { describe, expect, it, jest } from '@jest/globals';
import { NotFoundException } from '@nestjs/common';
import type { DataSource, Repository } from 'typeorm';
import { NotesService } from './notes.service';
import type { Note } from './entities/note.entity';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const NOTE_ID = '22222222-2222-4222-8222-222222222222';

function harness() {
  const findOne = jest.fn<(options: unknown) => Promise<Note | null>>();
  const notesRepository = { findOne } as unknown as Repository<Note>;
  const dataSource = {} as unknown as DataSource;
  return { service: new NotesService(notesRepository, dataSource), findOne };
}

describe('NotesService', () => {
  it("throws NotFoundException when the note is not the caller's", async () => {
    const { service, findOne } = harness();
    findOne.mockResolvedValue(null);
    await expect(service.findOne(USER_ID, NOTE_ID)).rejects.toThrow(NotFoundException);
  });
});
```

## Constraints

### MUST DO
- Use `@Injectable()` and constructor injection for all services — never instantiate services with `new` outside a module `useFactory` provider or a unit-spec harness
- Validate all inputs with `class-validator` decorators on DTOs and enable `ValidationPipe` globally
- Use DTOs for all request/response bodies; never pass raw `req.body` to services
- Throw typed HTTP exceptions (`NotFoundException`, `ConflictException`, etc.) in services, with an i18n key from the module's `*-error-keys.ts` as the message, never prose
- Document all endpoints with `@ApiTags`, `@ApiOperation`, and response decorators
- Write unit tests for every service method by constructing the service with `new` and minimal typed stubs
- Read env values only through `ConfigService<Env, true>`, never `process.env`; policy values are exported named constants

### MUST NOT DO
- Expose passwords, secrets, or internal stack traces in responses
- Accept unvalidated user input — always apply `ValidationPipe`
- Use `any` type, specs included
- Create circular dependencies between modules — use `forwardRef()` only as a last resort
- Hardcode hostnames, ports, or credentials in source files
- Skip error handling in service methods

## Output Templates

When implementing a NestJS feature, provide in this order:
1. DTOs with `class-validator` and `@nestjs/swagger` decorators (`dto/*.dto.ts`)
2. Service with typed error handling and its error keys (`.service.ts`, `*-error-keys.ts`)
3. Controller with Swagger decorators (`.controller.ts`)
4. Module definition (`.module.ts`)
5. Unit tests for service methods (`*.service.spec.ts`)

## Knowledge Reference

NestJS, TypeScript, TypeORM, JWT, class-validator, class-transformer, Swagger/OpenAPI, Jest, Supertest, Guards, Interceptors, Pipes, Filters

[Documentation](https://jeffallan.github.io/claude-skills/skills/backend/nestjs-expert/)

- NestJS Official Documentation: https://docs.nestjs.com
- class-validator Decorators: https://github.com/typestack/class-validator
- TypeORM with NestJS: https://docs.nestjs.com/techniques/database
- Testing Guide: https://docs.nestjs.com/fundamentals/testing
