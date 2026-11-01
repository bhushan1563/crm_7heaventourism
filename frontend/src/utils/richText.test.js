import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { RICH_TAGS, cleanStyle, looksLikeHtml, plainToHtml, richToPlainText, sanitizeForDisplay, toDisplayHtml } from './richText';

describe('cleanStyle', () => {
  it('keeps colour, highlight and font size with valid values', () => {
    expect(cleanStyle('color: #ff0000; font-size: 18px; background-color: rgb(1, 2, 3)')).toBe('color:#ff0000;font-size:18px;background-color:rgb(1, 2, 3)');
  });
  it('drops anything else', () => {
    expect(cleanStyle('position:fixed; color: red; font-size: 99px; background: url(javascript:x); color: expression(1)')).toBe('');
    expect(cleanStyle('font-size: 7px')).toBe('');
    expect(cleanStyle(null)).toBe('');
  });
});

describe('sanitizeForDisplay', () => {
  it('keeps the formatting the editor produces', () => {
    const out = sanitizeForDisplay('<p><strong>a</strong> <em>b</em> <u>c</u> <span style="color:#ff0000;font-size:18px">d</span> <mark style="background-color:#fde047">e</mark></p><ul><li>x</li></ul>');
    expect(out).toContain('<strong>a</strong>');
    expect(out).toContain('color:#ff0000;font-size:18px');
    expect(out).toContain('<mark style="background-color:#fde047">e</mark>');
    expect(out).toContain('<ul><li>x</li></ul>');
  });

  it('removes script, handlers, links, images and bad styles', () => {
    for (const attack of [
      '<script>alert(1)</script>ok',
      '<img src=x onerror=alert(1)>ok',
      '<a href="javascript:alert(1)">ok</a>',
      '<p onclick="x()">ok</p>',
      'ok<svg onload=alert(1)>',
      'ok<iframe src="//evil"></iframe>',
      '<span style="position:fixed;font-size:900px">ok</span>'
    ]) {
      const out = sanitizeForDisplay(attack);
      expect(out).not.toMatch(/<script|<img|<svg|<iframe|<a\b|onerror|onclick|onload|javascript:|position|900px/i);
      expect(out).toContain('ok');
    }
  });

  it('property: nothing but whitelisted tags and styles ever comes out', () => {
    const nasty = fc.constantFrom('<script>x</script>', '<img src=x onerror=1>', '<a href="javascript:1">x</a>', '<svg onload=1>', '<p onmouseover="1">', '<span style="color:red;position:fixed">', '"><script>', '<style>*{}</style>', '<iframe>', '<form>');
    const part = fc.oneof(nasty, fc.string({ maxLength: 15 }), fc.constantFrom('<p>', '</p>', '<strong>', '</strong>', '<span style="color:#123456">', '</span>', '<ul><li>', '</li></ul>'));
    fc.assert(
      fc.property(fc.array(part, { maxLength: 20 }), (parts) => {
        const out = sanitizeForDisplay(parts.join(''));
        for (const [, tag] of out.matchAll(/<\/?([a-zA-Z][a-zA-Z0-9]*)/g)) expect(RICH_TAGS).toContain(tag.toLowerCase());
        expect(out).not.toMatch(/\son[a-z]+\s*=/i);
        for (const [, style] of out.matchAll(/style="([^"]*)"/g)) expect(style).toMatch(/^(?:(?:color|background-color|font-size):[^;]+;?)*$/);
      }),
      { numRuns: 400 }
    );
  });
});

describe('plain text (older records)', () => {
  it('is recognised and shown as text with its line breaks', () => {
    expect(looksLikeHtml('Day 1: Arrival & transfer')).toBe(false);
    expect(looksLikeHtml('5 < 6 and 7 > 3')).toBe(false);
    expect(looksLikeHtml('Price: <TBC> per pax')).toBe(false);
    expect(looksLikeHtml('<strong>x</strong>')).toBe(false); // the editor always wraps text in a block
    expect(looksLikeHtml('<p>x</p>')).toBe(true);
    expect(plainToHtml('Line one\nLine two\n\nSecond paragraph')).toBe('<p>Line one<br>Line two</p><p>Second paragraph</p>');
    expect(toDisplayHtml('a & b <c')).not.toContain('<c');
  });
  it('escapes markup characters in plain text', () => {
    expect(plainToHtml('Tom & Jerry "quoted"')).toBe('<p>Tom &amp; Jerry &quot;quoted&quot;</p>');
  });
});

describe('richToPlainText', () => {
  it('gives the visible words with breaks between paragraphs and items', () => {
    expect(richToPlainText('<p>One</p><p>Two &amp; three</p>')).toBe('One\nTwo & three');
    expect(richToPlainText('<ul><li>a</li><li>b</li></ul>')).toBe('a\nb');
    expect(richToPlainText('plain text')).toBe('plain text');
    expect(richToPlainText(undefined)).toBe('');
  });
});
