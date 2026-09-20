import type { MailLocale } from './mailer.port';
import { renderEmailHtml, renderEmailText, type EmailBody } from './mail-layout';

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
/**
 * Turns one message's content into the rendered pair. Every template goes through here, so the
 * HTML and the text part can never describe different links or a different code — they are two
 * readings of the same {@link EmailBody}. The shell itself is `mail-layout.ts`.
 */
function render(subject: string, body: EmailBody): RenderedMail {
  return { subject, text: renderEmailText(body), html: renderEmailHtml(body) };
}

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
    tr: ({ code, expiresInMinutes }) =>
      render('Coğrafya Gurmesi doğrulama kodunuz', {
        locale: 'tr',
        preheader: `Kodunuz ${expiresInMinutes} dakika geçerli.`,
        heading: 'Hesabınızı doğrulayın',
        lede: 'Kaydınızı tamamlamak için bu kodu doğrulama ekranına girin.',
        payload: { kind: 'code', code },
        meta: `${expiresInMinutes} dakika geçerli`,
        reassurance: 'Bu isteği siz yapmadıysanız bu e-postayı yok sayabilirsiniz.',
      }),
    en: ({ code, expiresInMinutes }) =>
      render('Your Coğrafya Gurmesi verification code', {
        locale: 'en',
        preheader: `Your code expires in ${expiresInMinutes} minutes.`,
        heading: 'Verify your account',
        lede: 'Enter this code on the verification screen to finish signing up.',
        payload: { kind: 'code', code },
        meta: `Expires in ${expiresInMinutes} minutes`,
        reassurance: "If you didn't request this, you can safely ignore this email.",
      }),
  },
  'password-reset': {
    tr: ({ resetToken, expiresInMinutes }, { webOrigin }) =>
      render('Şifre sıfırlama isteğiniz', {
        locale: 'tr',
        preheader: `Bağlantı ${expiresInMinutes} dakika geçerli.`,
        heading: 'Yeni şifre belirleyin',
        lede: 'Hesabınız için şifre sıfırlama isteği aldık. Yeni bir şifre belirlemek için aşağıdaki bağlantıyı kullanın.',
        payload: {
          kind: 'action',
          primary: {
            label: 'Yeni şifre belirle',
            url: buildPasswordResetUrl(webOrigin, 'tr', resetToken),
          },
          fallbackNote: 'Düğme çalışmazsa bu adresi tarayıcınıza yapıştırın:',
        },
        meta: `Bağlantı ${expiresInMinutes} dakika geçerli`,
        reassurance:
          'Bu isteği siz yapmadıysanız bu e-postayı yok sayın; hesabınızda hiçbir şey değişmez.',
      }),
    en: ({ resetToken, expiresInMinutes }, { webOrigin }) =>
      render('Reset your password', {
        locale: 'en',
        preheader: `The link expires in ${expiresInMinutes} minutes.`,
        heading: 'Choose a new password',
        lede: 'We received a request to reset your password. Use the link below to choose a new one.',
        payload: {
          kind: 'action',
          primary: {
            label: 'Choose a new password',
            url: buildPasswordResetUrl(webOrigin, 'en', resetToken),
          },
          fallbackNote: "If the button doesn't work, paste this address into your browser:",
        },
        meta: `The link expires in ${expiresInMinutes} minutes`,
        reassurance:
          "If you didn't request this, ignore this email — nothing about your account changes.",
      }),
  },
  'account-exists': {
    tr: (_variables, { webOrigin }) =>
      render('Bu e-posta adresiyle zaten bir hesabınız var', {
        locale: 'tr',
        preheader: 'Yeni bir hesap oluşturulmadı.',
        heading: 'Bu adresle zaten bir hesabınız var',
        lede: 'Biri bu e-posta adresiyle yeni bir hesap açmaya çalıştı. Adres kayıtlı olduğu için ikinci bir hesap oluşturulmadı.',
        payload: {
          kind: 'action',
          primary: { label: 'Giriş yap', url: buildLoginUrl(webOrigin, 'tr') },
          secondary: {
            label: 'Şifremi unuttum',
            url: buildPasswordResetRequestUrl(webOrigin, 'tr'),
          },
        },
        reassurance: 'Bu siz değilseniz yapmanız gereken bir şey yok. Kimse hesabınıza erişmedi.',
      }),
    en: (_variables, { webOrigin }) =>
      render('You already have an account with this email', {
        locale: 'en',
        preheader: 'No new account was created.',
        heading: 'You already have an account with this email',
        lede: 'Someone tried to create a new account with this address. It is already registered, so no second account was made.',
        payload: {
          kind: 'action',
          primary: { label: 'Log in', url: buildLoginUrl(webOrigin, 'en') },
          secondary: {
            label: 'I forgot my password',
            url: buildPasswordResetRequestUrl(webOrigin, 'en'),
          },
        },
        reassurance: "If this wasn't you, there's nothing to do. Nobody reached your account.",
      }),
  },
};
