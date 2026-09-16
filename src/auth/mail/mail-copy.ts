import type { MailLocale } from './mailer.port';

// This file is the ONE place in `cografya_api` allowed to carry reader-facing prose. The
// repo-wide "user-facing text does not exist in this repo" rule (`../../../CLAUDE.md`) targets
// API response bodies, which the web renders from i18n keys — it does not apply here, because
// outbound mail has no other home: the API is the sole sender, `MailerPort`'s own docblock
// deliberately keeps this prose out of `mailer.port.ts`, and `NoopMailerAdapter` never needed
// any. Keep this file pure data/paths/strings, with zero AWS or NestJS imports, so the copy
// stays trivially reviewable and swappable on its own.

/** One rendered outbound message, ready to hand to a transport. */
export interface RenderedMail {
  readonly subject: string;
  readonly text: string;
  readonly html: string;
}

// Localized path segments this file turns into absolute links off `WEB_ORIGIN`. Mirrors
// `cografya_web/i18n/routing.ts`'s `pathnames` for these three routes exactly (TR unprefixed as
// the default locale, EN under `/en` — `localePrefix: "as-needed"`); read directly from that
// file rather than duplicated from memory, so update both sides together if the web ever
// renames one of these routes.
const PASSWORD_RESET_CONFIRM_PATH: Record<MailLocale, string> = {
  tr: '/sifre-sifirlama/yeni',
  en: '/en/reset-password/new',
};
const PASSWORD_RESET_REQUEST_PATH: Record<MailLocale, string> = {
  tr: '/sifre-sifirlama',
  en: '/en/reset-password',
};
const LOGIN_PATH: Record<MailLocale, string> = {
  tr: '/giris',
  en: '/en/login',
};

/** The reset-confirm page reads the token from `?token=` (`password-reset-confirm-form.tsx`). */
const PASSWORD_RESET_TOKEN_PARAM = 'token';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function linkHtml(url: string): string {
  const safeUrl = escapeHtml(url);
  return `<a href="${safeUrl}">${safeUrl}</a>`;
}

export function buildPasswordResetUrl(
  webOrigin: string,
  locale: MailLocale,
  resetToken: string,
): string {
  const url = new URL(PASSWORD_RESET_CONFIRM_PATH[locale], webOrigin);
  url.searchParams.set(PASSWORD_RESET_TOKEN_PARAM, resetToken);
  return url.toString();
}

export function buildPasswordResetRequestUrl(webOrigin: string, locale: MailLocale): string {
  return new URL(PASSWORD_RESET_REQUEST_PATH[locale], webOrigin).toString();
}

export function buildLoginUrl(webOrigin: string, locale: MailLocale): string {
  return new URL(LOGIN_PATH[locale], webOrigin).toString();
}

type CopyBuilder<Variables> = (
  variables: Variables,
  context: { webOrigin: string },
) => RenderedMail;

/**
 * The typed lookup every template+locale combination renders through — six blocks total. Kept
 * as one object (rather than six standalone exported functions) so `SesMailerAdapter` has a
 * single call shape (`MAIL_COPY[message.template][message.locale](...)`) that a fourth locale
 * or template would extend without touching the adapter's own switch logic.
 */
