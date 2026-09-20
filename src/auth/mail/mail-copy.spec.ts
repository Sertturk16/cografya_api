import { describe, expect, it } from '@jest/globals';
import { MAIL_COPY, type RenderedMail } from './mail-copy';
import type { MailLocale } from './mailer.port';

/**
 * WHAT EACH TEMPLATE PUTS INTO THE SHELL.
 *
 * `mail-layout.spec.ts` asks whether the envelope is a well-formed email, using synthetic
 * bodies. This file asks the other half, against the SIX real combinations: does every
 * template actually fill the envelope, and do the two locales stay parallel? The split is
 * why a shell rule is stated once rather than six times, and why a copy rule here does not
 * have to know how the shell renders it.
 *
 * It exists because `mail-layout.spec.ts`'s docblock cited it before it was written — a
 * pointer to a file that was not there, which is the citation class this repo treats as a
 * defect rather than a note.
 *
 * ## What a green run proves, and what it does not
 *
 * Green means all six render, carry their payload into both parts, and keep their links
 * absolute and correctly localized. It says nothing about how a mail CLIENT paints the
 * result: no test in this repo opens Gmail. It also cannot see the web side of the path
 * contract below — `cografya_web` is a different repository — so {@link RENDERED_PATHS}
 * pins the rendered URLs as a tripwire, not as proof the web still serves them.
 */

const WEB_ORIGIN = 'https://cografyagurmesi.test';
const CTX = { webOrigin: WEB_ORIGIN };
const LOCALES: readonly MailLocale[] = ['tr', 'en'];

function renderAll(locale: MailLocale): Record<string, RenderedMail> {
  return {
    'verify-email': MAIL_COPY['verify-email'][locale](
      { code: '418207', expiresInMinutes: 12 },
      CTX,
    ),
    'password-reset': MAIL_COPY['password-reset'][locale](
      { resetToken: 'tok_abc123', expiresInMinutes: 30 },
      CTX,
    ),
    'account-exists': MAIL_COPY['account-exists'][locale]({}, CTX),
  };
}

const EVERY_COMBINATION = LOCALES.flatMap((locale) =>
  Object.entries(renderAll(locale)).map(
    ([template, mail]) => [`${template}/${locale}`, locale, mail] as const,
  ),
);

/** Every `href` the html links to. */
function hrefsOf(html: string): string[] {
  return [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]!);
}

describe('every template fills the shell', () => {
  it.each(EVERY_COMBINATION)(
    '%s renders a subject, a text part and an html part',
    (_n, _l, mail) => {
      expect(mail.subject.length).toBeGreaterThan(0);
      expect(mail.text.length).toBeGreaterThan(0);
      expect(mail.html.length).toBeGreaterThan(0);
    },
  );

  it.each(EVERY_COMBINATION)('%s obeys the shell rules', (_n, locale, mail) => {
    expect(mail.html.startsWith('<!doctype html>')).toBe(true);
    expect(mail.html).toContain(`<html lang="${locale}"`);
    expect(mail.html).toContain('name="color-scheme"');
    // The two mail-only rules `mail-layout.ts` exists to hold. Asserted here too because a
    // template could reach past the shell and interpolate its own markup.
    expect(mail.html).not.toContain('class=');
    expect(mail.html).not.toContain('var(--');
  });

  it.each(EVERY_COMBINATION)('%s carries a preheader, hidden', (_n, _l, mail) => {
    const preheader = /<div style="display:none;[^"]*">([^<&]+)/.exec(mail.html);
    expect(preheader).not.toBeNull();
    expect(preheader![1]!.trim().length).toBeGreaterThan(0);
  });

  it('gives each template its own subject, in each locale', () => {
    for (const locale of LOCALES) {
      const subjects = Object.values(renderAll(locale)).map((m) => m.subject);
      expect(new Set(subjects).size).toBe(subjects.length);
    }
  });
});

