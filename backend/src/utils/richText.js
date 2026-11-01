import sanitizeHtml from 'sanitize-html';

// Formatted text (bold, colour, highlight, font size, lists) is stored as a small, whitelisted subset of HTML.
// The browser editor produces it, but the server NEVER trusts that: everything written to the database goes through
// sanitizeRich(), so a hand-made request cannot store script, event handlers, links, images or unusual styles.
//
// Old records hold plain text. A value that cannot start a tag is left exactly as it is, so nothing existing changes.

export const RICH_TAGS = ['p', 'br', 'strong', 'em', 'u', 's', 'span', 'mark', 'ul', 'ol', 'li'];

const COLOR = [
  /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i,
  /^rgba?\(\s*(?:\d{1,3}\s*,\s*){2}\d{1,3}\s*(?:,\s*(?:0|1|0?\.\d{1,3}|1\.0)\s*)?\)$/i
];
const FONT_SIZE = [/^(?:[89]|[1-5]\d|6[0-4])(?:\.\d{1,2})?(?:px|pt)$/]; // 8 to 64 px/pt

const OPTIONS = {
  allowedTags: RICH_TAGS,
  allowedAttributes: { span: ['style'], mark: ['style'] },
  allowedStyles: {
    span: { color: COLOR, 'background-color': COLOR, 'font-size': FONT_SIZE },
    mark: { 'background-color': COLOR, color: COLOR }
  },
  // A tag that is not allowed is dropped but its text stays; script / style / textarea are dropped together with their content.
  disallowedTagsMode: 'discard',
  nestingLimit: 8, // deeper nesting is dropped (a deep pile of lists is slow to process and never useful)
  allowedSchemes: [],
  allowProtocolRelative: false,
  // Editors may emit <b>/<i>; store one spelling.
  transformTags: { b: 'strong', i: 'em' },
  parser: { decodeEntities: true }
};

// Hard ceilings (the controllers turn these into plain-language messages).
export const MAX_RICH_INPUT = 60_000; // refuse absurd payloads before parsing them (20,000 visible characters need far less)
export const DEFAULT_MAX_TEXT = 20_000; // visible characters

// C0 control characters except tab, line feed and carriage return, plus DEL.
const CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

// Formatted text always begins with a block the editor produces (<p>, <ul> or <ol>). Anything else is plain text, kept
// exactly as typed, so "Price: <TBC> per pax" or "Call John <john@x.com>" survive. Screens and documents show plain text
// as text (never as markup), so what it contains cannot run.
const HTML_HINT = /^\s*<(?:p|ul|ol)[\s>/]/i;

/** True when the value carries markup (so it must be sanitised); false for the plain text of older records. */
export const looksLikeHtml = (value) => typeof value === 'string' && HTML_HINT.test(value);

const NAMED_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decodeEntities = (text) =>
  text
    .replace(/&#x([0-9a-f]{1,6});/gi, (_, hex) => String.fromCodePoint(Math.min(parseInt(hex, 16), 0x10ffff)))
    .replace(/&#(\d{1,7});/g, (_, dec) => String.fromCodePoint(Math.min(Number(dec), 0x10ffff)))
    .replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (_, name) => NAMED_ENTITIES[name]);

const escapeHtml = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Plain text -> paragraphs of safe HTML (used when text has to be turned into the rich format). */
export const textToHtml = (text) =>
  String(text ?? '')
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, '<br />')}</p>`)
    .join('');

/** Visible text of a rich value (for search, previews and length checks). Plain text is returned as it is. */
export const richToText = (value) => {
  if (typeof value !== 'string' || !value) return '';
  if (!looksLikeHtml(value)) return value;
  const stripped = sanitizeHtml(value.replace(/<\/(p|li)>|<br\s*\/?>/gi, '$&\n'), {
    allowedTags: [],
    allowedAttributes: {},
    parser: { decodeEntities: true }
  });
  return decodeEntities(stripped).replace(/\n{3,}/g, '\n\n').trim();
};

const isEmptyHtml = (html) => richToText(html).replace(/[\s\u00a0]+/g, '') === '';

/**
 * Removes empty paragraphs (and ones holding only line breaks / non-breaking spaces) from the END. Done by walking back
 * from the end, so it costs time in proportion to the text: a pattern for this would backtrack badly on crafted input.
 */
const dropTrailingEmptyParagraphs = (html) => {
  let end = html.length;
  for (;;) {
    while (end > 0 && /\s/.test(html[end - 1])) end -= 1;
    if (!html.startsWith('</p>', end - 4)) break;
    const start = html.lastIndexOf('<p>', end - 4);
    if (start === -1) break;
    const inner = html.slice(start + 3, end - 4);
    if (inner.replace(/&nbsp;|<br \/>|[\s\u00a0]/g, '') !== '') break;
    end = start;
  }
  return html.slice(0, end);
};

const sanitizePass = (html) =>
  dropTrailingEmptyParagraphs(
    sanitizeHtml(html, OPTIONS).replace(CONTROL_CHARS, '') // entities such as &#1; are decoded by the parser, so clean its output too
  ).trim();

/**
 * Makes a value safe to store.
 * @returns {{ ok: true, value: string } | { ok: false, message: string }}
 */
export const sanitizeRich = (input, { label = 'Text', maxText = DEFAULT_MAX_TEXT } = {}) => {
  if (input === undefined || input === null) return { ok: true, value: '' };
  if (typeof input !== 'string') return { ok: false, message: `${label} must be text.` };
  if (input.length > MAX_RICH_INPUT) return { ok: false, message: `${label} is too long. Please shorten it.` };
  // Invisible control characters (NUL, bell, escape ...) have no place in a quotation and upset downstream tools.
  input = input.replace(CONTROL_CHARS, '');

  const tooLong = (length) => ({
    ok: false,
    message: `${label} is too long (${length.toLocaleString('en-IN')} characters; the limit is ${maxText.toLocaleString('en-IN')}).`
  });

  if (!looksLikeHtml(input)) {
    const plain = input.replace(/\r\n/g, '\n');
    return plain.length > maxText ? tooLong(plain.length) : { ok: true, value: plain };
  }

  // One pass is not always final (re-parsing can re-balance nested paragraphs), so repeat until the result stops changing.
  // What is stored is then a fixed point: saving the same text again never alters it.
  let html = sanitizePass(input);
  let settled = false;
  for (let i = 0; i < 4 && !settled; i += 1) {
    const next = sanitizePass(html);
    settled = next === html;
    html = next;
  }
  if (!settled) html = textToHtml(richToText(html)); // pathological input: keep the words, drop the structure
  if (isEmptyHtml(html)) html = '';

  const length = richToText(html).length;
  return length > maxText ? tooLong(length) : { ok: true, value: html };
};

/** A list of rich values (inclusions, notes ...). Blank entries are dropped. */
export const sanitizeRichList = (input, { label = 'List', maxItems = 100, maxText = 2000 } = {}) => {
  if (input === undefined || input === null) return { ok: true, value: [] };
  if (!Array.isArray(input)) return { ok: false, message: `${label} must be a list.` };
  if (input.length > maxItems) return { ok: false, message: `${label} can have at most ${maxItems} items.` };
  const out = [];
  for (const [index, item] of input.entries()) {
    const r = sanitizeRich(item, { label: `${label}, item ${index + 1}`, maxText });
    if (!r.ok) return r;
    if (richToText(r.value).trim()) out.push(r.value);
  }
  return { ok: true, value: out };
};