export const MAIL_COPY: {
  'verify-email': Record<MailLocale, CopyBuilder<{ code: string; expiresInMinutes: number }>>;
  'password-reset': Record<
    MailLocale,
    CopyBuilder<{ resetToken: string; expiresInMinutes: number }>
  >;
  'account-exists': Record<MailLocale, CopyBuilder<Record<string, never>>>;
} = {
  'verify-email': {
    tr: ({ code, expiresInMinutes }) => ({
      subject: 'Coğrafya Gurmesi doğrulama kodunuz',
      text:
        `Hesabınızı doğrulamak için kullanacağınız kod: ${code}\n\n` +
        `Bu kod ${expiresInMinutes} dakika içinde geçerliliğini yitirecek.\n\n` +
        'Bu isteği siz yapmadıysanız bu e-postayı görmezden gelebilirsiniz.',
      html:
        `<p>Hesabınızı doğrulamak için kullanacağınız kod: <strong>${escapeHtml(code)}</strong></p>` +
        `<p>Bu kod ${expiresInMinutes} dakika içinde geçerliliğini yitirecek.</p>` +
        '<p>Bu isteği siz yapmadıysanız bu e-postayı görmezden gelebilirsiniz.</p>',
    }),
    en: ({ code, expiresInMinutes }) => ({
      subject: 'Your Coğrafya Gurmesi verification code',
      text:
        `Here's the code to verify your account: ${code}\n\n` +
        `It expires in ${expiresInMinutes} minutes.\n\n` +
        "If you didn't request this, you can safely ignore this email.",
      html:
        `<p>Here's the code to verify your account: <strong>${escapeHtml(code)}</strong></p>` +
        `<p>It expires in ${expiresInMinutes} minutes.</p>` +
        "<p>If you didn't request this, you can safely ignore this email.</p>",
    }),
  },
  'password-reset': {
    tr: ({ resetToken, expiresInMinutes }, { webOrigin }) => {
      const url = buildPasswordResetUrl(webOrigin, 'tr', resetToken);
      return {
        subject: 'Şifre sıfırlama isteğiniz',
        text:
          'Hesabınız için bir şifre sıfırlama isteği aldık. Yeni bir şifre belirlemek için ' +
          `aşağıdaki bağlantıyı açın:\n\n${url}\n\n` +
          `Bu bağlantı ${expiresInMinutes} dakika içinde geçerliliğini yitirecek.\n\n` +
          'Bu isteği siz yapmadıysanız bu e-postayı yok sayabilirsiniz; hesabınızda herhangi ' +
          'bir değişiklik yapılmayacaktır.',
        html:
          '<p>Hesabınız için bir şifre sıfırlama isteği aldık. Yeni bir şifre belirlemek için ' +
          `aşağıdaki bağlantıyı açın:</p><p>${linkHtml(url)}</p>` +
          `<p>Bu bağlantı ${expiresInMinutes} dakika içinde geçerliliğini yitirecek.</p>` +
          '<p>Bu isteği siz yapmadıysanız bu e-postayı yok sayabilirsiniz; hesabınızda herhangi ' +
          'bir değişiklik yapılmayacaktır.</p>',
      };
    },
    en: ({ resetToken, expiresInMinutes }, { webOrigin }) => {
      const url = buildPasswordResetUrl(webOrigin, 'en', resetToken);
      return {
        subject: 'Reset your password',
        text:
          'We received a request to reset your password. Open the link below to choose a new ' +
          `one:\n\n${url}\n\n` +
          `This link expires in ${expiresInMinutes} minutes.\n\n` +
          "If you didn't request this, you can ignore this email — your account will not be " +
          'changed.',
        html:
          '<p>We received a request to reset your password. Open the link below to choose a ' +
          `new one:</p><p>${linkHtml(url)}</p>` +
          `<p>This link expires in ${expiresInMinutes} minutes.</p>` +
          "<p>If you didn't request this, you can ignore this email — your account will not " +
          'be changed.</p>',
      };
    },
  },
  'account-exists': {
    tr: (_variables, { webOrigin }) => {
      const loginUrl = buildLoginUrl(webOrigin, 'tr');
      const resetUrl = buildPasswordResetRequestUrl(webOrigin, 'tr');
      return {
        subject: 'Bu e-posta adresiyle zaten bir hesabınız var',
        text:
          'Biri bu e-posta adresiyle yeni bir hesap oluşturmaya çalıştı, ancak bu adresle ' +
          'zaten bir hesabınız var.\n\n' +
          `Bu işlemi siz yaptıysanız giriş yapabilir (${loginUrl}) veya şifrenizi unuttuysanız ` +
          `sıfırlayabilirsiniz (${resetUrl}).\n\n` +
          'Bu isteği siz yapmadıysanız hiçbir şey yapmanıza gerek yok: kimse hesabınıza ' +
          'erişmedi, bu e-postayı yok sayabilirsiniz.',
        html:
          '<p>Biri bu e-posta adresiyle yeni bir hesap oluşturmaya çalıştı, ancak bu adresle ' +
          'zaten bir hesabınız var.</p>' +
          `<p>Bu işlemi siz yaptıysanız giriş yapabilir (${linkHtml(loginUrl)}) veya şifrenizi ` +
          `unuttuysanız sıfırlayabilirsiniz (${linkHtml(resetUrl)}).</p>` +
          '<p>Bu isteği siz yapmadıysanız hiçbir şey yapmanıza gerek yok: kimse hesabınıza ' +
          'erişmedi, bu e-postayı yok sayabilirsiniz.</p>',
      };
    },
    en: (_variables, { webOrigin }) => {
      const loginUrl = buildLoginUrl(webOrigin, 'en');
      const resetUrl = buildPasswordResetRequestUrl(webOrigin, 'en');
      return {
        subject: 'You already have an account with this email',
        text:
          'Someone tried to create a new account with this email address, but you already ' +
          'have one.\n\n' +
          `If this was you, you can log in (${loginUrl}) or reset your password ` +
          `(${resetUrl}) if you've forgotten it.\n\n` +
          "If it wasn't you, no action is needed — no one gained access to your account, and " +
          'you can safely ignore this email.',
        html:
          '<p>Someone tried to create a new account with this email address, but you already ' +
          'have one.</p>' +
          `<p>If this was you, you can log in (${linkHtml(loginUrl)}) or reset your password ` +
          `(${linkHtml(resetUrl)}) if you've forgotten it.</p>` +
          "<p>If it wasn't you, no action is needed — no one gained access to your account, " +
          'and you can safely ignore this email.</p>',
      };
    },
  },
};
