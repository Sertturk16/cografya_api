# Controllers & Routing

## Controller with Swagger

```typescript
import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, HttpCode, HttpStatus, UseGuards
} from '@nestjs/common';
import {
  ApiTags, ApiOperation, ApiOkResponse, ApiBadRequestResponse, ApiNotFoundResponse,
  ApiUnauthorizedResponse, ApiBearerAuth, ApiParam,
} from '@nestjs/swagger';
import { AccessTokenGuard } from '../auth/access-token.guard';
import { AUTH_ERROR_KEYS } from '../auth/auth-error-keys';
import { AuthenticatedUser } from '../auth/authenticated-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { ApiErrorDto } from '../common/dto/api-error.dto';
import { NoTrustedClientExemption } from '../common/throttler/throttler-metadata';

@Controller('notes')
@ApiTags('notes')
@UseGuards(AccessTokenGuard)
@NoTrustedClientExemption()
@ApiBearerAuth('access-token')
export class NotesController {
  constructor(private readonly notesService: NotesService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Create note (idempotent on clientNoteId)' })
  @ApiOkResponse({ type: NoteDto })
  @ApiBadRequestResponse({ type: ApiErrorDto, description: 'Validation failed' })
  @ApiUnauthorizedResponse({ type: ApiErrorDto, description: AUTH_ERROR_KEYS.unauthenticated })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateNoteRequestDto,
  ): Promise<NoteDto> {
    return this.notesService.create(user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: "Get the caller's notes" })
  @ApiOkResponse({ type: NoteListDto })
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: NoteListQueryDto,
  ): Promise<NoteListDto> {
    return this.notesService.findAll(user.id, query);
  }

  @Get(':id')
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiOkResponse({ type: NoteDto })
  @ApiNotFoundResponse({ type: ApiErrorDto, description: NOTES_ERROR_KEYS.notFound })
  findOne(@CurrentUser() user: AuthenticatedUser, @Param() params: NoteParams): Promise<NoteDto> {
    return this.notesService.findOne(user.id, params.id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: NoteParams,
    @Body() dto: UpdateNoteRequestDto,
  ): Promise<NoteDto> {
    return this.notesService.update(user.id, params.id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: AuthenticatedUser, @Param() params: NoteParams): Promise<void> {
    return this.notesService.remove(user.id, params.id);
  }
}
```

## Nested Routes

```typescript
// dto/post-params.dto.ts
export class PostParams {
  @IsUUID('4')
  postId!: string;
}

@Controller('posts/:postId/comments')
@ApiTags('comments')
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Get()
  findAll(@Param() params: PostParams) {
    return this.commentsService.findByPost(params.postId);
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  @UseGuards(AccessTokenGuard)
  @NoTrustedClientExemption()
  @ApiBearerAuth('access-token')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: PostParams,
    @Body() dto: CreateCommentRequestDto,
  ) {
    return this.commentsService.create(user.id, params.postId, dto);
  }
}
```

## Global Prefix, CORS & Versioning

```typescript
// main.ts
const app = await NestFactory.create(AppModule);
const configService = app.get<ConfigService<Env, true>>(ConfigService);
// CORS: one origin (WEB_ORIGIN), credentials: false
app.enableCors(buildCorsOptions(configService.get('WEB_ORIGIN', { infer: true })));
applyGlobalPrefix(app); // setGlobalPrefix('api'), GET /health excluded
app.enableVersioning({ type: VersioningType.URI });

// controller.ts
@Controller({ path: 'users', version: '1' })  // /api/v1/users
export class UsersV1Controller {}

@Controller({ path: 'users', version: '2' })  // /api/v2/users
export class UsersV2Controller {}
```

## Quick Reference

| Decorator | Purpose |
|-----------|---------|
| `@Controller('path')` | Define route prefix |
| `@Get()`, `@Post()` | HTTP method |
| `@Param() params: XParams` | Path parameters (validated DTO) |
| `@Query() query: XQueryDto` | Query parameters (validated DTO) |
| `@Body()` | Request body |
| `@HttpCode(200)` | Override status code |
| `@ApiTags()` | Swagger grouping |
| `@ApiOperation()` | Endpoint description |
| `@ApiOkResponse()`, `@ApiNotFoundResponse()` | Document response |
