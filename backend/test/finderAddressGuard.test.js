import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import fc from 'fast-check';
import { ADDRESS_LIMITS, blockedAddressReason, hostnameProblem, parseTarget, siteOf, v6ToBigInt } from '../src/services/hotelFinder/addressGuard.js';

// What the hotel finder may reach: only public web sites. Every way of spelling a private address must be refused.

const refused = (input, code) => {
  const r = parseTarget(input);
  assert.equal(r.ok, false, `${JSON.stringify(input)} should be refused, got ${JSON.stringify(r)}`);
  assert.equal(typeof r.message, 'string');
  assert.ok(r.message.length > 10);
  if (code) assert.equal(r.code, code, `${JSON.stringify(input)}: ${r.message}`);
  return r;
};

test('ordinary hotel addresses are accepted and tidied', () => {
  const cases = [
    ['example-hotel.com', 'https://example-hotel.com/'],
    ['www.example-hotel.com/rooms?lang=en#top', 'https://www.example-hotel.com/rooms?lang=en'],
    ['HTTPS://Grand-Hotel.COM/Rooms', 'https://grand-hotel.com/Rooms'],
    ['  http://hotel.co.in  ', 'http://hotel.co.in/'],
    ['//hotel.com/x', 'https://hotel.com/x'],
    ['https://hotel.com:443/', 'https://hotel.com/'],
    ['hotel.com:443/x', 'https://hotel.com/x'],
    ['https://bücher-hotel.de/', 'https://xn--bcher-hotel-thb.de/'],
    ['https://hotel.com/path with-nothing'.replace(' ', '%20'), 'https://hotel.com/path%20with-nothing']
  ];
  for (const [input, expected] of cases) {
    const r = parseTarget(input);
    assert.equal(r.ok, true, `${input}: ${r.message}`);
    assert.equal(r.url, expected);
  }
});

test('nothing, or not text, asks for an address', () => {
  for (const value of ['', '   ', '\n\t', undefined, null, 5, {}, [], true]) {
    const r = refused(value, 'BAD_URL');
    assert.match(r.message, /website address/i);
  }
});

test('other kinds of address are refused: only http and https can be read', () => {
  for (const value of ['javascript:alert(1)', 'JAVASCRIPT:alert(1)', 'file:///etc/passwd', 'ftp://hotel.com/x', 'data:text/html,<h1>x</h1>', 'mailto:a@b.com', 'tel:+911234567890', 'blob:https://x.com/1', 'about:blank', 'view-source:https://hotel.com', 'ws://hotel.com', 'gopher://hotel.com', 'ssh://hotel.com', 'smb://hotel.com/share']) {
    refused(value, 'BAD_URL');
  }
});

test('addresses that point inside a network are refused, in every spelling', () => {
  const inside = [
    'http://localhost', 'http://localhost:3000', 'http://LOCALHOST/', 'http://localhost./', 'http://app.localhost',
    'http://127.0.0.1', 'http://127.1', 'http://127.0.1', 'http://0x7f000001', 'http://0x7f.0.0.1', 'http://2130706433', 'http://017700000001', 'http://0177.0.0.1',
    'http://0.0.0.0', 'http://0', 'http://[::]', 'http://[::1]', 'http://[0:0:0:0:0:0:0:1]', 'http://[::ffff:127.0.0.1]', 'http://[::ffff:7f00:1]', 'http://[::ffff:10.0.0.1]',
    'http://10.0.0.5', 'http://10.255.255.255', 'http://172.16.0.1', 'http://172.31.255.255', 'http://192.168.1.1', 'http://192.168.0.1:8080',
    'http://169.254.169.254', 'http://169.254.169.254/latest/meta-data/', 'http://[fd00:ec2::254]', 'http://[fe80::1]', 'http://[fc00::1]',
    'http://100.64.0.1', 'http://224.0.0.1', 'http://255.255.255.255', 'http://[64:ff9b::7f00:1]', 'http://[2002:7f00:1::]',
    'http://metadata.google.internal', 'http://printer.local', 'http://router.lan', 'http://nas.home.arpa', 'http://db.corp', 'http://wiki.intranet', 'http://thing.test', 'http://x.invalid'
  ];
  for (const value of inside) refused(value, 'BLOCKED_ADDRESS');
});

