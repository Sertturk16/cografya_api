import type { MailLocale } from './mailer.port';

/**
 * The Terra email shell — the envelope every outbound message is rendered into.
 *
 * Split out of `mail-copy.ts` rather than inlined there because that file's own docblock asks
 * to stay "pure data/paths/strings": six copy builders that each carried a full HTML document
 * would be six copies of the same chrome, and the first divergence between them would be
 * invisible. Copy stays copy; this file is the only place the shell exists.
 *
 * ## Why this looks nothing like web markup
 *
 * Mail clients are not browsers. Four constraints shape every line below, and each one is a
 * rule the web side of this project would consider a defect:
 *
 *   1. **No `class`, no stylesheet.** Gmail strips `<style>` in several contexts and Outlook.com
 *      rewrites it. Everything is an inline `style`, so nothing depends on a sheet surviving.
 *   2. **No CSS custom properties.** `var(--primary)` resolves nowhere in mail, so Terra's
 *      values are written out as hex. They are copied from `cografya_web/app/globals.css`
 *      `:root` and named in {@link TERRA} so a palette change has ONE place to land here.
 *   3. **Tables, not flex or grid.** Outlook renders through Word, which supports neither.
 *   4. **No webfont is guaranteed.** Fraunces and Nunito Sans load in Apple Mail and iOS and
 *      are ignored by Gmail and Outlook, so both stacks end in faces that exist everywhere —
 *      Georgia carries the display voice when Fraunces does not arrive, and both cover the
 *      Turkish İ ı ğ ş ç ö ü.
 *
 * ## The design
 *
 * Direction C ("Mutfak") of the three put to the owner on 2026-09-20, chosen with the logo
 * dropped: a centred wordmark over a white card on the parchment field. Dropping the image is
 * what makes the email whole with images blocked, which is the default in Gmail and Outlook —
 * there is no `<img>` anywhere in this file, and nothing in it degrades.
 */

/** Terra, flattened. Mirrors `cografya_web/app/globals.css` `:root`; see rule 2 above. */
const TERRA = {
  primary: '#b0522e',
  primaryDark: '#7e3a1e',
  ink: '#2b2622',
  slate: '#57504a',
  taupe: '#8a8078',
  border: '#ddd5cc',
  chipBg: '#ede3d5',
  surface: '#f1e9de',
  bg: '#fbf8f3',
  card: '#ffffff',
  onPrimary: '#ffffff',
} as const;

const DISPLAY_FONT = "'Fraunces',Georgia,'Times New Roman',serif";
const BODY_FONT = "'Nunito Sans',-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/** The action a message asks for: enter a code, or follow a link. */
export type EmailPayload =
  | { readonly kind: 'code'; readonly code: string }
  | {
      readonly kind: 'action';
      readonly primary: { readonly label: string; readonly url: string };
      readonly secondary?: { readonly label: string; readonly url: string };
      /** Introduces the plain-text copy of `primary.url`. Omit and no fallback block renders. */
      readonly fallbackNote?: string;
    };

/**
 * One message's content, independent of how it is rendered. Both renderers below read THIS,
 * which is what keeps the HTML and text parts from drifting apart — the failure mode where a
 * template's link is updated in one and not the other.
 */
export interface EmailBody {
  readonly locale: MailLocale;
  /** The inbox preview line. Rendered hidden in the HTML, absent from the text part. */
  readonly preheader: string;
  readonly heading: string;
  readonly lede: string;
  readonly payload: EmailPayload;
  /** The expiry line under the payload. */
  readonly meta?: string;
  readonly reassurance: string;
}

const FOOTER: Record<MailLocale, readonly [string, string]> = {
  tr: ['Coğrafya Gurmesi Yayınları', 'Bu e-posta hesap güvenliğiniz için gönderildi.'],
  en: ['Coğrafya Gurmesi Yayınları', 'This email was sent for the security of your account.'],
};

