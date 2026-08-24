import { Module } from '@nestjs/common';
import { PasswordHasherService } from './password-hasher.service';

/**
 * Endpoint-free authentication core. Registration/session controllers and
 * token/mail machinery are deliberately deferred to UYELIK-02.
 */
@Module({
  providers: [PasswordHasherService],
  exports: [PasswordHasherService],
})
export class AuthModule {}
