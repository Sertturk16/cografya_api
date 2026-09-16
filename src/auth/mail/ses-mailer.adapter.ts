import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SendEmailCommand, SESv2Client } from '@aws-sdk/client-sesv2';
import type { Env } from '../../config/env.schema';
import { MAIL_COPY, type RenderedMail } from './mail-copy';
import type { MailerPort, MailMessage } from './mailer.port';

/**
 * The real transport, selected by `MAIL_TRANSPORT=ses` (`auth.module.ts`'s factory switch).
 * Sends through AWS SESv2's `SendEmailCommand` with `Content.Simple` (Subject + text/html
 * body) — no templates, no bulk API, no bounce/complaint handling; those are out of this
 * package's scope (`mailer.port.ts`'s three-template union is fixed, not something this
 * adapter extends).
 *
 * **Redaction discipline mirrors `NoopMailerAdapter` exactly**: every log line carries only
 * `template`, `locale` and the outcome (SES's own `MessageId` on success, the SES error's
 * `name`/`message` on failure) — never `to`, never a rendered subject/body, never a
 * `variables` value.
 *
 * **Fail-soft is the CALLER's job** (`registration.service.ts`, `email-verification.service.ts`,
 * `password-reset.service.ts` each already race `send()` against `MAIL_SEND_TIMEOUT_MS` and
 * catch the rejection). This class does neither: a `client.send` rejection is logged and
 * RETHROWN, unmodified, so the caller's existing timeout/catch keeps working unchanged.
 */
@Injectable()
export class SesMailerAdapter implements MailerPort {
  private readonly logger = new Logger('AUTH');
  private readonly client: SESv2Client;
  private readonly fromAddress: string;
  private readonly fromName: string;
  private readonly webOrigin: string;

  constructor(config: ConfigService<Env, true>) {
    const region = config.get('AWS_REGION', { infer: true });
    const accessKeyId = config.get('AWS_ACCESS_KEY_ID', { infer: true });
    const secretAccessKey = config.get('AWS_SECRET_ACCESS_KEY', { infer: true });
    const fromAddress = config.get('MAIL_FROM_ADDRESS', { infer: true });

    // `env.schema.ts`'s superRefine already refuses to boot with MAIL_TRANSPORT=ses and any of
    // these four unset (the `ADS_API_KEY` cross-check shape), and `auth.module.ts`'s factory
    // only constructs this class when MAIL_TRANSPORT=ses. Reaching here with one missing means
    // that cross-check was bypassed — a broken invariant, not a normal runtime condition — so
    // this throws rather than silently degrading.
    if (
      region === undefined ||
      accessKeyId === undefined ||
      secretAccessKey === undefined ||
      fromAddress === undefined
    ) {
      throw new Error(
        'SesMailerAdapter constructed without AWS_REGION/AWS_ACCESS_KEY_ID/' +
          'AWS_SECRET_ACCESS_KEY/MAIL_FROM_ADDRESS — env.schema.ts should have refused to boot ' +
          'first (MAIL_TRANSPORT=ses cross-check).',
      );
    }

    this.client = new SESv2Client({ region, credentials: { accessKeyId, secretAccessKey } });
    this.fromAddress = fromAddress;
    this.fromName = config.get('MAIL_FROM_NAME', { infer: true });
    this.webOrigin = config.get('WEB_ORIGIN', { infer: true });
  }

  async send(message: MailMessage): Promise<void> {
    const rendered = this.render(message);
    const command = new SendEmailCommand({
      FromEmailAddress: `"${this.fromName}" <${this.fromAddress}>`,
      Destination: { ToAddresses: [message.to] },
      Content: {
        Simple: {
          Subject: { Data: rendered.subject, Charset: 'UTF-8' },
          Body: {
            Text: { Data: rendered.text, Charset: 'UTF-8' },
            Html: { Data: rendered.html, Charset: 'UTF-8' },
          },
        },
      },
    });

    try {
      const response = await this.client.send(command);
      // A single, allow-listed `outcome` interpolation — see `auth-log-redaction.spec.ts`'s
      // structural gate (§10): a log line under `src/auth/**` may only interpolate `template`,
      // `locale`, `scope` or `outcome`, each a bare identifier or a member access ending in one
      // of those names, so the SES MessageId is folded into `outcome` rather than its own
      // interpolation.
      const outcome = `sent messageId=${response.MessageId ?? 'unknown'}`;
      this.logger.log(
        `mail.ses template=${message.template} locale=${message.locale} outcome=${outcome}`,
      );
    } catch (error) {
      const errorDetail =
        error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      const outcome = `failed error=${errorDetail}`;
      this.logger.error(
        `mail.ses template=${message.template} locale=${message.locale} outcome=${outcome}`,
      );
      throw error;
    }
  }

  private render(message: MailMessage): RenderedMail {
    const context = { webOrigin: this.webOrigin };
    switch (message.template) {
      case 'verify-email':
        return MAIL_COPY['verify-email'][message.locale](message.variables, context);
      case 'password-reset':
        return MAIL_COPY['password-reset'][message.locale](message.variables, context);
      case 'account-exists':
        return MAIL_COPY['account-exists'][message.locale](message.variables, context);
    }
  }
}
