import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';

/** Exactly the columns `AccessTokenGuard`'s step 3 has always read — never widened here. */
export type AuthProfile = Pick<User, 'id' | 'status' | 'tokenVersion'>;

/**
 * `AccessTokenGuard`'s ONE read on `users`, factored out so a module outside `AuthModule` (first
 * consumer: `VideoProgressModule`, UYELIK-05) depends on a narrow-purpose service rather than the
 * raw `Repository<User>` (PR #141 round-1 review IMPORTANT finding, "widened DI surface").
 *
 * `findAuthProfile` is exactly the restricted read the guard already performed inline — moved here
 * verbatim (`select: { id, status, tokenVersion }`, one indexed PK lookup), never widened. What
 * crosses the module boundary is this one method, not the repository it is built on:
 * `UserRepositoryModule` (`auth.module.ts`) stays unexported, so no importer of `AuthModule` can
 * reach `Repository<User>` — or any other column on `users` — through this path.
 */
@Injectable()
export class AuthUserLookupService {
  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
  ) {}

  async findAuthProfile(id: string): Promise<AuthProfile | null> {
    return this.users.findOne({
      where: { id },
      select: { id: true, status: true, tokenVersion: true },
    });
  }
}
