import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import dns from 'node:dns';
import net from 'node:net';
import zlib from 'node:zlib';
import fc from 'fast-check';
import { READER_LIMITS, USER_AGENT, looksBlocked, readUrl } from '../src/services/hotelFinder/webReader.js';
import { page, startSite } from './helpers-sites.js';

// The safe page reader, against real connections to pretend sites on this computer (allowPrivate is only for these tests) and
// against scripted answers (the `transport` seam) for the rules that need a "public" address.

const local = { allowPrivate: true };
const withSite = async (t, routes) => {
  const site = await startSite(routes);
  t.after(() => site.close());
  return site;
};
const scripted = (answers) => {
  let i = 0;
  const calls = [];
  const transport = async (url, opts) => {
    calls.push(url.href);
    const next = answers[Math.min(i, answers.length - 1)];
    i += 1;
    if (typeof next === 'function') return next(url, opts);
    if (next instanceof Error) throw next;
    return { headers: {}, body: Buffer.alloc(0), truncated: false, ...next };
  };
  return { transport, calls };
};
const html = (text) => ({ status: 200, headers: { 'content-type': 'text/html; charset=utf-8' }, body: Buffer.from(text) });
const codeError = (code) => Object.assign(new Error(code), { code });

test('reads an ordinary page, as an honest visitor', async (t) => {
  const site = await withSite(t, { '/': { body: page('Taj Lake Palace', '<h1>Taj Lake Palace</h1>') } });
  const r = await readUrl(`${site.origin}/`, local);
  assert.equal(r.ok, true);
  assert.equal(r.status, 200);
  assert.equal(r.kind, 'html');
  assert.match(r.text, /<title>Taj Lake Palace<\/title>/);
  assert.equal(r.url, `${site.origin}/`);
  assert.deepEqual(r.redirects, []);
  assert.equal(r.truncated, false);
  assert.equal(r.blocked, false);
  const asked = site.requests[0].headers;
  assert.equal(asked['user-agent'], USER_AGENT);
  assert.match(asked['user-agent'], /7HeavenHotelFinder/);
  assert.match(asked['accept-encoding'], /gzip/);
  assert.match(asked.accept, /text\/html/);
  assert.equal(asked.connection, 'close');
});

test('a relative address is not read: an address must be complete', async () => {
  const r = await readUrl('/rooms', local);
  assert.equal(r.ok, false);
  assert.equal(r.code, 'BAD_URL');
});

test('strict mode never connects to this computer, however the address is written', async (t) => {
  const site = await withSite(t, { '/': { body: page('Secret', 'internal') } });
  for (const address of [site.origin, `http://localhost:${site.port}/`, `http://[::1]:${site.port}/`, `http://2130706433:${site.port}/`]) {
    const r = await readUrl(address);
    assert.equal(r.ok, false, address);
    assert.ok(['BLOCKED_ADDRESS', 'BAD_URL'].includes(r.code), `${address}: ${r.code}`);
  }
  assert.equal(site.requests.length, 0, 'the pretend site was never asked');
});

test('a name that points at a private address is refused when the connection is made (DNS rebinding)', async (t) => {
  const site = await withSite(t, { '/': { body: page('Secret', 'internal') } });
  const answer = (addresses) => (host, options, cb) => (typeof options === 'function' ? options : cb)(null, addresses);
  t.after(() => mock.restoreAll());
  for (const addresses of [
    [{ address: '127.0.0.1', family: 4 }],
    [{ address: '10.1.2.3', family: 4 }],
    [{ address: '169.254.169.254', family: 4 }],
    [{ address: '::1', family: 6 }],
    [{ address: '::ffff:127.0.0.1', family: 6 }],
    [{ address: '93.184.216.34', family: 4 }, { address: '127.0.0.1', family: 4 }] // one honest answer next to a private one
  ]) {
    mock.method(dns, 'lookup', answer(addresses));
    const r = await readUrl('http://rebind.example-hotel.com/');
    assert.equal(r.ok, false, JSON.stringify(addresses));
    assert.equal(r.code, 'BLOCKED_ADDRESS', JSON.stringify(addresses));
    mock.restoreAll();
  }
  assert.equal(site.requests.length, 0);
});