describe('links', () => {
  it.each(EVERY_COMBINATION)(
    '%s links only to absolute urls under the web origin',
    (_n, _l, mail) => {
      for (const href of hrefsOf(mail.html)) {
        expect(href.startsWith(`${WEB_ORIGIN}/`)).toBe(true);
      }
    },
  );

  it('the verification mail links nowhere — the code is the whole payload', () => {
    for (const locale of LOCALES) {
      expect(hrefsOf(renderAll(locale)['verify-email']!.html)).toEqual([]);
    }
  });

  it('the two link-bearing templates do link somewhere', () => {
    for (const locale of LOCALES) {
      const rendered = renderAll(locale);
      expect(hrefsOf(rendered['password-reset']!.html).length).toBeGreaterThan(0);
      expect(hrefsOf(rendered['account-exists']!.html).length).toBeGreaterThan(0);
    }
  });

  /**
   * The rendered URLs, pinned. `mail-copy.ts` builds these from path constants whose docblock
   * claims they mirror `cografya_web/i18n/routing.ts` — TR unprefixed as the default locale,
   * EN under `/en`, because the web sets `localePrefix: "as-needed"`. That claim spans two
   * repositories and nothing in CI checks it, so this is the tripwire: a rename here goes red
   * and the message says to change the web with it, which is the only way the pair stays true.
   */
  const RENDERED_PATHS = {
    tr: {
      reset: '/sifre-sifirlama/yeni',
      resetRequest: '/sifre-sifirlama',
      login: '/giris',
    },
    en: {
      reset: '/en/reset-password/new',
      resetRequest: '/en/reset-password',
      login: '/en/login',
    },
  } as const;

  it.each(LOCALES)(
    '%s reset mail points at the localized confirm page, token attached',
    (locale) => {
      const html = renderAll(locale)['password-reset']!.html;
      const expected = `${WEB_ORIGIN}${RENDERED_PATHS[locale].reset}?token=tok_abc123`;
      expect(hrefsOf(html)).toContain(expected);
    },
  );

  it.each(LOCALES)('%s account-exists mail offers login and password reset', (locale) => {
    const hrefs = hrefsOf(renderAll(locale)['account-exists']!.html);
    expect(hrefs).toContain(`${WEB_ORIGIN}${RENDERED_PATHS[locale].login}`);
    expect(hrefs).toContain(`${WEB_ORIGIN}${RENDERED_PATHS[locale].resetRequest}`);
  });

  it('prefixes the EN routes with /en and leaves TR bare — the as-needed contract', () => {
    for (const [name, path] of Object.entries(RENDERED_PATHS.en)) {
      expect(path.startsWith('/en/')).toBe(true);
      expect(RENDERED_PATHS.tr[name as keyof typeof RENDERED_PATHS.tr].startsWith('/en/')).toBe(
        false,
      );
    }
  });
});

describe('the payload reaches both parts', () => {
  it.each(LOCALES)('%s verification code is in the html and the text', (locale) => {
    const mail = renderAll(locale)['verify-email']!;
    expect(mail.html).toContain('418207');
    expect(mail.text).toContain('418207');
  });

  it.each(LOCALES)('%s reset token is in the html and the text', (locale) => {
    const mail = renderAll(locale)['password-reset']!;
    expect(mail.html).toContain('tok_abc123');
    expect(mail.text).toContain('tok_abc123');
  });

  it.each(LOCALES)('%s never puts the secret in the subject or the preheader', (locale) => {
    // Subjects and preview lines are shown in notification banners and written to more logs
    // than a body is. Neither needs the secret, so neither should carry it.
    const verify = renderAll(locale)['verify-email']!;
    expect(verify.subject).not.toContain('418207');
    const reset = renderAll(locale)['password-reset']!;
    expect(reset.subject).not.toContain('tok_abc123');
    const preheader = /<div style="display:none;[^"]*">([^<&]+)/.exec(reset.html)![1]!;
    expect(preheader).not.toContain('tok_abc123');
  });
});

describe('the two locales stay parallel', () => {
  it('every template links to the same number of places in both locales', () => {
    const tr = renderAll('tr');
    const en = renderAll('en');
    for (const template of Object.keys(tr)) {
      expect(hrefsOf(en[template]!.html).length).toBe(hrefsOf(tr[template]!.html).length);
    }
  });

  it('no locale is left rendering the other one — every combination differs', () => {
    const tr = renderAll('tr');
    const en = renderAll('en');
    for (const template of Object.keys(tr)) {
      expect(en[template]!.subject).not.toBe(tr[template]!.subject);
      expect(en[template]!.text).not.toBe(tr[template]!.text);
    }
  });
});
