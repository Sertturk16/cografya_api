import { describe, expect, it } from '@jest/globals';
import { renderEmailHtml, renderEmailText, type EmailBody } from './mail-layout';

/**
 * The shell's own rules. The copy each template puts INTO the shell is `mail-copy.spec.ts`'s
 * subject; this file only asks whether the envelope is a well-formed email.
 */

const CODE_BODY: EmailBody = {
  locale: 'tr',
  preheader: 'Kodunuz 12 dakika geçerli.',
  heading: 'Hesabınızı doğrulayın',
  lede: 'Kaydınızı tamamlamak için bu kodu doğrulama ekranına girin.',
  payload: { kind: 'code', code: '418207' },
  meta: '12 dakika geçerli',
  reassurance: 'Bu isteği siz yapmadıysanız bu e-postayı yok sayabilirsiniz.',
};

const ACTION_BODY: EmailBody = {
  locale: 'tr',
  preheader: 'Bağlantı 30 dakika geçerli.',
  heading: 'Yeni şifre belirleyin',
  lede: 'Hesabınız için şifre sıfırlama isteği aldık.',
  payload: {
    kind: 'action',
    primary: {
      label: 'Yeni şifre belirle',
      url: 'https://example.test/sifre-sifirlama/yeni?token=abc',
    },
    secondary: { label: 'Şifremi unuttum', url: 'https://example.test/sifre-sifirlama' },
    fallbackNote: 'Düğme çalışmazsa bu adresi tarayıcınıza yapıştırın:',
  },
  meta: 'Bağlantı 30 dakika geçerli',
  reassurance: 'Bu isteği siz yapmadıysanız bu e-postayı yok sayın.',
};

describe('renderEmailHtml — the envelope', () => {
  it('declares the document, the charset and a light colour scheme', () => {
    const html = renderEmailHtml(CODE_BODY);
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<html lang="tr"');
    expect(html).toContain('charset="utf-8"');
    // Without this, Gmail and Outlook.com re-colour the palette themselves and the parchment
    // field goes to a grey nobody chose.
    expect(html).toContain('name="color-scheme"');
    expect(html).toContain('name="supported-color-schemes"');
  });

  it('carries the preheader, and hides it from the body', () => {
    const html = renderEmailHtml(CODE_BODY);
    expect(html).toContain(CODE_BODY.preheader);
    // The preheader is the inbox preview line. It must not also render as the first
    // visible words of the email.
    const block = /<div[^>]*>\s*Kodunuz 12 dakika geçerli\./.exec(html);
    expect(block).not.toBeNull();
    expect(block![0]).toContain('display:none');
  });

  it('uses NO class attribute and NO CSS custom property', () => {
    const html = renderEmailHtml(ACTION_BODY);
    // Both are the same mistake in different clothes: a stylesheet many clients strip, and a
    // `var(--token)` no mail client resolves. Terra's values are written out as hex here.
    expect(html).not.toContain('class=');
    expect(html).not.toContain('var(--');
  });

  it('lays out with tables, not flex or grid', () => {
    const html = renderEmailHtml(ACTION_BODY);
    expect(html).toContain('role="presentation"');
    expect(html).not.toContain('display:flex');
    expect(html).not.toContain('display:grid');
  });

  it('renders the code large enough to read and copy', () => {
    const html = renderEmailHtml(CODE_BODY);
    expect(html).toContain('418207');
    // Anchored on the code's OWN element. An earlier version of this read the first
    // `font-size` followed by a `letter-spacing` anywhere in the document and measured the
    // wordmark (23px), which is tracked too — it would have passed a 12px code.
    const size = /font-size:(\d+)px[^"]*"[^>]*>418207</.exec(html);
    expect(size).not.toBeNull();
    expect(Number(size![1])).toBeGreaterThanOrEqual(32);
  });

  it('renders the primary action as a link carrying its own background', () => {
    const html = renderEmailHtml(ACTION_BODY);
    expect(html).toContain('href="https://example.test/sifre-sifirlama/yeni?token=abc"');
    expect(html).toContain('Yeni şifre belirle');
    // A button whose colour lives only on the <td> loses it wherever the <a> is restyled.
    expect(/<a [^>]*background:#b0522e[^>]*>/.test(html)).toBe(true);
  });

  it('prints the destination as text too, so a dead button is not a dead end', () => {
    const html = renderEmailHtml(ACTION_BODY);
    const occurrences =
      html.split('https://example.test/sifre-sifirlama/yeni?token=abc').length - 1;
    expect(occurrences).toBeGreaterThanOrEqual(2);
  });

  it('escapes what it interpolates', () => {
    const html = renderEmailHtml({
      ...CODE_BODY,
      payload: { kind: 'code', code: '<script>x</script>' },
      heading: 'a & b',
    });
    expect(html).not.toContain('<script>x</script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('a &amp; b');
  });

  it('follows the body locale into the lang attribute', () => {
    expect(renderEmailHtml({ ...CODE_BODY, locale: 'en' })).toContain('<html lang="en"');
  });
});

describe('renderEmailText — the plain-text twin', () => {
  it('carries the same code as the html', () => {
    expect(renderEmailText(CODE_BODY)).toContain('418207');
  });

  it('carries every url the html links to', () => {
    const text = renderEmailText(ACTION_BODY);
    expect(text).toContain('https://example.test/sifre-sifirlama/yeni?token=abc');
    expect(text).toContain('https://example.test/sifre-sifirlama');
  });

  it('carries the heading, lede and reassurance', () => {
    const text = renderEmailText(ACTION_BODY);
    expect(text).toContain(ACTION_BODY.heading);
    expect(text).toContain(ACTION_BODY.lede);
    expect(text).toContain(ACTION_BODY.reassurance);
  });

  it('is plain — no markup, and no html escaping leaking through', () => {
    const text = renderEmailText({ ...CODE_BODY, heading: 'a & b' });
    expect(text).not.toContain('<');
    expect(text).toContain('a & b');
    expect(text).not.toContain('&amp;');
  });

  it('does not repeat the preheader, which only exists for the inbox preview', () => {
    expect(renderEmailText(CODE_BODY)).not.toContain(CODE_BODY.preheader);
  });
});