test('a name the DNS does not know says so', async (t) => {
  t.after(() => mock.restoreAll());
  mock.method(dns, 'lookup', (host, options, cb) => (typeof options === 'function' ? options : cb)(Object.assign(new Error('nope'), { code: 'ENOTFOUND' })));
  const r = await readUrl('https://no-such-hotel-anywhere.com/');
  assert.equal(r.ok, false);
  assert.equal(r.code, 'DNS_FAILED');
  assert.match(r.message, /could not find the website no-such-hotel-anywhere\.com/);
});

test('a name is resolved by our own lookup, and the Host header keeps the name', async (t) => {
  const site = await withSite(t, { '/': { body: page('Virtual host') } });
  t.after(() => mock.restoreAll());
  mock.method(dns, 'lookup', (host, options, cb) => (typeof options === 'function' ? options : cb)(null, [{ address: '127.0.0.1', family: 4 }]));
  const r = await readUrl(`http://grand-hotel.test:${site.port}/`, local);
  assert.equal(r.ok, true);
  assert.equal(site.requests[0].headers.host, `grand-hotel.test:${site.port}`);
});

test('compressed answers are read (gzip, deflate, brotli) and so are plain ones', async (t) => {
  const text = page('Compressed', '<p>héllo wörld ✓</p>');
  const make = (encoding, encode) => ({ headers: { 'content-encoding': encoding }, body: encode(Buffer.from(text)) });
  const site = await withSite(t, {
    '/gzip': (req, res) => { const b = make('gzip', zlib.gzipSync); res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', ...b.headers }); res.end(b.body); },
    '/deflate': (req, res) => { const b = make('deflate', zlib.deflateSync); res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', ...b.headers }); res.end(b.body); },
    '/br': (req, res) => { const b = make('br', zlib.brotliCompressSync); res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', ...b.headers }); res.end(b.body); },
    '/plain': { body: text },
    '/weird': (req, res) => { res.writeHead(200, { 'content-type': 'text/html', 'content-encoding': 'zstd' }); res.end('x'); },
    '/broken-gzip': (req, res) => { res.writeHead(200, { 'content-type': 'text/html', 'content-encoding': 'gzip' }); res.end('this is not gzip'); }
  });
  for (const path of ['/gzip', '/deflate', '/br', '/plain']) {
    const r = await readUrl(`${site.origin}${path}`, local);
    assert.equal(r.ok, true, path);
    assert.match(r.text, /héllo wörld ✓/, path);
  }
  const weird = await readUrl(`${site.origin}/weird`, local);
  assert.equal(weird.ok, false);
  assert.equal(weird.code, 'BAD_RESPONSE');
  const broken = await readUrl(`${site.origin}/broken-gzip`, local);
  assert.equal(broken.ok, false);
  assert.equal(broken.code, 'BAD_RESPONSE');
});

test('a decompression bomb is cut off at the size limit, quickly and without using the memory', async (t) => {
  const bomb = zlib.gzipSync(Buffer.alloc(80 * 1024 * 1024, 0x61)); // 80 MB of "a" in a few KB
  assert.ok(bomb.length < 200_000);
  const site = await withSite(t, { '/bomb': (req, res) => { res.writeHead(200, { 'content-type': 'text/html', 'content-encoding': 'gzip' }); res.end(bomb); } });
  const started = Date.now();
  const r = await readUrl(`${site.origin}/bomb`, { ...local, maxBytes: 100_000 });
  assert.equal(r.ok, true);
  assert.equal(r.truncated, true);
  assert.equal(r.body.length, 100_000);
  assert.ok(Date.now() - started < 3000);
  const strict = await readUrl(`${site.origin}/bomb`, { ...local, maxBytes: 100_000, truncate: false });
  assert.equal(strict.ok, false);
  assert.equal(strict.code, 'TOO_LARGE');
});

test('a very long page is cut at the limit and the first part is kept', async (t) => {
  const big = page('Big', `<p>${'x'.repeat(READER_LIMITS.maxBytes * 2)}</p>`);
  const site = await withSite(t, { '/big': { body: big } });
  const r = await readUrl(`${site.origin}/big`, local);
  assert.equal(r.ok, true);
  assert.equal(r.truncated, true);
  assert.equal(r.body.length, READER_LIMITS.maxBytes);
  assert.match(r.text, /<title>Big<\/title>/);
});

test('a site that never answers, or answers too slowly, times out in plain words', async (t) => {
  const site = await withSite(t, {
    '/slow': { delayMs: 1500, body: page('Late') },
    '/never': () => {},
    '/trickle': (req, res) => {
      res.writeHead(200, { 'content-type': 'text/html' });
      const timer = setInterval(() => res.write('x'), 50);
      res.on('close', () => clearInterval(timer));
    }
  });
  for (const path of ['/slow', '/never', '/trickle']) {
    const started = Date.now();
    const r = await readUrl(`${site.origin}${path}`, { ...local, timeoutMs: 400 });
    assert.equal(r.ok, false, path);
    assert.equal(r.code, 'TIMEOUT', path);
    assert.match(r.message, /took too long/);
    assert.ok(Date.now() - started < 1500, `${path} took ${Date.now() - started} ms`);
  }
});

test('a closed door and a cut connection', async (t) => {
  const closed = net.createServer().listen(0, '127.0.0.1');
  await new Promise((resolve) => closed.once('listening', resolve));
  const { port } = closed.address();
  await new Promise((resolve) => closed.close(resolve));
  const refused = await readUrl(`http://127.0.0.1:${port}/`, local);
  assert.equal(refused.ok, false);
  assert.equal(refused.code, 'CONNECT_FAILED');

  const site = await withSite(t, {
    '/reset': (req) => req.socket.destroy(),
    '/partial': (req, res) => {
      res.writeHead(200, { 'content-type': 'text/html', 'content-length': '5000' });
      res.write(page('Half a page', 'some text'));
      setTimeout(() => req.socket.destroy(), 30);
    },
    '/garbage': (req) => { req.socket.write('this is not http\r\n\r\n'); req.socket.end(); }
  });
  const reset = await readUrl(`${site.origin}/reset`, local);
  assert.equal(reset.ok, false);
  assert.equal(reset.code, 'CONNECTION_LOST');
  const partial = await readUrl(`${site.origin}/partial`, local);
  assert.equal(partial.ok, true, 'what arrived before the cut is kept');
  assert.match(partial.text, /Half a page/);
  const garbage = await readUrl(`${site.origin}/garbage`, local);
  assert.equal(garbage.ok, false);
  assert.equal(garbage.code, 'BAD_RESPONSE');
});

test('what each answer from a site means', async (t) => {
  const site = await withSite(t, {
    '/404': { status: 404, body: page('Not found') },
    '/410': { status: 410, body: page('Gone') },
    '/403': { status: 403, body: page('Forbidden') },
    '/401': { status: 401, body: 'login' },
    '/429': { status: 429, body: 'slow down' },
    '/500': { status: 500, body: 'oops' },
    '/503': { status: 503, body: 'maintenance' },
    '/418': { status: 418, body: 'teapot' },
    '/cf': { status: 503, headers: { 'cf-mitigated': 'challenge' }, body: page('Just a moment...', '<div id="cf-chl-widget"></div>') }
  });
  const code = async (path) => (await readUrl(`${site.origin}${path}`, local));
  assert.equal((await code('/404')).code, 'NOT_FOUND');
  assert.equal((await code('/410')).code, 'NOT_FOUND');
  const forbidden = await code('/403');
  assert.equal(forbidden.code, 'BLOCKED_BY_SITE');
  assert.equal(forbidden.blocked, true);
  assert.match(forbidden.message, /paste it here instead/);
  assert.equal((await code('/401')).code, 'BLOCKED_BY_SITE');
  assert.equal((await code('/429')).code, 'RATE_LIMITED');
  assert.equal((await code('/500')).code, 'SITE_ERROR');
  assert.equal((await code('/503')).code, 'SITE_ERROR');
  assert.equal((await code('/418')).code, 'HTTP_ERROR');
  assert.equal((await code('/cf')).code, 'BLOCKED_BY_SITE');
  for (const path of ['/404', '/403', '/429', '/500', '/418']) assert.equal((await code(path)).ok, false);
});

test('a "prove you are human" page that answers 200 is reported as blocked, not read as the hotel', async (t) => {
  const real = page('Hotel Orchid', `<h1>Hotel Orchid</h1><p>${'A calm hotel by the lake with large rooms. '.repeat(40)}</p><form><div class="g-recaptcha"></div></form>`);
  const wall = page('Just a moment...', '<p>Checking your browser before accessing hotel-orchid.com</p><script src="/cdn-cgi/challenge-platform/h/g/orchestrate/jsch/v1"></script>');
  const wall2 = page('Hotel', '<p>Please verify you are human</p><div class="px-captcha"></div>');
  const site = await withSite(t, { '/real': { body: real }, '/wall': { body: wall }, '/wall2': { body: wall2 } });
  assert.equal((await readUrl(`${site.origin}/real`, local)).blocked, false, 'a contact form with a captcha is not a block page');
  assert.equal((await readUrl(`${site.origin}/wall`, local)).blocked, true);
  assert.equal((await readUrl(`${site.origin}/wall2`, local)).blocked, true);
});

test('looksBlocked', () => {
  assert.equal(looksBlocked({ status: 403 }), true);
  assert.equal(looksBlocked({ status: 401 }), true);
  assert.equal(looksBlocked({ status: 451 }), true);
  assert.equal(looksBlocked({ status: 200, headers: { 'cf-mitigated': 'challenge' } }), true);
  assert.equal(looksBlocked({ status: 200, text: '<title>Access Denied</title>' }), true);
  assert.equal(looksBlocked({ status: 200, text: '<title>Attention Required! | Cloudflare</title>' }), true);
  assert.equal(looksBlocked({ status: 200, text: '<title>Pardon Our Interruption</title>' }), true);
  assert.equal(looksBlocked({ status: 200, text: '<title>Hotel</title><p>' + 'room '.repeat(2000) + '</p> challenge-platform' }), false);
  assert.equal(looksBlocked({ status: 200, text: '<title>Taj</title><h1>Welcome</h1>' }), false);
  assert.equal(looksBlocked({ status: 200, text: '' }), false);
  assert.equal(looksBlocked({ status: 200 }), false);
});

test('what kind of thing was found', async (t) => {
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj');
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(100)]);
  const site = await withSite(t, {
    '/pdf': { headers: { 'content-type': 'application/pdf' }, body: pdf },
    '/octet-pdf': { headers: { 'content-type': 'application/octet-stream' }, body: pdf },
    '/jpg': { headers: { 'content-type': 'image/jpeg' }, body: jpeg },
    '/gif': { headers: { 'content-type': 'image/gif' }, body: 'GIF89a' },
    '/svg': { headers: { 'content-type': 'image/svg+xml' }, body: '<svg/>' },
    '/json': { headers: { 'content-type': 'application/json' }, body: '{"a":1}' },
    '/untyped-html': (req, res) => { res.writeHead(200); res.end('  <!DOCTYPE html><html><body>hi</body></html>'); },
    '/untyped-jpeg': (req, res) => { res.writeHead(200); res.end(jpeg); },
    '/zip': { headers: { 'content-type': 'application/zip' }, body: 'PK' },
    '/text': { headers: { 'content-type': 'text/plain' }, body: 'plain words' }
  });
  const read = (path, accept) => readUrl(`${site.origin}${path}`, { ...local, accept });
  for (const path of ['/pdf', '/octet-pdf', '/jpg', '/gif', '/svg', '/json', '/zip', '/text']) {
    const r = await read(path);
    assert.equal(r.ok, false, path);
    assert.equal(r.code, 'NOT_A_PAGE', path);
    assert.match(r.message, /cannot be read as a hotel website/);
  }
  assert.match((await read('/pdf')).message, /PDF/);
  assert.equal((await read('/untyped-html')).kind, 'html');
  assert.equal((await read('/untyped-jpeg', ['image'])).kind, 'image');
  assert.equal((await read('/jpg', ['image'])).ok, true);
  assert.equal((await read('/gif', ['image'])).ok, false, 'only JPEG, PNG and WebP pictures are taken');
  assert.equal((await read('/svg', ['image'])).ok, false, 'an SVG can carry script and is never taken');
  assert.equal((await read('/json', ['json'])).ok, true);
  assert.equal((await read('/text', ['text', 'html'])).ok, true);
});

test('the page is decoded with the right character set', async (t) => {
  const latin = Buffer.from('<html><head><title>Caf\xe9 H\xf4tel</title></head></html>', 'latin1');
  const bom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('<title>Hôtel ✓</title>')]);
  const site = await withSite(t, {
    '/latin-header': { headers: { 'content-type': 'text/html; charset=ISO-8859-1' }, body: latin },
    '/latin-meta': { headers: { 'content-type': 'text/html' }, body: Buffer.concat([Buffer.from('<html><head><meta charset="windows-1252">'), Buffer.from('<title>Caf\xe9</title>', 'latin1')]) },
    '/latin-http-equiv': { headers: { 'content-type': 'text/html' }, body: Buffer.concat([Buffer.from('<meta http-equiv="Content-Type" content="text/html; charset=iso-8859-1">'), Buffer.from('<title>Caf\xe9</title>', 'latin1')]) },
    '/bom': { headers: { 'content-type': 'text/html; charset=iso-8859-1' }, body: bom },
    '/bad-label': { headers: { 'content-type': 'text/html; charset=klingon' }, body: Buffer.from('<title>Hôtel</title>') }
  });
  const text = async (path) => (await readUrl(`${site.origin}${path}`, local)).text;
  assert.match(await text('/latin-header'), /Café Hôtel/);
  assert.match(await text('/latin-meta'), /<title>Café<\/title>/);
  assert.match(await text('/latin-http-equiv'), /<title>Café<\/title>/);
  assert.match(await text('/bom'), /Hôtel ✓/);
  assert.match(await text('/bad-label'), /Hôtel/);
});

