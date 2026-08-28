import { Injectable, Logger } from '@nestjs/common';
import type { MailerPort, MailMessage } from './mailer.port';

/**
 * The only adapter this package wires this turn (`MAIL_TRANSPORT=noop`, the schema's sole
 * valid value — §11). Sends nothing anywhere. Warns loudly, once, at construction
 * (`SFH135-I3`) so a degraded-mail deployment is never silent.
 *
 * Logs EXACTLY `template` and `locale` — never `to`, never a variable. §10's redaction
 * boundary binds this class exactly as it binds every other `src/auth/**` file; the fact
 * that this adapter's whole job is "receive a message and do something with it" makes it the
 * easiest place in the package to accidentally log the address, which is why it gets its own
 * unit test (U-M1) rather than relying on the package-wide structural scan alone.
 */
@Injectable()
export class NoopMailerAdapter implements MailerPort {
  private readonly logger = new Logger('AUTH');

  constructor() {
    this.logger.warn('AUTH — mail transport is noop; outbound mail is DROPPED');
  }

  send(message: MailMessage): Promise<void> {
    this.logger.log(`mail.noop template=${message.template} locale=${message.locale}`);
    return Promise.resolve();
  }
}