test('a public number address, a single-word name and odd names are refused with a clear reason', () => {
  refused('http://93.184.216.34/', 'BAD_URL'); // allowed network, but hotels have names
  refused('http://intranet', 'BAD_URL');
  refused('http://hotel', 'BAD_URL');
  refused('https://ho_tel.com/', 'BAD_URL');
  refused('https://-hotel.com/', 'BAD_URL');
  refused(`https://${'a'.repeat(64)}.com/`, 'BAD_URL');
  refused('https://hotel..com/', 'BAD_URL');
});

test('only part of an address is refused (a path with no site)', () => {
  for (const value of ['/rooms', '/', '\\\\server\\share', '\\rooms', '/etc/passwd']) refused(value, 'BAD_URL');
  assert.equal(parseTarget('//hotel.com/rooms').url, 'https://hotel.com/rooms');
  assert.equal(parseTarget('/rooms', { allowPrivate: true }).ok, false);
});

test('user names and passwords, special ports, spaces and hidden characters are refused', () => {
  refused('http://user:pw@hotel.com/', 'BAD_URL');
  refused('http://admin@hotel.com/', 'BAD_URL');
  refused('http://hotel.com:8080/', 'BAD_URL');
  refused('http://hotel.com:22/', 'BAD_URL');
  refused('https://hotel.com:6379/', 'BAD_URL');
  refused('hotel.com another-hotel.com', 'BAD_URL');
  refused('https://hotel.com/a\nb', 'BAD_URL');
  refused('https://hotel.com/\u0000', 'BAD_URL');
  refused('https://hotel.com/a\u007fb', 'BAD_URL');
  refused(`https://hotel.com/${'a'.repeat(ADDRESS_LIMITS.urlLength)}`, 'BAD_URL');
});

test('a tricky address that a browser reads one way and a naive check another is judged by what the browser would read', () => {
  // The part before @ is a user name; the real host is after it.
  refused('http://hotel.com@127.0.0.1/', 'BAD_URL');
  refused('http://hotel.com:80@169.254.169.254/', 'BAD_URL');
  // A backslash is a slash to the address parser: the host is 127.0.0.1.
  refused('http://127.0.0.1\\@hotel.com/', 'BLOCKED_ADDRESS');
  // (the part after a backslash is only the path, so this one is just hotel.com)
  assert.equal(parseTarget('http://hotel.com\\.127.0.0.1/').host, 'hotel.com');
  // Encoded dots and full-width digits are decoded by the parser before the host is judged.
  refused('http://127%2e0%2e0%2e1/', 'BLOCKED_ADDRESS');
  refused('http://１２７.０.０.１/', 'BLOCKED_ADDRESS');
});

test('the program\'s own tests and local development may reach this computer, and only when asked to', () => {
  assert.equal(parseTarget('http://127.0.0.1:4567/x', { allowPrivate: true }).ok, true);
  assert.equal(parseTarget('http://localhost:4567/x', { allowPrivate: true }).ok, true);
  assert.equal(parseTarget('http://hotel.test/', { allowPrivate: true }).ok, true);
  assert.equal(parseTarget('http://127.0.0.1:4567/x').ok, false);
  // even then, what is not a web address stays refused
  assert.equal(parseTarget('file:///etc/passwd', { allowPrivate: true }).ok, false);
  assert.equal(parseTarget('http://user:pw@localhost/', { allowPrivate: true }).ok, false);
});