test('redirects are followed, re-checked and counted', async (t) => {
  let site;
  site = await withSite(t, {
    '/start': { status: 302, headers: { location: '/middle' } },
    '/middle': { status: 301, headers: { location: 'final?x=1' } },
    '/final': { body: page('Arrived') },
    '/loop-a': { status: 302, headers: { location: '/loop-b' } },
    '/loop-b': { status: 302, headers: { location: '/loop-a' } },
    '/bad-location': { status: 302, headers: { location: 'http://[::bad' } },
    '/to-file': { status: 302, headers: { location: 'file:///etc/passwd' } },
    '/to-js': { status: 302, headers: { location: 'javascript:alert(1)' } },
    '/hop1': { status: 302, headers: { location: '/hop2' } },
    '/hop2': { status: 302, headers: { location: '/hop3' } },
    '/hop3': { status: 302, headers: { location: '/final' } }
  });
  const arrived = await readUrl(`${site.origin}/start`, local);
  assert.equal(arrived.ok, true);
  assert.equal(arrived.url, `${site.origin}/final?x=1`);
  assert.deepEqual(arrived.redirects, [`${site.origin}/start`, `${site.origin}/middle`]);
  const loop = await readUrl(`${site.origin}/loop-a`, local);
  assert.equal(loop.ok, false);
  assert.equal(loop.code, 'TOO_MANY_REDIRECTS');
  assert.equal((await readUrl(`${site.origin}/hop1`, { ...local, maxRedirects: 2 })).code, 'TOO_MANY_REDIRECTS');
  assert.equal((await readUrl(`${site.origin}/hop1`, { ...local, maxRedirects: 3 })).ok, true);
  for (const path of ['/bad-location', '/to-file', '/to-js']) assert.equal((await readUrl(`${site.origin}${path}`, local)).code, 'BAD_RESPONSE', path);
});

