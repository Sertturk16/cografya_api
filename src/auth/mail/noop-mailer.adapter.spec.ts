import { Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { NoopMailerAdapter } from './noop-mailer.adapter';
import type { MailMessage } from './mailer.port';

describe('NoopMailerAdapter', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('logs exactly template and locale, and nothing else', async () => {
    const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const adapter = new NoopMailerAdapter();
    const message: MailMessage = {
      template: 'verify-email',
      to: 'reader@example.test',
      locale: 'tr',
      variables: { code: '123456', expiresInMinutes: 10 },
    };

    await adapter.send(message);

    expect(logSpy).toHaveBeenCalledTimes(1);
    const [line] = logSpy.mock.calls[0] as [string];
    expect(line).toContain('verify-email');
    expect(line).toContain('tr');
  });

  it('never includes the address, the code or the reset token in the log line', async () => {
    const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const adapter = new NoopMailerAdapter();

    const cases: MailMessage[] = [
      {
        template: 'verify-email',
        to: 'secret.reader@example.test',
        locale: 'tr',
        variables: { code: '654321', expiresInMinutes: 10 },
      },
      {
        template: 'password-reset',
        to: 'secret.reader@example.test',
        locale: 'en',
        variables: { resetToken: 'super-secret-reset-token', expiresInMinutes: 30 },
      },
      {
        template: 'account-exists',
        to: 'secret.reader@example.test',
        locale: 'tr',
        variables: {},
      },
    ];

    for (const message of cases) {
      await adapter.send(message);
    }

    expect(logSpy).toHaveBeenCalledTimes(cases.length);
    const loggedLines = logSpy.mock.calls.map(([line]) => String(line));
    const forbidden = ['secret.reader@example.test', '654321', 'super-secret-reset-token'];
    for (const line of loggedLines) {
      for (const secret of forbidden) {
        expect(line).not.toContain(secret);
      }
    }
  });
});