test('blockedAddressReason: the edges of every blocked range', () => {
  const blocked = ['0.0.0.1', '0.255.255.255', '10.0.0.0', '10.255.255.255', '100.64.0.0', '100.127.255.255', '127.0.0.0', '127.255.255.255', '169.254.0.0', '169.254.255.255', '172.16.0.0', '172.31.255.255', '192.0.0.0', '192.0.2.255', '192.168.0.0', '192.168.255.255', '198.18.0.0', '198.19.255.255', '198.51.100.7', '203.0.113.9', '224.0.0.0', '239.255.255.255', '240.0.0.0', '255.255.255.254', '255.255.255.255'];
  const open = ['1.1.1.1', '8.8.8.8', '9.255.255.255', '11.0.0.0', '100.63.255.255', '100.128.0.0', '126.255.255.255', '128.0.0.0', '169.253.255.255', '169.255.0.0', '172.15.255.255', '172.32.0.0', '192.0.1.1', '192.167.255.255', '192.169.0.0', '198.17.255.255', '198.20.0.0', '93.184.216.34', '223.255.255.255'];
  for (const ip of blocked) assert.ok(blockedAddressReason(ip), `${ip} should be blocked`);
  for (const ip of open) assert.equal(blockedAddressReason(ip), null, `${ip} should be allowed`);
});

test('blockedAddressReason: IPv6, including addresses that carry an IPv4 address', () => {
  const blocked = ['::', '::1', '::2', 'fe80::1', 'febf:ffff::1', 'fc00::', 'fd12:3456:789a::1', 'fdff:ffff::1', 'fec0::1', 'ff02::1', 'ff00::', '2001:db8::1', '2001::1', '100::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:10.1.2.3', '::ffff:192.168.0.1', '::ffff:a9fe:a9fe', '64:ff9b::7f00:1', '64:ff9b::a00:1', '2002:7f00:1::', '2002:a00:1::1', '2002:c0a8:101::', '64:ff9b:1::1'];
  const open = ['2606:4700:4700::1111', '2001:4860:4860::8888', '2a00:1450:4001:81b::200e', '::ffff:8.8.8.8', '::ffff:93.184.216.34', '64:ff9b::808:808', '2002:808:808::1'];
  for (const ip of blocked) assert.ok(blockedAddressReason(ip), `${ip} should be blocked`);
  for (const ip of open) assert.equal(blockedAddressReason(ip), null, `${ip} should be allowed`);
  assert.equal(blockedAddressReason('not an address'), 'not a valid address');
  assert.equal(blockedAddressReason('fe80::1%eth0'), 'not a valid address'); // a zone id is never accepted
});

test('v6ToBigInt reads every legal spelling the same way and refuses the rest', () => {
  assert.equal(v6ToBigInt('::'), 0n);
  assert.equal(v6ToBigInt('::1'), 1n);
  assert.equal(v6ToBigInt('0:0:0:0:0:0:0:1'), 1n);
  assert.equal(v6ToBigInt('0000:0000:0000:0000:0000:0000:0000:0001'), 1n);
  assert.equal(v6ToBigInt('1::'), 1n << 112n);
  assert.equal(v6ToBigInt('::ffff:1.2.3.4'), 0xffff01020304n);
  assert.equal(v6ToBigInt('::FFFF:0102:0304'), 0xffff01020304n);
  assert.equal(v6ToBigInt('2001:db8::8a2e:370:7334'), BigInt('0x20010db8000000000000' + '8a2e03707334'));
  assert.equal(v6ToBigInt('2001:0db8:0000:0000:0000:8a2e:0370:7334'), v6ToBigInt('2001:db8::8a2e:370:7334'));
  for (const bad of ['', ':::', '1:2:3:4:5:6:7:8:9', '12345::', 'g::1', '::1::2', '1.2.3.4', '::1.2.3', '::256.1.1.1', 'fe80::1%1', null, 5]) assert.equal(v6ToBigInt(bad), null, String(bad));
});

test('hostnameProblem', () => {
  assert.equal(hostnameProblem('www.hotel.com'), null);
  assert.equal(hostnameProblem('xn--bcher-hotel-zhb.de'), null);
  assert.equal(hostnameProblem('HOTEL.CO.IN.'), null);
  assert.equal(hostnameProblem(''), 'empty');
  assert.equal(hostnameProblem('localhost'), 'local name');
  assert.equal(hostnameProblem('a.b.local'), 'local name');
  assert.equal(hostnameProblem('single'), 'no dot');
  assert.equal(hostnameProblem('1.2.3'), 'number');
  assert.equal(hostnameProblem('0x7f.0x1'), 'number');
});

