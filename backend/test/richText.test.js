import './helpers.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { RICH_TAGS, sanitizeRich, sanitizeRichList, richToText, looksLikeHtml } from '../src/utils/richText.js';

const clean = (html, opts) => {
  const r = sanitizeRich(html, opts);
  assert.equal(r.ok, true, r.message);
  return r.value;
};
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

test('formatting the editor produces is kept: bold, italic, underline, lists, colour, highlight, font size', () => {
  const html =
    '<p><strong>Bold</strong> <em>italic</em> <u>under</u> <span style="color: #ff0000; font-size: 18px">red 18</span> ' +
    '<mark style="background-color: #fde047">highlight</mark></p><ul><li>one</li><li>two</li></ul><ol><li>first</li></ol>';
  const out = clean(html);
  for (const part of ['<strong>Bold</strong>', '<em>italic</em>', '<u>under</u>', '<ul><li>one</li>', '<ol><li>first</li></ol>']) assert.ok(out.includes(part), part);
  assert.match(out, /<span style="color:#ff0000;font-size:18px">red 18<\/span>/);
  assert.match(out, /<mark style="background-color:#fde047">highlight<\/mark>/);
});

test('<b> and <i> are stored as <strong> and <em>', () => {
  assert.equal(clean('<p><b>a</b><i>b</i></p>'), '<p><strong>a</strong><em>b</em></p>');
});

