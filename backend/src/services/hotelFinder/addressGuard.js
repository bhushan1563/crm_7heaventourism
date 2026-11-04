import net from 'node:net';

// What the hotel finder may reach. The server fetches addresses that people type, so every address is checked before anything is
// sent and again for every redirect and every name resolution: only public web sites on the usual ports. Local, private,
// link-local, cloud-metadata and reserved addresses (IPv4 and IPv6, in any spelling) are refused. Pure logic, so it can be
// tested exhaustively (see test/finderAddressGuard.test.js).

export const ADDRESS_LIMITS = { urlLength: 2048, hostLength: 253, labelLength: 63 };

// ---- IP addresses ----

const v4ToInt = (text) => {
  const parts = text.split('.');
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    value = value * 256 + n;
  }
  return value;
};

/** An IPv6 address as a 128-bit number (BigInt), or null when it is not one. Handles "::", an IPv4 tail, and refuses a zone id. */
export const v6ToBigInt = (text) => {
  if (typeof text !== 'string' || !net.isIPv6(text) || text.includes('%')) return null;
  let head = text;
  let tail4 = null;
  const lastColon = text.lastIndexOf(':');
  if (text.includes('.')) {
    tail4 = v4ToInt(text.slice(lastColon + 1));
    if (tail4 === null) return null;
    head = `${text.slice(0, lastColon + 1)}0:0`;
  }
  const halves = head.split('::');
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || missing < 0) return null;
  const groups = [...left, ...Array(halves.length === 2 ? missing : 0).fill('0'), ...right];
  if (groups.length !== 8) return null;
  let value = 0n;
  for (const group of groups) {
    if (!/^[0-9a-f]{1,4}$/i.test(group)) return null;
    value = (value << 16n) | BigInt(parseInt(group, 16));
  }
  if (tail4 !== null) value = (value & ~0xffffffffn) | BigInt(tail4);
  return value;
};

// [network, prefix length, why]
const BLOCKED_V4 = [
  ['0.0.0.0', 8, 'this network'],
  ['10.0.0.0', 8, 'private network'],
  ['100.64.0.0', 10, 'shared address space'],
  ['127.0.0.0', 8, 'this computer'],
  ['169.254.0.0', 16, 'link-local / cloud metadata'],
  ['172.16.0.0', 12, 'private network'],
  ['192.0.0.0', 24, 'reserved'],
  ['192.0.2.0', 24, 'documentation'],
  ['192.88.99.0', 24, 'reserved'],
  ['192.168.0.0', 16, 'private network'],
  ['198.18.0.0', 15, 'benchmarking'],
  ['198.51.100.0', 24, 'documentation'],
  ['203.0.113.0', 24, 'documentation'],
  ['224.0.0.0', 4, 'multicast'],
  ['240.0.0.0', 4, 'reserved'],
  ['255.255.255.255', 32, 'broadcast']
].map(([net4, bits, why]) => [v4ToInt(net4), bits, why]);

const BLOCKED_V6 = [
  ['::', 96, 'unspecified / IPv4-compatible'],
  ['64:ff9b:1::', 48, 'local-use translation'],
  ['100::', 64, 'discard-only'],
  ['2001::', 32, 'Teredo tunnel'],
  ['2001:db8::', 32, 'documentation'],
  ['fc00::', 7, 'private network'],
  ['fe80::', 10, 'link-local'],
  ['fec0::', 10, 'site-local'],
  ['ff00::', 8, 'multicast']
].map(([net6, bits, why]) => [v6ToBigInt(net6), bits, why]);

const inV4 = (value, [base, bits]) => (bits === 0 ? true : Math.floor(value / 2 ** (32 - bits)) === Math.floor(base / 2 ** (32 - bits)));
const inV6 = (value, [base, bits]) => value >> BigInt(128 - bits) === base >> BigInt(128 - bits);

/**
 * Why this IP address may not be reached ("this computer", "private network" ...), or null when it is an ordinary public address.
 * Addresses that merely carry an IPv4 address (::ffff:127.0.0.1, 64:ff9b::7f00:1, 2002:7f00:1::) are judged by the IPv4 address inside.
 */
export const blockedAddressReason = (ip) => {
  if (net.isIPv4(ip)) {
    const value = v4ToInt(ip);
    const hit = BLOCKED_V4.find((range) => inV4(value, range));
    return hit ? hit[2] : null;
  }
  const value = v6ToBigInt(ip);
  if (value === null) return 'not a valid address';
  const embedded = (n) => blockedAddressReason(`${(n >> 24) & 255}.${(n >> 16) & 255}.${(n >> 8) & 255}.${n & 255}`);
  const low32 = Number(value & 0xffffffffn);
  if (value >> 32n === 0xffffn) return embedded(low32); // ::ffff:a.b.c.d (IPv4-mapped)
  if (value >> 32n === 0x0064ff9b0000000000000000n) return embedded(low32); // 64:ff9b::/96 (NAT64)
  if (value >> 112n === 0x2002n) return embedded(Number((value >> 80n) & 0xffffffffn)); // 2002::/16 (6to4)
  const hit = BLOCKED_V6.find((range) => inV6(value, range));
  return hit ? hit[2] : null;
};

// ---- names ----

