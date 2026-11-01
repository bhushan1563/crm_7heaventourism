// Formatted text is stored as a small whitelisted subset of HTML (the server enforces it when saving). This file is the
// second line of defence on the way OUT: whatever is about to be shown is cleaned again, so a bad value can never run
// script in anybody's browser. Old records hold plain text; it is shown as text, with its line breaks.
import DOMPurify from 'dompurify';

export const RICH_TAGS = ['p', 'br', 'strong', 'em', 'u', 's', 'span', 'mark', 'ul', 'ol', 'li'];

const COLOR = [/^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i, /^rgba?\(\s*(?:\d{1,3}\s*,\s*){2}\d{1,3}\s*(?:,\s*(?:0|1|0?\.\d{1,3}|1\.0)\s*)?\)$/i];
const FONT_SIZE = [/^(?:[89]|[1-5]\d|6[0-4])(?:\.\d{1,2})?(?:px|pt)$/];
const ALLOWED_STYLES = { color: COLOR, 'background-color': COLOR, 'font-size': FONT_SIZE };

/** Keeps only the style declarations the format allows (colour, highlight, size) with valid values. */
export const cleanStyle = (style) =>
  String(style || '')
    .split(';')
    .map((declaration) => {
      const index = declaration.indexOf(':');
      if (index < 1) return null;
      const name = declaration.slice(0, index).trim().toLowerCase();
      const value = declaration.slice(index + 1).trim();
      const rules = ALLOWED_STYLES[name];
      return rules && rules.some((rule) => rule.test(value)) ? `${name}:${value}` : null;
    })
    .filter(Boolean)
    .join(';');

let hooked = false;
const ensureHook = () => {
  if (hooked) return;
  hooked = true;
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (!node.hasAttribute?.('style')) return;
    const style = cleanStyle(node.getAttribute('style'));
    if (style) node.setAttribute('style', style);
    else node.removeAttribute('style');
  });
};

// Formatted text always begins with a block the editor produces (<p>, <ul> or <ol>); anything else is plain text, shown
// as text exactly as typed (so "Price: <TBC> per pax" stays readable). Same rule as the server.
const HTML_HINT = /^\s*<(?:p|ul|ol)[\s>/]/i;
/** True when the value carries formatting; false for plain text. */
export const looksLikeHtml = (value) => typeof value === 'string' && HTML_HINT.test(value);

/** Markup that is safe to put into the page. */
export const sanitizeForDisplay = (html) => {
  ensureHook();
  return DOMPurify.sanitize(String(html ?? ''), {
    ALLOWED_TAGS: RICH_TAGS,
    ALLOWED_ATTR: ['style'],
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
    KEEP_CONTENT: true,
    FORCE_BODY: true // text after a leading <script>/<style> must survive (they are removed, the words stay)
  });
};

const escapeHtml = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Plain text -> editor/export HTML (paragraphs at blank lines, <br> at single line breaks). */
export const plainToHtml = (text) =>
  String(text ?? '')
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, '<br>')}</p>`)
    .join('');

/** Whatever is stored (plain or formatted) as safe HTML. */
export const toDisplayHtml = (value) => (looksLikeHtml(value) ? sanitizeForDisplay(value) : plainToHtml(value));

/** Visible text only, with line breaks between paragraphs and list items. */
export const richToPlainText = (value) => {
  if (typeof value !== 'string' || !value) return '';
  if (!looksLikeHtml(value)) return value;
  const withBreaks = sanitizeForDisplay(value).replace(/<\/(p|li)>|<br\s*\/?>/gi, '$&\n');
  const doc = new DOMParser().parseFromString(withBreaks, 'text/html');
  return (doc.body.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
};
