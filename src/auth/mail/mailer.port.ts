/** DI token for the mailer port — never resolve a mail adapter by concrete class. */
export const MAILER_PORT = Symbol('MAILER_PORT');

export type MailLocale = 'tr' | 'en';

/**
 * The three outbound mail shapes this package needs (§8). A discriminated union so an
 * adapter handling `'verify-email'` cannot accidentally read `resetToken` — a missing or
 * extra variable on any variant is a COMPILE error, not a runtime surprise.
 *
 * **This port carries NO prose.** `template` is a NAME the adapter maps to copy it owns; the
 * variables are the ONLY data. Deniz never writes reader-facing sentences here — the actual
 * subject/body text is Vera's (`DEC 2026-08-20i` md.4), and this port is deliberately the
 * seam that keeps the two from mixing.
 */
export type MailMessage =
  | {
      template: 'verify-email';
      to: string;
      locale: MailLocale;
      variables: { code: string; expiresInMinutes: number };
    }
  | {
      template: 'password-reset';
      to: string;
      locale: MailLocale;
      variables: { resetToken: string; expiresInMinutes: number };
    }
  | {
      template: 'account-exists';
      to: string;
      locale: MailLocale;
      variables: Record<string, never>;
    };

/**
 * The one seam every outbound mail crosses. `to` is always the CANONICAL (trimmed,
 * lower-cased) address — callers never pass the raw form.
 *
 * Implementations MUST be fail-soft (§8): a send failure is caught by the caller and never
 * turns into a 5xx or an undone write, because the record the email refers to (a pending
 * registration, a reset token) is already committed by the time `send` is called.
 */
export interface MailerPort {
  send(message: MailMessage): Promise<void>;
}
