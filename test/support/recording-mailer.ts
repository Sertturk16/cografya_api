import type { MailerPort, MailMessage } from '../../src/auth/mail/mailer.port';

/**
 * An in-memory `MailerPort` double for e2e — the ONE place a test may read a verification code
 * or a reset token, because they never appear in a response, a log line or a fixture (§7.3,
 * §10). `overrideProvider(MAILER_PORT)` swaps this in for `NoopMailerAdapter`.
 */
export class RecordingMailer implements MailerPort {
  readonly sent: MailMessage[] = [];

  send(message: MailMessage): Promise<void> {
    this.sent.push(message);
    return Promise.resolve();
  }

  /** All messages sent to one address, in order — the common e2e assertion shape. */
  sentTo(email: string): MailMessage[] {
    return this.sent.filter((message) => message.to === email);
  }

  /** The most recent message of a given template sent to `email`, or `undefined`. */
  lastOfTemplate<Template extends MailMessage['template']>(
    email: string,
    template: Template,
  ): Extract<MailMessage, { template: Template }> | undefined {
    const matches = this.sentTo(email).filter(
      (message): message is Extract<MailMessage, { template: Template }> =>
        message.template === template,
    );
    return matches[matches.length - 1];
  }

  clear(): void {
    this.sent.length = 0;
  }
}
