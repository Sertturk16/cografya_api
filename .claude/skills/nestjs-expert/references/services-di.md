# Services & Dependency Injection

## Service Pattern

```typescript
import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryFailedError, Repository } from 'typeorm';

type NoteRow = { id: string; title: string; created_at: Date; updated_at: Date };

@Injectable()
export class NotesService {
  private readonly logger = new Logger('Notes');

  constructor(
    @InjectRepository(Note)
    private readonly repo: Repository<Note>,
    private readonly dataSource: DataSource,
  ) {}

  async create(userId: string, dto: CreateNoteRequestDto): Promise<NoteDto> {
    let rows: NoteRow[];
    try {
      rows = await this.dataSource.query<NoteRow[]>(
        `INSERT INTO "notes" ("user_id", "client_note_id", "title") VALUES ($1, $2, $3)
         ON CONFLICT ("user_id", "client_note_id") DO UPDATE SET "user_id" = EXCLUDED."user_id"
         RETURNING "id", "title", "created_at", "updated_at"`,
        [userId, dto.clientNoteId, dto.title],
      );
    } catch (error) {
      const sqlState = (error as QueryFailedError & { code?: string }).code;
      if (error instanceof QueryFailedError && sqlState === '23505') {
        throw new ConflictException(NOTES_ERROR_KEYS.duplicateTitle);
      }
      this.logger.error('notes.create outcome=unexpected-failure'); // literal only, no PII
      throw error;
    }
    const [row] = rows;
    if (row === undefined) {
      throw new Error('notes: upsert returned no row');
    }
    return toDto({
      id: row.id,
      title: row.title,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }

  async findOne(userId: string, id: string): Promise<NoteDto> {
    const note = await this.repo.findOne({ where: { id, userId } });
    if (!note) {
      throw new NotFoundException(NOTES_ERROR_KEYS.notFound);
    }
    return toDto(note);
  }

  async update(userId: string, id: string, dto: UpdateNoteRequestDto): Promise<NoteDto> {
    const before = await this.repo.findOne({ where: { id, userId } });
    if (!before) {
      throw new NotFoundException(NOTES_ERROR_KEYS.notFound);
    }
    const updatedAt = new Date();
    const result = await this.repo.update({ id, userId }, { title: dto.title, updatedAt });
    if ((result.affected ?? 0) === 0) {
      throw new NotFoundException(NOTES_ERROR_KEYS.notFound);
    }
    return toDto({ ...before, title: dto.title, updatedAt });
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.repo.delete({ id, userId });
  }
}

function toDto(note: Pick<Note, 'id' | 'title' | 'createdAt' | 'updatedAt'>): NoteDto {
  return {
    id: note.id,
    title: note.title,
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
  };
}
```

## Module with Providers

```typescript
@Module({
  imports: [TypeOrmModule.forFeature([User])],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],  // Make available to other modules
})
export class UsersModule {}
```

## Custom Providers

```typescript
// Value provider
{ provide: ELEVATION_PROVIDER_BUDGET_TOKEN, useValue: ELEVATION_PROVIDER_BUDGET }

// Factory provider
{
  provide: ELEVATION_UPSTREAM_CONFIG, // Symbol('ELEVATION_UPSTREAM_CONFIG')
  useFactory: (config: ConfigService<Env, true>): ElevationUpstreamConfig => ({
    baseUrl: config.getOrThrow('ELEVATION_BASE_URL', { infer: true }),
  }),
  inject: [ConfigService],
}

// Class provider
{ provide: LoggerService, useClass: CustomLoggerService }

// Async factory
{
  provide: DATABASE_CONNECTION, // Symbol('DATABASE_CONNECTION')
  useFactory: async (config: ConfigService<Env, true>): Promise<DataSource> => {
    const url = config.getOrThrow('DATABASE_URL', { infer: true });
    const dataSource = new DataSource(buildDataSourceOptions(url));
    return dataSource.initialize();
  },
  inject: [ConfigService],
}
```

## Injection Patterns

```typescript
// Constructor injection (preferred)
constructor(private readonly usersService: UsersService) {}

// Token injection
constructor(@Inject(MAILER_PORT) private readonly mailer: MailerPort) {}

// Optional injection
constructor(@Optional() private readonly cache?: CacheService) {}

// Property injection (use sparingly)
@Inject() private readonly logger!: Logger;
```

## Scope

```typescript
// Default: Singleton (shared across app)
@Injectable()
export class SharedService {}

// Request-scoped: New instance per request
@Injectable({ scope: Scope.REQUEST })
export class RequestService {
  constructor(@Inject(REQUEST) private request: Request) {}
}

// Transient: New instance every injection
@Injectable({ scope: Scope.TRANSIENT })
export class HelperService {}
```

## Quick Reference

| Pattern | Use When |
|---------|----------|
| Constructor DI | Most cases (recommended) |
| `@Inject(token)` | Non-class (`Symbol`) tokens |
| `@Optional()` | Optional dependency |
| Factory provider | Dynamic configuration |
| Scope.REQUEST | Per-request state |