test('siteOf: the same site with or without www', () => {
  assert.equal(siteOf('https://www.Hotel.com/a'), 'hotel.com');
  assert.equal(siteOf('https://hotel.com/b'), 'hotel.com');
  assert.equal(siteOf('hotel.com'), 'hotel.com');
  assert.equal(siteOf('www.hotel.com'), 'hotel.com');
  assert.equal(siteOf('https://shop.hotel.com/'), 'shop.hotel.com');
  assert.equal(siteOf('not a url/at all'), '');
});

// ---- property tests ----

const octet = fc.integer({ min: 0, max: 255 });
const privateIp = fc.oneof(
  fc.tuple(octet, octet, octet).map(([a, b, c]) => [10, a, b, c]),
  fc.tuple(octet, octet, octet).map(([a, b, c]) => [127, a, b, c]),
  fc.tuple(octet, octet).map(([a, b]) => [192, 168, a, b]),
  fc.tuple(fc.integer({ min: 16, max: 31 }), octet, octet).map(([a, b, c]) => [172, a, b, c]),
  fc.tuple(octet, octet).map(([a, b]) => [169, 254, a, b]),
  fc.tuple(fc.integer({ min: 64, max: 127 }), octet, octet).map(([a, b, c]) => [100, a, b, c]),
  fc.tuple(octet, octet, octet).map(([a, b, c]) => [0, a, b, c])
);
const spellings = (parts) => {
  const n = parts.reduce((acc, p) => acc * 256 + p, 0);
  return [
    parts.join('.'),
    String(n),
    `0x${n.toString(16)}`,
    parts.map((p) => `0${p.toString(8)}`).join('.'),
    parts.map((p) => `0x${p.toString(16)}`).join('.'),
    `[::ffff:${parts.join('.')}]`,
    `[::ffff:${((parts[0] << 8) | parts[1]).toString(16)}:${((parts[2] << 8) | parts[3]).toString(16)}]`
  ];
};

test('property: a private IPv4 address is refused however it is written', () => {
  fc.assert(
    fc.property(privateIp, fc.integer({ min: 0, max: 6 }), fc.constantFrom('http', 'https'), fc.constantFrom('', '/', '/a/b?c=d'), (parts, which, scheme, tail) => {
      const input = `${scheme}://${spellings(parts)[which]}${tail}`;
      const r = parseTarget(input);
      assert.equal(r.ok, false, input);
    }),
    { numRuns: 600 }
  );
});

test('property: parseTarget never throws, and anything it accepts is a plain public web address', () => {
  fc.assert(
    fc.property(fc.oneof(fc.string(), fc.webUrl(), fc.domain().map((d) => `${d}/x`), fc.string().map((s) => `http://${s}`)), (input) => {
      const r = parseTarget(input);
      assert.equal(typeof r.ok, 'boolean');
      if (r.ok) {
        const url = new URL(r.url);
        assert.ok(['http:', 'https:'].includes(url.protocol));
        assert.equal(url.username, '');
        assert.equal(url.password, '');
        assert.equal(url.hash, '');
        assert.equal(hostnameProblem(url.hostname), null);
        assert.equal(net.isIP(url.hostname.replace(/^\[|\]$/g, '')), 0, 'a number address is never accepted');
      } else {
        assert.equal(typeof r.message, 'string');
        assert.ok(r.message.length > 0);
      }
    }),
    { numRuns: 1500 }
  );
});

test('property: an address inside a blocked IPv6 range is blocked, one outside every range is not', () => {
  const hex = (n) => n.toString(16);
  fc.assert(
    fc.property(fc.array(fc.integer({ min: 0, max: 0xffff }), { minLength: 6, maxLength: 6 }), (tail) => {
      const t = tail.map(hex).join(':');
      assert.ok(blockedAddressReason(`fe80:${t}:1`) !== null || false, 'link-local');
      assert.ok(blockedAddressReason(`fd00:${t}:1`) !== null, 'unique local');
      assert.ok(blockedAddressReason(`ff0e:${t}:1`) !== null, 'multicast');
      // a global address (2600::/12 is ordinary public space) is allowed
      assert.equal(blockedAddressReason(`2606:${t}:1`), null);
    }),
    { numRuns: 400 }
  );
});
