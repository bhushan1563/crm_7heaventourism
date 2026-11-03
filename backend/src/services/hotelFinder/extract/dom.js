import { parseDocument } from 'htmlparser2';
import { findAll, getAttributeValue, textContent } from 'domutils';

// Small helpers over the parsed page, shared by every extractor. The parser never throws on bad HTML (it repairs it the way a
// browser does), and everything here works on text, never on scripts: nothing from a page is ever run.

export const parseHtml = (html) => parseDocument(String(html || ''), { decodeEntities: true, lowerCaseTags: true, lowerCaseAttributeNames: true });

export const elements = (root, names) => {
  const wanted = Array.isArray(names) ? names : [names];
  return findAll((node) => node.type === 'tag' || node.type === 'script' || node.type === 'style' ? wanted.includes(node.name) : false, root.children || [root]);
};

export const where = (root, test) => findAll((node) => (node.type === 'tag' || node.type === 'script' || node.type === 'style') && test(node), root.children || [root]);

export const attr = (node, name) => {
  const value = getAttributeValue(node, name);
  return value === undefined ? '' : String(value);
};

export const rawText = (node) => textContent(node);

/** Whitespace collapsed to single spaces, non-breaking and zero-width spaces turned into ordinary ones. */
export const squash = (text) => String(text ?? '').replace(/[   ]/g, ' ').replace(/[​‌‍﻿]/g, '').replace(/\s+/g, ' ').trim();

const SKIP = new Set(['script', 'style', 'noscript', 'template', 'svg', 'iframe', 'head', 'select', 'option', 'canvas', 'object', 'embed', 'audio', 'video', 'button', 'input', 'textarea']);
const BLOCK = new Set(['p', 'div', 'section', 'article', 'header', 'footer', 'main', 'nav', 'aside', 'ul', 'ol', 'li', 'table', 'tr', 'td', 'th', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'br', 'address', 'blockquote', 'dl', 'dt', 'dd', 'form', 'fieldset', 'figure', 'figcaption', 'hr', 'pre']);
const HIDDEN_STYLE = /(?:display\s*:\s*none|visibility\s*:\s*hidden)/i;

/**
 * The text a visitor would read: one array of lines (blocks start new lines), without scripts, styles, menus' hidden items and
 * elements hidden in their own style. Also reports which lines came from a heading, and the position of each in `text`.
 */
export const visibleLines = (root, { maxChars = 400_000 } = {}) => {
  const lines = [];
  let current = '';
  let total = 0;
  let headingDepth = 0;
  const flush = () => {
    const line = squash(current);
    current = '';
    if (line) {
      lines.push({ text: line, heading: headingDepth > 0 });
      total += line.length;
    }
  };
  const walk = (node) => {
    if (total > maxChars) return;
    if (node.type === 'text') {
      current += node.data;
      return;
    }
    if (node.type === 'script' || node.type === 'style') return; // the parser gives these their own node types: their text is code, never read
    if (node.type !== 'tag') {
      (node.children || []).forEach(walk);
      return;
    }
    if (SKIP.has(node.name)) return;
    if (node.attribs?.hidden !== undefined || node.attribs?.['aria-hidden'] === 'true' || (node.attribs?.style && HIDDEN_STYLE.test(node.attribs.style))) return;
    const block = BLOCK.has(node.name);
    const heading = /^h[1-6]$/.test(node.name);
    if (block) flush();
    if (heading) headingDepth += 1;
    (node.children || []).forEach(walk);
    if (heading) {
      flush();
      headingDepth -= 1;
    } else if (block) flush();
  };
  (root.children || []).forEach(walk);
  flush();
  return lines;
};

/** Decodes the entities and tags out of a string taken from an attribute or a script (a description in JSON-LD, say). */
export const plainText = (value) => {
  const text = String(value ?? '');
  if (!/[<&]/.test(text)) return squash(text);
  const doc = parseHtml(`<div>${text}</div>`);
  return squash(visibleLines(doc).map((l) => l.text).join(' '));
};

/** Text safe to show and to put in a document: decoded, with no markup left and no angle brackets at all. */
export const cleanDisplay = (value) => plainText(String(value ?? '')).replace(/[<>]/g, '').trim();

/** The address a (possibly relative) link points to, resolved against the page; null when it is not a web address. */
export const resolveUrl = (href, base) => {
  const text = squash(href);
  if (!text || /^(?:javascript|mailto|tel|sms|data|blob|about|file|ftp):/i.test(text) || text.startsWith('#')) return null;
  try {
    const url = new URL(text, base);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    url.hash = '';
    return url.href;
  } catch {
    return null;
  }
};