test('a redirect to a private or reserved address is never followed', async () => {
  for (const target of ['http://127.0.0.1/admin', 'http://169.254.169.254/latest/meta-data/', 'http://localhost:6379/', 'http://10.0.0.1/', 'http://[::1]/', 'http://192.168.1.1/router', 'http://internal.corp/']) {
    const { transport, calls } = scripted([{ status: 302, headers: {}, location: target }, html('<title>secret</title>')]);
    const r = await readUrl('https://www.example-hotel.com/', { transport });
    assert.equal(r.ok, false, target);
    assert.equal(r.code, 'BLOCKED_ADDRESS', target);
    assert.equal(calls.length, 1, `${target}: only the first address was ever asked for`);
  }
});

test('cookies set while redirecting are sent back to the same site only', async (t) => {
  const site = await withSite(t, {
    '/enter': (req, res) => { res.writeHead(302, { location: '/inside', 'set-cookie': ['visit=ok; Path=/; HttpOnly', 'lang=en'] }); res.end(); },
    '/inside': (req, res) => {
      if (!/visit=ok/.test(req.headers.cookie || '') || !/lang=en/.test(req.headers.cookie || '')) { res.writeHead(302, { location: '/enter' }); return res.end(); }
      res.writeHead(200, { 'content-type': 'text/html' });
      return res.end(page('Inside'));
    }
  });
  const r = await readUrl(`${site.origin}/enter`, local);
  assert.equal(r.ok, true);
  assert.match(r.text, /Inside/);
});

