import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { SendEmailCommand, SESv2Client } from '@aws-sdk/client-sesv2';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import type { Env } from '../../config/env.schema';
import { validateEnv } from '../../config/env.schema';
import type { MailLocale, MailMessage } from './mailer.port';
import { SesMailerAdapter } from './ses-mailer.adapter';

const SECRET_ADDRESS = 'secret.reader@example.test';
const SECRET_CODE = '654321';
const SECRET_TOKEN = 'super-secret-reset-token';

/** The `AuthSecretsProvider`/`marine-upstream.config.spec.ts` precedent: a ConfigService
 * stand-in built from the REAL `validateEnv`, not a hand-written literal. */
function configFrom(raw: Record<string, string>): ConfigService<Env, true> {
  const env = validateEnv({
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
    MAIL_TRANSPORT: 'ses',
    AWS_REGION: 'eu-central-1',
    AWS_ACCESS_KEY_ID: 'AKIAEXAMPLE',
    AWS_SECRET_ACCESS_KEY: 'example-secret-key',
    MAIL_FROM_ADDRESS: 'no-reply@cografyagurmesi.example',
    WEB_ORIGIN: 'https://cografyagurmesi.example',
    ...raw,
  });
  return { get: (key: keyof Env) => env[key] } as unknown as ConfigService<Env, true>;
}

function messageFor(template: MailMessage['template'], locale: MailLocale): MailMessage {
  switch (template) {
    case 'verify-email':
      return {
        template: 'verify-email',
        to: SECRET_ADDRESS,
        locale,
        variables: { code: SECRET_CODE, expiresInMinutes: 10 },
      };
    case 'password-reset':
      return {
        template: 'password-reset',
        to: SECRET_ADDRESS,
        locale,
        variables: { resetToken: SECRET_TOKEN, expiresInMinutes: 30 },
      };
    case 'account-exists':
      return { template: 'account-exists', to: SECRET_ADDRESS, locale, variables: {} };
  }
}

const TEMPLATES: MailMessage['template'][] = ['verify-email', 'password-reset', 'account-exists'];
const LOCALES: MailLocale[] = ['tr', 'en'];

describe('SesMailerAdapter', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  for (const template of TEMPLATES) {
    for (const locale of LOCALES) {
      it(`sends a well-formed SendEmailCommand for ${template}/${locale}`, async () => {
        const sendSpy = jest
          .spyOn(SESv2Client.prototype, 'send')
          .mockResolvedValue({ MessageId: 'ses-message-id-1' } as never);

        const adapter = new SesMailerAdapter(configFrom({}));
        const message = messageFor(template, locale);

        await adapter.send(message);

        expect(sendSpy).toHaveBeenCalledTimes(1);
        const command = sendSpy.mock.calls[0]?.[0] as SendEmailCommand;
        expect(command).toBeInstanceOf(SendEmailCommand);
        const input = command.input;

        expect(input.Destination?.ToAddresses).toEqual([SECRET_ADDRESS]);
        expect(input.Content?.Simple?.Subject?.Data).toEqual(expect.any(String));
        expect(input.Content?.Simple?.Subject?.Data?.length).toBeGreaterThan(0);
        expect(input.Content?.Simple?.Body?.Text?.Data?.length).toBeGreaterThan(0);
        expect(input.Content?.Simple?.Body?.Html?.Data?.length).toBeGreaterThan(0);

        if (template === 'password-reset') {
          expect(input.Content?.Simple?.Body?.Text?.Data).toContain(SECRET_TOKEN);
          expect(input.Content?.Simple?.Body?.Html?.Data).toContain(SECRET_TOKEN);
          // The link is a real, absolute URL off WEB_ORIGIN carrying the token as `?token=`.
          expect(input.Content?.Simple?.Body?.Text?.Data).toMatch(
            /https:\/\/cografyagurmesi\.example\/.*[?&]token=super-secret-reset-token/,
          );
        }
      });
    }
  }

  it('propagates a client rejection instead of swallowing it', async () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const rejection = new Error('MessageRejected: email address is not verified');
    rejection.name = 'MessageRejected';
    jest.spyOn(SESv2Client.prototype, 'send').mockRejectedValue(rejection as never);

    const adapter = new SesMailerAdapter(configFrom({}));

    await expect(adapter.send(messageFor('verify-email', 'tr'))).rejects.toBe(rejection);
  });

  it('logs outcome=failed with the SES error name on rejection', async () => {
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const rejection = new Error('boom');
    rejection.name = 'MessageRejected';
    jest.spyOn(SESv2Client.prototype, 'send').mockRejectedValue(rejection as never);

    const adapter = new SesMailerAdapter(configFrom({}));

    await expect(adapter.send(messageFor('verify-email', 'tr'))).rejects.toThrow('boom');
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const [line] = errorSpy.mock.calls[0] as [string];
    expect(line).toContain('outcome=failed');
    expect(line).toContain('MessageRejected');
  });

  it('logs success with template, locale and the SES MessageId — nothing else', async () => {
    const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest
      .spyOn(SESv2Client.prototype, 'send')
      .mockResolvedValue({ MessageId: 'ses-message-id-42' } as never);

    const adapter = new SesMailerAdapter(configFrom({}));
    await adapter.send(messageFor('password-reset', 'en'));

    expect(logSpy).toHaveBeenCalledTimes(1);
    const [line] = logSpy.mock.calls[0] as [string];
    expect(line).toContain('password-reset');
    expect(line).toContain('en');
    expect(line).toContain('ses-message-id-42');
  });

  it('never logs the address, the code or the reset token, on success or failure', async () => {
    const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const sendMock = jest.spyOn(SESv2Client.prototype, 'send');

    sendMock.mockResolvedValueOnce({ MessageId: 'id-1' } as never);
    sendMock.mockResolvedValueOnce({ MessageId: 'id-2' } as never);
    const adapterOk = new SesMailerAdapter(configFrom({}));
    await adapterOk.send(messageFor('verify-email', 'tr'));
    await adapterOk.send(messageFor('password-reset', 'en'));

    const rejection = new Error('rejected');
    sendMock.mockRejectedValueOnce(rejection as never);
    await expect(adapterOk.send(messageFor('account-exists', 'tr'))).rejects.toBe(rejection);

    const loggedLines = [...logSpy.mock.calls, ...errorSpy.mock.calls].map(([line]) =>
      String(line),
    );
    const forbidden = [SECRET_ADDRESS, SECRET_CODE, SECRET_TOKEN];
    for (const line of loggedLines) {
      for (const secret of forbidden) {
        expect(line).not.toContain(secret);
      }
    }
  });

  it('throws at construction if a required SES var is missing despite MAIL_TRANSPORT=ses', () => {
    // Cannot happen through validateEnv (the superRefine cross-check refuses it), so this
    // simulates the "invariant broken elsewhere" case directly against the constructor.
    const config = {
      get: (key: keyof Env) => {
        const values: Partial<Env> = {
          AWS_REGION: undefined,
          AWS_ACCESS_KEY_ID: 'AKIAEXAMPLE',
          AWS_SECRET_ACCESS_KEY: 'secret',
          MAIL_FROM_ADDRESS: 'no-reply@example.test',
          MAIL_FROM_NAME: 'Coğrafya Gurmesi',
          WEB_ORIGIN: 'https://example.test',
        };
        return values[key];
      },
    } as unknown as ConfigService<Env, true>;

    expect(() => new SesMailerAdapter(config)).toThrow(/AWS_REGION/);
  });
});