const TAGLINE: Record<MailLocale, string> = {
  tr: 'Atlas ve eğitim portalı',
  en: 'Atlas and learning portal',
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Pads the preview line so the body's opening words do not trail into it in the inbox list.
 * Zero-width non-joiners are the standard filler: they occupy the preview and print nothing.
 */
const PREVIEW_PADDING = '&#847;&zwnj;&nbsp;'.repeat(60);

function wordmark(locale: MailLocale): string {
  return `
            <tr>
              <td align="center" style="padding:0 0 26px 0;">
                <div style="font-family:${DISPLAY_FONT};font-size:23px;font-weight:700;color:${TERRA.primary};letter-spacing:-0.01em;line-height:1.2;">Coğrafya Gurmesi</div>
                <div style="font-family:${BODY_FONT};font-size:11px;color:${TERRA.taupe};padding-top:5px;">${escapeHtml(TAGLINE[locale])}</div>
              </td>
            </tr>`;
}

function codeBlock(code: string): string {
  return `
                  <tr>
                    <td align="center" style="padding:26px 0 0 0;">
                      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;">
                        <tr>
                          <td align="center" bgcolor="${TERRA.chipBg}" style="background:${TERRA.chipBg};border-radius:12px;padding:22px 34px;">
                            <div style="font-family:${DISPLAY_FONT};font-size:40px;font-weight:700;color:${TERRA.primaryDark};letter-spacing:0.16em;line-height:1;text-indent:0.16em;">${escapeHtml(code)}</div>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>`;
}

function actionBlock(payload: Extract<EmailPayload, { kind: 'action' }>): string {
  const href = escapeHtml(payload.primary.url);
  // The colour sits on the <a> as well as the <td>: a client that restyles one still paints
  // the other, and the label never ends up white-on-white.
  const button = `
                  <tr>
                    <td align="center" style="padding:26px 0 0 0;">
                      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;">
                        <tr>
                          <td align="center" bgcolor="${TERRA.primary}" style="background:${TERRA.primary};border-radius:999px;">
                            <a href="${href}" style="display:inline-block;background:${TERRA.primary};color:${TERRA.onPrimary};font-family:${BODY_FONT};font-size:15px;font-weight:700;line-height:1.2;text-decoration:none;padding:16px 38px;border-radius:999px;">${escapeHtml(payload.primary.label)}</a>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>`;

  const secondary = payload.secondary
    ? `
                  <tr>
                    <td align="center" style="padding:16px 0 0 0;font-family:${BODY_FONT};font-size:14px;">
                      <a href="${escapeHtml(payload.secondary.url)}" style="color:${TERRA.primaryDark};text-decoration:underline;">${escapeHtml(payload.secondary.label)}</a>
                    </td>
                  </tr>`
    : '';

  return button + secondary;
}

function fallbackBlock(payload: Extract<EmailPayload, { kind: 'action' }>): string {
  if (!payload.fallbackNote) return '';
  return `
                  <tr>
                    <td style="padding:24px 0 0 0;">
                      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-top:1px solid ${TERRA.chipBg};">
                        <tr>
                          <td align="center" style="padding:18px 0 0 0;font-family:${BODY_FONT};font-size:13px;line-height:1.6;color:${TERRA.taupe};">${escapeHtml(payload.fallbackNote)}</td>
                        </tr>
                        <tr>
                          <td align="center" style="padding:8px 0 0 0;font-family:${BODY_FONT};font-size:13px;line-height:1.5;color:${TERRA.primaryDark};word-break:break-all;">${escapeHtml(payload.primary.url)}</td>
                        </tr>
                      </table>
                    </td>
                  </tr>`;
}

export function renderEmailHtml(body: EmailBody): string {
  const payloadRows =
    body.payload.kind === 'code' ? codeBlock(body.payload.code) : actionBlock(body.payload);
  const fallback = body.payload.kind === 'action' ? fallbackBlock(body.payload) : '';
  const meta = body.meta
    ? `
                  <tr>
                    <td align="center" style="padding:14px 0 0 0;font-family:${BODY_FONT};font-size:13px;color:${TERRA.taupe};">${escapeHtml(body.meta)}</td>
                  </tr>`
    : '';
  const [org, note] = FOOTER[body.locale];

  return `<!doctype html>
<html lang="${body.locale}" style="margin:0;padding:0;">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="color-scheme" content="light">
    <meta name="supported-color-schemes" content="light">
    <title>${escapeHtml(body.heading)}</title>
  </head>
  <body style="margin:0;padding:0;background:${TERRA.bg};">
    <div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;color:${TERRA.bg};">${escapeHtml(body.preheader)}${PREVIEW_PADDING}</div>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${TERRA.bg};">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px;max-width:600px;">${wordmark(body.locale)}
            <tr>
              <td bgcolor="${TERRA.card}" style="background:${TERRA.card};border:1px solid ${TERRA.border};border-radius:16px;padding:36px 36px 32px 36px;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                  <tr>
                    <td align="center" style="font-family:${DISPLAY_FONT};font-size:26px;font-weight:600;color:${TERRA.primary};line-height:1.25;">${escapeHtml(body.heading)}</td>
                  </tr>
                  <tr>
                    <td align="center" style="padding:12px 0 0 0;font-family:${BODY_FONT};font-size:16px;line-height:1.65;color:${TERRA.slate};">${escapeHtml(body.lede)}</td>
                  </tr>${payloadRows}${meta}${fallback}
                  <tr>
                    <td align="center" style="padding:24px 0 0 0;font-family:${BODY_FONT};font-size:14px;line-height:1.6;color:${TERRA.taupe};">${escapeHtml(body.reassurance)}</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:22px 0 0 0;font-family:${BODY_FONT};font-size:12px;line-height:1.7;color:${TERRA.taupe};">${escapeHtml(org)}<br>${escapeHtml(note)}</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function renderEmailText(body: EmailBody): string {
  const blocks: string[] = [body.heading, body.lede];

  if (body.payload.kind === 'code') {
    blocks.push(body.payload.code);
  } else {
    blocks.push(`${body.payload.primary.label}: ${body.payload.primary.url}`);
    if (body.payload.secondary) {
      blocks.push(`${body.payload.secondary.label}: ${body.payload.secondary.url}`);
    }
  }

  if (body.meta) blocks.push(body.meta);
  blocks.push(body.reassurance);
  blocks.push(FOOTER[body.locale].join('\n'));

  return blocks.join('\n\n');
}