const LOCAL_SUFFIXES = ['.localhost', '.local', '.internal', '.localdomain', '.lan', '.home', '.home.arpa', '.corp', '.intranet', '.private', '.test', '.invalid', '.example'];

/** Why this host name is not a public web site name, or null. (The names that point at the server's own side of the network.) */
export const hostnameProblem = (host) => {
  const name = String(host || '').toLowerCase().replace(/\.$/, '');
  if (!name) return 'empty';
  if (name.length > ADDRESS_LIMITS.hostLength || name.split('.').some((label) => label.length > ADDRESS_LIMITS.labelLength || label.length === 0 || label.startsWith('-') || label.endsWith('-'))) return 'too long or malformed';
  if (name === 'localhost' || LOCAL_SUFFIXES.some((suffix) => name.endsWith(suffix))) return 'local name';
  if (!name.includes('.')) return 'no dot';
  if (!/^[a-z0-9.-]+$/.test(name)) return 'odd characters';
  if (/^(?:0x[0-9a-f]+|\d+)(?:\.(?:0x[0-9a-f]+|\d+))*$/i.test(name)) return 'number'; // "1.2.3", "0x7f.1": numbers a browser may read as an address
  return null;
};

// ---- the whole address ----

const DANGEROUS_SCHEME = /^(?:javascript|data|file|ftp|ftps|sftp|mailto|tel|sms|blob|about|chrome|view-source|ws|wss|gopher|ldap|dict|telnet|ssh|smb|git):/i;
const ALLOWED_PORTS = new Set(['', '80', '443']);

const fail = (code, message) => ({ ok: false, code, message });

/**
 * Turns what was typed into the address to read, or says in plain words what is wrong.
 * `allowPrivate` is for the program's own tests and local development only (never from a request): it lets "localhost" and other
 * ports through so the reader can be exercised against pretend hotel sites.
 *
 * @returns {{ ok: true, url: string, host: string, origin: string } | { ok: false, code: string, message: string }}
 */
export const parseTarget = (input, { allowPrivate = false } = {}) => {
  if (typeof input !== 'string') return fail('BAD_URL', "Please paste the hotel's website address.");
  const text = input.replace(/^[\s​﻿]+|[\s​﻿]+$/g, '');
  if (!text) return fail('BAD_URL', "Please paste the hotel's website address.");
  if (text.length > ADDRESS_LIMITS.urlLength) return fail('BAD_URL', `That address is too long (the limit is ${ADDRESS_LIMITS.urlLength} characters). Paste the hotel's home page address instead.`);
  // eslint-disable-next-line no-control-regex
  if (/[\s\u0000-\u001f\u007f]/.test(text)) {
    return fail('BAD_URL', 'The address has a space or a hidden character in it. Paste just one web address, for example https://www.example-hotel.com');
  }
  if (DANGEROUS_SCHEME.test(text)) return fail('BAD_URL', 'Only web addresses starting with http:// or https:// can be read.');
  if (/^[/\\]/.test(text) && !text.startsWith('//')) return fail('BAD_URL', "That is only part of an address. Paste the whole address, for example https://www.example-hotel.com/rooms");

  let candidate = text;
  if (candidate.startsWith('//')) candidate = `https:${candidate}`;
  else if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(candidate)) candidate = `https://${candidate}`;

  let url;
  try {
    url = new URL(candidate);
  } catch {
    return fail('BAD_URL', 'That does not look like a web address. Example: https://www.example-hotel.com');
  }
  if (!['http:', 'https:'].includes(url.protocol)) return fail('BAD_URL', 'Only web addresses starting with http:// or https:// can be read.');
  if (url.username || url.password) return fail('BAD_URL', 'Addresses with a user name or password in them are not accepted. Paste the plain web address.');

  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();

  if (net.isIP(host)) {
    if (!allowPrivate) {
      const reason = blockedAddressReason(host);
      return reason
        ? fail('BLOCKED_ADDRESS', 'That address points inside a private or reserved network, so it cannot be read. Paste the hotel\'s public website address.')
        : fail('BAD_URL', 'Please paste the website\'s name (like www.example-hotel.com), not a number address.');
    }
  } else {
    const problem = hostnameProblem(host);
    if (problem && !(allowPrivate && (problem === 'local name' || problem === 'no dot'))) {
      if (problem === 'local name' || problem === 'number') return fail('BLOCKED_ADDRESS', 'That address points inside a private or reserved network, so it cannot be read. Paste the hotel\'s public website address.');
      return fail('BAD_URL', 'The website name does not look right. Example: https://www.example-hotel.com');
    }
  }

  // Ports are judged after the host, so "localhost:3000" is reported as what it is (an address inside a network), not as a port problem.
  if (!allowPrivate && !ALLOWED_PORTS.has(url.port)) return fail('BAD_URL', 'Only normal website addresses (without a special port number) can be read.');

  url.hash = '';
  return { ok: true, url: url.href, host, origin: url.origin };
};

/** The site a page belongs to, for "same site" decisions: the host without a leading "www.". */
export const siteOf = (urlOrHost) => {
  try {
    const host = urlOrHost.includes('/') ? new URL(urlOrHost).hostname : urlOrHost;
    return host.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
};