test('the total time covers every redirect, not each one', async (t) => {
  const site = await withSite(t, {
    '/a': { status: 302, headers: { location: '/b' }, delayMs: 250 },
    '/b': { status: 302, headers: { location: '/c' }, delayMs: 250 },
    '/c': { body: page('Done'), delayMs: 250 }
  });
  const slow = await readUrl(`${site.origin}/a`, { ...local, timeoutMs: 500 });
  assert.equal(slow.ok, false);
  assert.equal(slow.code, 'TIMEOUT');
  assert.equal((await readUrl(`${site.origin}/a`, { ...local, timeoutMs: 3000 })).ok, true);
});

test('every kind of failure is said in plain words', async () => {
  const cases = [
    ['EBLOCKED', 'BLOCKED_ADDRESS'], ['ENOTFOUND', 'DNS_FAILED'], ['EAI_AGAIN', 'DNS_FAILED'], ['ECONNREFUSED', 'CONNECT_FAILED'], ['ETIMEDOUT', 'TIMEOUT'], ['ETIMEDOUT_TOTAL', 'TIMEOUT'],
    ['CERT_HAS_EXPIRED', 'TLS_ERROR'], ['DEPTH_ZERO_SELF_SIGNED_CERT', 'TLS_ERROR'], ['ERR_TLS_CERT_ALTNAME_INVALID', 'TLS_ERROR'], ['UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'TLS_ERROR'], ['ERR_SSL_WRONG_VERSION_NUMBER', 'TLS_ERROR'],
    ['ECONNRESET', 'CONNECTION_LOST'], ['EPIPE', 'CONNECTION_LOST'], ['Z_DATA_ERROR', 'BAD_RESPONSE'], ['HPE_INVALID_CONSTANT', 'BAD_RESPONSE'], ['ETOOLARGE', 'TOO_LARGE'], ['SOMETHING_NEW', 'CONNECT_FAILED']
  ];
  for (const [code, expected] of cases) {
    const { transport } = scripted([codeError(code)]);
    const r = await readUrl('https://www.example-hotel.com/', { transport });
    assert.equal(r.ok, false, code);
    assert.equal(r.code, expected, code);
    assert.ok(r.message.length > 20, code);
    assert.doesNotMatch(r.message, /\bE[A-Z]{3,}|CERT_|ERR_/, `${code}: the message must not show a technical code (${r.message})`);
  }
});

test('property: whatever a site answers, the result is one of two shapes and nothing throws', async () => {
  const answer = fc.record({
    status: fc.oneof(fc.constantFrom(0, 100, 200, 204, 301, 302, 304, 400, 401, 403, 404, 410, 418, 429, 500, 502, 503, 999), fc.integer({ min: 0, max: 999 })),
    headers: fc.record({ 'content-type': fc.oneof(fc.constant(undefined), fc.constantFrom('text/html', 'text/html; charset=utf-8', 'application/pdf', 'image/png', 'application/json', 'text/plain', 'x/y', '', 'text/html; charset=nope')) }, { requiredKeys: [] }),
    body: fc.oneof(fc.uint8Array({ maxLength: 400 }).map((a) => Buffer.from(a)), fc.string().map((s) => Buffer.from(s))),
    location: fc.oneof(fc.constant(undefined), fc.constant(undefined), fc.string({ maxLength: 60 }), fc.webUrl())
  });
  await fc.assert(
    fc.asyncProperty(fc.array(answer, { minLength: 1, maxLength: 4 }), async (answers) => {
      const cleaned = answers.map((a) => ({ ...a, headers: Object.fromEntries(Object.entries(a.headers).filter(([, v]) => v !== undefined)), location: a.status >= 300 && a.status < 400 ? a.location : undefined }));
      const { transport } = scripted(cleaned);
      const r = await readUrl('https://www.example-hotel.com/', { transport, accept: ['html', 'json', 'text', 'xml', 'image', 'other'] });
      assert.equal(typeof r.ok, 'boolean');
      if (r.ok) {
        assert.ok(Buffer.isBuffer(r.body));
        assert.equal(typeof r.text, 'string');
        assert.ok(r.status >= 200 && r.status < 300);
      } else {
        assert.equal(typeof r.code, 'string');
        assert.equal(typeof r.message, 'string');
        assert.ok(r.message.length > 0);
      }
    }),
    { numRuns: 400 }
  );
});