test('script, handlers, links, images and frames cannot be stored', () => {
  const attacks = [
    '<script>alert(1)</script>hello',
    '<img src=x onerror=alert(1)>hello',
    '<a href="javascript:alert(1)">click</a>',
    '<p onclick="steal()">text</p>',
    '<svg onload=alert(1)><circle/></svg>',
    '<iframe src="https://evil.example"></iframe>',
    '<style>body{display:none}</style><p>x</p>',
    '<span style="background:url(javascript:alert(1))">x</span>',
    '<span style="color: expression(alert(1))">x</span>',
    '<span style="position:fixed;top:0;left:0;font-size:900px">cover the page</span>',
    '<form action="/x"><input name=a></form>',
    '<object data="x"></object><embed src="x">',
    '<math><mi xlink:href="javascript:alert(1)">x</mi></math>',
    '&lt;script&gt;alert(1)&lt;/script&gt;'
  ];
  for (const attack of attacks) {
    const out = clean(`<p>${attack}</p>`); // formatted text always starts with a block
    assert.doesNotMatch(out, /<\s*(script|img|svg|iframe|style|form|input|object|embed|math|a)\b/i, attack);
    assert.doesNotMatch(out, /\son\w+\s*=/i, attack);
    assert.doesNotMatch(out, /javascript:|expression\(|url\(|position|900px/i, attack);
  }
  assert.equal(clean('<p><script>alert(1)</script>hello</p>'), '<p>hello</p>', 'script content is dropped, not shown');
  assert.equal(clean('<p><a href="javascript:alert(1)">click</a></p>'), '<p>click</p>', 'a link keeps its text only');
});

test('style values outside the allowed set are removed, allowed ones are kept', () => {
  assert.equal(clean('<p><span style="font-size: 7px">tiny</span></p>'), '<p><span>tiny</span></p>', 'below 8px');
  assert.equal(clean('<p><span style="font-size: 65px">huge</span></p>'), '<p><span>huge</span></p>', 'above 64px');
  assert.equal(clean('<p><span style="font-size: 2em">em</span></p>'), '<p><span>em</span></p>', 'only px/pt');
  assert.equal(clean('<p><span style="color: rgb(10, 20, 30)">ok</span></p>'), '<p><span style="color:rgb(10, 20, 30)">ok</span></p>');
  assert.equal(clean('<p><span style="color: red">named</span></p>'), '<p><span>named</span></p>', 'named colours are not stored');
});

test('plain text is kept exactly as typed, including angle brackets that are not formatting', () => {
  for (const text of [
    'Day 1: Arrival & transfer',
    'Tom & Jerry < 5 > 3',
    'Line one\nLine two',
    '₹ 25,000 per person',
    'Price: <TBC> per pax',
    'Call John <john@x.com> now',
    'a<b and c>d',
    '<script>alert(1)</script> typed literally'
  ]) {
    assert.equal(clean(text), text);
    assert.equal(looksLikeHtml(text), false, text);
  }
  assert.equal(looksLikeHtml('<p>x</p>'), true);
  assert.equal(looksLikeHtml('  <ul><li>x</li></ul>'), true);
  assert.equal(looksLikeHtml('<strong>x</strong>'), false, 'the editor always wraps text in a block');
});

test('empty content collapses to an empty string', () => {
  for (const empty of [undefined, null, '', '<p></p>', '<p> </p>', '<p><br></p><p></p>', '<p>&nbsp;</p>']) assert.equal(clean(empty), '', String(empty));
});

test('limits and wrong types give plain-language messages', () => {
  assert.match(sanitizeRich(123, { label: 'Notes' }).message, /Notes must be text/);
  assert.match(sanitizeRich('x'.repeat(30000), { label: 'Notes' }).message, /Notes is too long \(30,000 characters; the limit is 20,000\)/);
  assert.match(sanitizeRich('<p>' + 'x'.repeat(30000) + '</p>', { label: 'Notes' }).message, /too long/);
  assert.match(sanitizeRich('x'.repeat(70000)).message, /too long/);
  assert.equal(sanitizeRich('<p>' + 'x'.repeat(500) + '</p>', { maxText: 500 }).ok, true);
});

test('lists: blank items are dropped, formatting kept, size capped', () => {
  const r = sanitizeRichList(['  ', '<p>ok</p>', '<script>x</script>', 'plain'], { label: 'Inclusions' });
  assert.deepEqual(r, { ok: true, value: ['<p>ok</p>', '<script>x</script>', 'plain'] }); // the middle one is just text
  assert.match(sanitizeRichList('nope', { label: 'Inclusions' }).message, /must be a list/);
  assert.match(sanitizeRichList(new Array(101).fill('a'), { label: 'Inclusions' }).message, /at most 100/);
});

test('richToText: visible text only, line breaks kept between paragraphs and items', () => {
  assert.equal(richToText('<p>One</p><p>Two &amp; three</p>'), 'One\nTwo & three');
  assert.equal(richToText('<ul><li>a</li><li>b</li></ul>'), 'a\nb');
  assert.equal(richToText('plain'), 'plain');
  assert.equal(richToText(null), '');
});

// ---------------------------------------------------------------- crafted input must not be able to stall the server

const within = (ms, fn) => {
  const started = Date.now();
  const result = fn();
  const took = Date.now() - started;
  assert.ok(took < ms, `took ${took} ms (limit ${ms})`);
  return result;
};

test('regression: piles of empty paragraphs are handled in linear time (the old pattern took hours)', () => {
  within(1500, () => sanitizeRich('<p></p>'.repeat(7000) + '<p>x</p>', { maxText: 1e6 }));
  within(1500, () => sanitizeRich('<p>&nbsp;</p>'.repeat(4000) + '<p>x</p>', { maxText: 1e6 }));
  const onlyEmpty = within(1500, () => sanitizeRich('<p></p>'.repeat(8000), { maxText: 1e6 }));
  assert.deepEqual(onlyEmpty, { ok: true, value: '' });
});

test('regression: deeply nested lists are cut off quickly', () => {
  const bomb = '<ul><li>'.repeat(3000) + 'x' + '</li></ul>'.repeat(3000);
  const r = within(1500, () => sanitizeRich(bomb, { maxText: 1e6 }));
  assert.equal(r.ok, true);
  assert.ok(r.value.length < 2000, 'the pile was reduced to a few levels');
});

// ---------------------------------------------------------------- property-based (the "hypothesis" tests)

const nasty = fc.constantFrom(
  '<script>alert(1)</script>', '<img src=x onerror=alert(1)>', '<a href="javascript:alert(1)">x</a>', '<svg onload=alert(1)>',
  '<iframe src=//evil></iframe>', '<style>*{}</style>', '<span style="background:url(x)">', '<span style="color:expression(1)">',
  '<p onmouseover="x()">', '"><script>', "'><img src=x onerror=1>", '<math>', '<form>', '&lt;script&gt;', '<!--', '-->', '<![CDATA[',
  '<noscript><p title="</noscript><img src=x onerror=alert(1)>">', '<span style="font-size:99999px">', '\u0000', 'javascript:', 'data:text/html,x'
);
const fragment = fc.oneof(nasty, fc.string({ maxLength: 20 }), fc.constantFrom('<p>', '</p>', '<strong>', '</strong>', '<ul>', '<li>', '</li>', '</ul>', '<span>', '</span>', '<br>'));
const hostileDoc = fc.array(fragment, { maxLength: 25 }).map((parts) => parts.join(''));
const formattedHostileDoc = hostileDoc.map((doc) => `<p>${doc}`); // forces the formatted-text path

const TAG = /<\/?([a-zA-Z][a-zA-Z0-9]*)/g;
const assertSafe = (out) => {
  for (const [, tag] of out.matchAll(TAG)) assert.ok(RICH_TAGS.includes(tag.toLowerCase()), `tag <${tag}> must not survive: ${out}`);
  assert.doesNotMatch(out, /\son[a-z]+\s*=/i, out);
  // 'javascript:' as visible TEXT is harmless (the whitelist has no link or src attribute); it is checked inside styles below.
  assert.doesNotMatch(out, /<!--|<!\[CDATA|[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/, out);
  for (const [, style] of out.matchAll(/style="([^"]*)"/g)) {
    for (const declaration of style.split(';').filter(Boolean)) {
      assert.match(declaration.trim(), /^(?:color|background-color|font-size):/, `style ${declaration}`);
      assert.doesNotMatch(declaration, /javascript:|expression\(|url\(|[<>"']/i, `style value ${declaration}`);
    }
  }
};

test('property: formatted text never leaves the sanitiser with anything but whitelisted tags and styles', () => {
  fc.assert(
    fc.property(formattedHostileDoc, (doc) => {
      const r = sanitizeRich(doc, { maxText: 1_000_000 });
      if (!r.ok) return;
      assert.equal(looksLikeHtml(r.value) || r.value === '', true, 'formatted input stays formatted (or becomes empty)');
      assertSafe(r.value);
    }),
    { numRuns: 4000 }
  );
});

test('property: anything else is plain text: kept as typed (minus control characters), shown as text', () => {
  fc.assert(
    fc.property(hostileDoc, (doc) => {
      const typed = doc.replace(CONTROL, '');
      const r = sanitizeRich(doc, { maxText: 1_000_000 });
      if (!r.ok) return;
      if (looksLikeHtml(typed)) assertSafe(r.value);
      else assert.equal(r.value, typed.replace(/\r\n/g, '\n'));
    }),
    { numRuns: 4000 }
  );
});

test('property: sanitising is idempotent (a second pass changes nothing)', () => {
  fc.assert(
    fc.property(fc.oneof(hostileDoc, formattedHostileDoc), (doc) => {
      const once = sanitizeRich(doc, { maxText: 1_000_000 });
      if (!once.ok) return;
      const twice = sanitizeRich(once.value, { maxText: 1_000_000 });
      assert.equal(twice.ok, true);
      assert.equal(twice.value, once.value);
    }),
    { numRuns: 3000 }
  );
});

test('property: arbitrary unicode text never throws', () => {
  fc.assert(
    fc.property(fc.string({ unit: 'binary', maxLength: 300 }), (s) => {
      const r = sanitizeRich(s, { maxText: 1_000_000 });
      assert.equal(typeof r.ok, 'boolean');
    }),
    { numRuns: 3000 }
  );
});

test('property: text inside allowed formatting survives (nothing the user typed is lost)', () => {
  const word = fc.stringMatching(/^[A-Za-z0-9 .,]{1,30}$/).filter((s) => s.trim().length > 0);
  const wrap = fc.constantFrom((t) => `<strong>${t}</strong>`, (t) => `<em>${t}</em>`, (t) => `<u>${t}</u>`, (t) => `<span style="color: #123abc">${t}</span>`, (t) => `<mark style="background-color: #fde047">${t}</mark>`);
  fc.assert(
    fc.property(fc.array(fc.tuple(word, wrap), { minLength: 1, maxLength: 8 }), (items) => {
      const html = '<p>' + items.map(([t, w]) => w(t)).join(' ') + '</p>';
      const out = sanitizeRich(html);
      assert.equal(out.ok, true);
      assert.equal(richToText(out.value).replace(/\s+/g, ' '), items.map(([t]) => t).join(' ').replace(/\s+/g, ' ').trim());
    }),
    { numRuns: 1000 }
  );
});
