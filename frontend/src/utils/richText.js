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

// The formatting editor offers its sizes in pixels with "Normal" (14px) as the size of ordinary text, but a quotation is printed small (about
// 9.5px for its text). A size is therefore printed relative to the text around it: Normal is the text of the page, Large a little bigger,
// Small a little smaller. Without this, text pasted or sized in the editor came out at 14px or more beside 9.5px text.
const EDITOR_TEXT_PX = 14;
const toRelativeSizes = (html) =>
  html.replace(/font-size:\s*(\d+(?:\.\d+)?)(px|pt)/gi, (_, n, unit) => `font-size:${Math.round(((Number(n) * (unit.toLowerCase() === 'pt' ? 4 / 3 : 1)) / EDITOR_TEXT_PX) * 1000) / 1000}em`);

/** Stored text as safe HTML for a printed document: like `toDisplayHtml`, with every size relative to the text around it. */
export const toDocumentHtml = (value) => toRelativeSizes(toDisplayHtml(value));

const escapeText = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * The blocks of a text as separate pieces of HTML, so a long text can run on over several pages instead of moving as one block:
 * each paragraph, each line of a paragraph (the lines of an itinerary day are kept with <br>) and each item of a list. The pieces,
 * set one under the other, look the same as the whole text. Returns [] for no text.
 */
export const splitDisplayBlocks = (html) => {
  const source = String(html ?? '').trim();
  if (!source) return [];
  const doc = new DOMParser().parseFromString(`<body>${source}</body>`, 'text/html');
  const blocks = [];
  const tight = (el) => {
    const style = el.getAttribute('style');
    el.setAttribute('style', `${style ? `${style};` : ''}margin:0`);
    return el;
  };
  for (const node of Array.from(doc.body.childNodes)) {
    if (node.nodeType === 3) {
      const text = node.textContent.trim();
      if (text) blocks.push(`<p>${escapeText(text)}</p>`);
    } else if (node.nodeType === 1 && (node.tagName === 'UL' || node.tagName === 'OL')) {
      const first = node.tagName === 'OL' ? Number(node.getAttribute('start')) || 1 : 0;
      Array.from(node.children).forEach((item, i) => {
        const list = doc.createElement(node.tagName.toLowerCase());
        if (first) list.setAttribute('start', String(first + i));
        list.appendChild(item.cloneNode(true));
        blocks.push(tight(list).outerHTML);
      });
    } else if (node.nodeType === 1 && node.tagName === 'P' && node.querySelector('br')) {
      let line = node.cloneNode(false);
      const flush = () => {
        if (line.textContent.trim() || line.querySelector('*')) blocks.push(tight(line).outerHTML);
        line = node.cloneNode(false);
      };
      for (const child of Array.from(node.childNodes)) {
        if (child.nodeType === 1 && child.tagName === 'BR') flush();
        else line.appendChild(child.cloneNode(true));
      }
      flush();
    } else if (node.nodeType === 1) {
      blocks.push(node.outerHTML);
    }
  }
  return blocks.length ? blocks : [source];
};

/** Visible text only, with line breaks between paragraphs and list items. */
export const richToPlainText = (value) => {
  if (typeof value !== 'string' || !value) return '';
  if (!looksLikeHtml(value)) return value;
  const withBreaks = sanitizeForDisplay(value).replace(/<\/(p|li)>|<br\s*\/?>/gi, '$&\n');
  const doc = new DOMParser().parseFromString(withBreaks, 'text/html');
  return (doc.body.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
};

/**
 * What to store for text typed in the formatting editor. The editor always answers in formatted form ("<p>Hello</p>"), but
 * a line with no formatting at all is just text: keep it as plain text, so older records, other screens and the mobile app
 * see exactly what was typed. Anything with real formatting (bold, colour, a list, a line break...) is kept as formatted text.
 */
export const simplifyRich = (html) => {
  if (typeof html !== 'string' || !html.trim()) return '';
  if (!looksLikeHtml(html)) return html;
  const body = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html').body;
  const only = body.children.length === 1 ? body.children[0] : null;
  const justText = only && only.tagName === 'P' && only.children.length === 0 && body.childNodes.length === 1;
  // (Text that itself starts like formatting, e.g. someone typing "<p>", must stay in its escaped form or it would be misread.)
  return justText && !looksLikeHtml(only.textContent) ? only.textContent : html;
};
