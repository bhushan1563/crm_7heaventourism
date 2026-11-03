import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns';
import zlib from 'node:zlib';
import { blockedAddressReason, parseTarget } from './addressGuard.js';

// Reads one web page for the hotel finder, safely. It behaves like a polite visitor: an honest user agent, a short time, a size
// cap, no cookies kept beyond one visit. And it never leaves the public internet: the address is checked (addressGuard), the name
// is resolved by OUR lookup at connection time (so a name that answers "public" to a check and "private" to the connection is
// caught), and every redirect is checked again. Nothing here ever throws for a bad site: the result says what went wrong in words.

export const USER_AGENT = 'Mozilla/5.0 (compatible; 7HeavenHotelFinder/1.0; +https://crm.7heaventourism.in)';
export const ROBOTS_TOKEN = '7HeavenHotelFinder';

export const READER_LIMITS = {
  timeoutMs: 8000, // for the whole read of one page, redirects included
  maxBytes: 1_500_000, // of what is kept of one page, after decompression
  maxRedirects: 5
};

const fail = (code, message, extra = {}) => ({ ok: false, code, message, ...extra });

// ---- lookup that refuses non-public addresses ----

const guardedLookup = (allowPrivate) => (hostname, options, callback) => {
  const cb = typeof options === 'function' ? options : callback;
  const opts = typeof options === 'function' ? {} : options || {};
  dns.lookup(hostname, { all: true, verbatim: true }, (error, addresses) => {
    if (error) return cb(error);
    let list = addresses;
    if (opts.family === 4 || opts.family === 6) list = list.filter((a) => a.family === opts.family);
    if (!list.length) return cb(Object.assign(new Error('no address'), { code: 'ENOTFOUND' }));
    // A name that points at even one non-public address is refused outright: it is either a mistake or an attack.
    if (!allowPrivate && list.some((a) => blockedAddressReason(a.address))) return cb(Object.assign(new Error('blocked address'), { code: 'EBLOCKED' }));
    return opts.all ? cb(null, list) : cb(null, list[0].address, list[0].family);
  });
};

// ---- one request ----

const decoderFor = (encoding) => {
  const name = String(encoding || '').toLowerCase().trim();
  if (!name || name === 'identity') return null;
  if (name === 'gzip' || name === 'x-gzip') return zlib.createGunzip();
  if (name === 'deflate') return zlib.createInflate();
  if (name === 'br') return zlib.createBrotliDecompress();
  return undefined; // not understood
};

/**
 * One GET, no redirects followed. Resolves { status, headers, body, truncated, location }; rejects with an Error carrying `code`.
 * The body is cut at maxBytes (after decompression): with `truncate` what was read is kept, otherwise the read fails.
 */
const fetchOnce = (url, { allowPrivate, timeoutMs, maxBytes, truncate, headers }) =>
  new Promise((resolve, reject) => {
    const lib = url.protocol === 'https:' ? https : http;
    let settled = false;
    let timer;
    let request;
    const done = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(value);
    };
    try {
      request = lib.request(
        {
          protocol: url.protocol,
          hostname: url.hostname.replace(/^\[|\]$/g, ''),
          port: url.port || undefined,
          path: `${url.pathname}${url.search}`,
          method: 'GET',
          headers,
          lookup: guardedLookup(allowPrivate),
          agent: false
        },
        (res) => {
          const status = res.statusCode || 0;
          const base = { status, headers: res.headers };
          if (status >= 300 && status < 400 && res.headers.location) {
            res.resume();
            return done(resolve, { ...base, location: String(res.headers.location), body: Buffer.alloc(0), truncated: false });
          }
          const decoder = decoderFor(res.headers['content-encoding']);
          if (decoder === undefined) {
            res.resume();
            return done(reject, Object.assign(new Error('unsupported encoding'), { code: 'EBADENCODING' }));
          }
          const stream = decoder ? res.pipe(decoder) : res;
          const chunks = [];
          let size = 0;
          let truncated = false;
          const finish = () => done(resolve, { ...base, body: Buffer.concat(chunks), truncated });
          stream.on('data', (chunk) => {
            if (settled) return;
            const room = maxBytes - size;
            if (chunk.length > room) {
              if (!truncate) {
                request.destroy();
                return done(reject, Object.assign(new Error('too large'), { code: 'ETOOLARGE' }));
              }
              if (room > 0) chunks.push(chunk.subarray(0, room));
              size = maxBytes;
              truncated = true;
              request.destroy();
              return finish();
            }
            size += chunk.length;
            chunks.push(chunk);
          });
          stream.on('end', finish);
          stream.on('error', (error) => (truncated || size > 0 ? finish() : done(reject, Object.assign(error, { code: error.code || 'EBADBODY' }))));
          res.on('error', (error) => (size > 0 ? finish() : done(reject, error)));
          res.on('aborted', () => (size > 0 ? finish() : done(reject, Object.assign(new Error('connection lost'), { code: 'ECONNRESET' }))));
        }
      );
    } catch (error) {
      return done(reject, Object.assign(error, { code: error.code || 'EBADREQUEST' }));
    }
    request.on('error', (error) => done(reject, error));
    timer = setTimeout(() => {
      request.destroy();
      done(reject, Object.assign(new Error('timed out'), { code: 'ETIMEDOUT_TOTAL' }));
    }, timeoutMs);
    request.end();
  });

// ---- what a failure means, in plain words ----

const TLS_CODES = /^(?:CERT_|DEPTH_ZERO|ERR_TLS|ERR_SSL|UNABLE_TO_VERIFY|SELF_SIGNED|HOSTNAME_MISMATCH|ERR_OSSL)/;

const failureFromError = (error, url) => {
  const code = String(error?.code || '');
  const host = url?.hostname || 'the website';
  if (code === 'EBLOCKED') return fail('BLOCKED_ADDRESS', 'That website points inside a private or reserved network, so it cannot be read.');
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN' || code === 'EAI_NODATA') return fail('DNS_FAILED', `We could not find the website ${host}. Check the spelling of the address.`);
  if (code === 'ECONNREFUSED') return fail('CONNECT_FAILED', `${host} refused the connection. The website may be down.`);
  if (code === 'ETIMEDOUT' || code === 'ETIMEDOUT_TOTAL' || code === 'ESOCKETTIMEDOUT') return fail('TIMEOUT', `${host} took too long to answer. Try again in a minute, or check that the website opens in your browser.`);
  if (code === 'ETOOLARGE') return fail('TOO_LARGE', 'That file is too large to read.');
  if (TLS_CODES.test(code)) return fail('TLS_ERROR', `${host} has a problem with its security certificate (expired, or for another name), so it was not opened.`);
  if (code === 'ECONNRESET' || code === 'EPIPE' || code === 'ERR_STREAM_PREMATURE_CLOSE') return fail('CONNECTION_LOST', `The connection to ${host} was cut off. Try again.`);
  if (code === 'EBADENCODING' || code === 'Z_DATA_ERROR' || code.startsWith('Z_') || code === 'EBADBODY') return fail('BAD_RESPONSE', `${host} sent something that could not be read.`);
  if (code.startsWith('HPE_') || code === 'ERR_INVALID_HTTP_TOKEN' || code === 'ERR_UNESCAPED_CHARACTERS') return fail('BAD_RESPONSE', `${host} did not answer like a website.`);
  return fail('CONNECT_FAILED', `${host} could not be reached.`);
};

// ---- what the answer is ----

const CHALLENGE_TITLES = /<title[^>]*>\s*(?:just a moment|attention required|access denied|pardon our interruption|robot check|are you a robot|human verification|security check|please verify|403 forbidden|request blocked|you have been blocked)/i;
// Markers of a "prove you are not a robot" page, not merely of a page that has a captcha on its contact form.
const CHALLENGE_BODY = /(?:cf-chl|cf_chl_opt|challenge-platform|captcha-delivery|datadome|px-captcha|incapsula incident|request unsuccessful\. incapsula|verify you are (?:a )?human|enable javascript and cookies to continue|checking your browser before accessing)/i;
const visibleLength = (html) => html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/gi, ' ').replace(/\s+/g, ' ').trim().length;

/**
 * Is this the "prove you are not a robot" page, or a flat refusal, instead of the real page? Judged from the status, the headers and
 * the start of the page. The finder does not try to get past such a page: it says so, and offers to read pasted text instead.
 */
export const looksBlocked = ({ status, headers = {}, text = '' }) => {
  const head = String(text).slice(0, 20000);
  if (headers['cf-mitigated'] === 'challenge') return true;
  if (status === 401 || status === 403 || status === 451) return true;
  if (CHALLENGE_TITLES.test(head)) return true;
  // A challenge page has almost nothing to read; a real page that merely mentions one of the markers has plenty.
  return CHALLENGE_BODY.test(head) && visibleLength(head) < 2500;
};

const kindOfType = (contentType, body) => {
  const type = String(contentType || '').split(';')[0].trim().toLowerCase();
  if (type === 'text/html' || type === 'application/xhtml+xml') return 'html';
  if (type === 'application/xml' || type === 'text/xml' || type.endsWith('+xml')) return 'xml';
  if (type === 'application/json' || type === 'text/json' || type.endsWith('+json')) return 'json';
  if (type === 'text/plain') return 'text';
  if (type === 'application/pdf') return 'pdf';
  if (type === 'image/jpeg' || type === 'image/jpg' || type === 'image/png' || type === 'image/webp') return 'image';
  if (type.startsWith('image/')) return 'image-other';
  if (type && type !== 'application/octet-stream') return 'other';
  // No (or no useful) type: look at the first bytes.
  const head = body.subarray(0, 512);
  const lead = head.toString('latin1').replace(/^[\s﻿]+/, '').slice(0, 64).toLowerCase();
  if (head[0] === 0xff && head[1] === 0xd8) return 'image';
  if (head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image';
  if (head.subarray(0, 4).toString('latin1') === 'RIFF' && head.subarray(8, 12).toString('latin1') === 'WEBP') return 'image';
  if (lead.startsWith('%pdf')) return 'pdf';
  if (lead.startsWith('<?xml')) return 'xml';
  if (lead.startsWith('<!doctype html') || lead.startsWith('<html') || lead.startsWith('<head') || lead.startsWith('<body') || lead.startsWith('<!--')) return 'html';
  if (lead.startsWith('{') || lead.startsWith('[')) return 'json';
  return 'other';
};

const KIND_WORDS = { pdf: 'a PDF file', image: 'a picture', 'image-other': 'a picture in a format that cannot be used', json: 'data, not a web page', xml: 'an XML file', text: 'a plain text file', html: 'a web page', other: 'a file that is not a web page' };

const charsetOf = (contentType, body) => {
  const fromHeader = /charset\s*=\s*["']?([\w:.-]+)/i.exec(String(contentType || ''));
  if (fromHeader) return fromHeader[1].toLowerCase();
  const sniff = body.subarray(0, 3000).toString('latin1');
  const meta = /<meta[^>]+charset\s*=\s*["']?\s*([\w:.-]+)/i.exec(sniff) || /<meta[^>]+content\s*=\s*["'][^"']*charset=([\w:.-]+)/i.exec(sniff);
  return meta ? meta[1].toLowerCase() : 'utf-8';
};

export const decodeText = (body, contentType) => {
  let charset = charsetOf(contentType, body);
  if (body[0] === 0xef && body[1] === 0xbb && body[2] === 0xbf) charset = 'utf-8';
  try {
    return new TextDecoder(charset).decode(body);
  } catch {
    return new TextDecoder('utf-8').decode(body);
  }
};

const cookieHeader = (jar, host) => (jar.get(host) ? [...jar.get(host)].map(([k, v]) => `${k}=${v}`).join('; ') : '');
const rememberCookies = (jar, host, setCookie) => {
  if (!setCookie) return;
  const list = Array.isArray(setCookie) ? setCookie : [setCookie];
  const bucket = jar.get(host) || new Map();
  for (const line of list) {
    const pair = String(line).split(';')[0];
    const at = pair.indexOf('=');
    if (at > 0) bucket.set(pair.slice(0, at).trim(), pair.slice(at + 1).trim());
  }
  jar.set(host, bucket);
};

/**
 * Reads one address.
 *
 * @param {string} input what was typed or found (a relative address is not accepted here: resolve it first)
 * @param {object} [options]
 * @param {string[]} [options.accept]   kinds of content wanted: 'html' (default), 'xml', 'json', 'text', 'image'
 * @param {boolean} [options.truncate]  keep the first maxBytes of a longer answer instead of failing (default true)
 * @param {boolean} [options.allowPrivate]  tests and local development only: never set from a request
 * @returns {Promise<{ ok: true, url: string, status: number, kind: string, contentType: string, body: Buffer, text: string, truncated: boolean, redirects: string[], headers: object, blocked: boolean } | { ok: false, code: string, message: string, status?: number, blocked?: boolean }>}
 */
export const readUrl = async (input, options = {}) => {
  // `transport` replaces the real connection in tests (scripted answers, so every rule here can be checked without a network).
  const { accept = ['html'], truncate = true, allowPrivate = false, referer, transport = fetchOnce } = options;
  const timeoutMs = options.timeoutMs ?? READER_LIMITS.timeoutMs;
  const maxBytes = options.maxBytes ?? READER_LIMITS.maxBytes;
  const maxRedirects = options.maxRedirects ?? READER_LIMITS.maxRedirects;
  const parsed = parseTarget(input, { allowPrivate });
  if (!parsed.ok) return parsed;

  const deadline = Date.now() + timeoutMs;
  const jar = new Map();
  const redirects = [];
  let current = new URL(parsed.url);

  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) return failureFromError({ code: 'ETIMEDOUT_TOTAL' }, current);
    const headers = {
      'user-agent': USER_AGENT,
      accept: accept.includes('image') ? 'image/webp,image/jpeg,image/png,*/*;q=0.5' : 'text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.5',
      'accept-language': 'en;q=0.9,*;q=0.5',
      'accept-encoding': 'gzip, deflate, br',
      connection: 'close'
    };
    if (referer && hop === 0) headers.referer = referer;
    const cookie = cookieHeader(jar, current.hostname);
    if (cookie) headers.cookie = cookie;

    let answer;
    try {
      answer = await transport(current, { allowPrivate, timeoutMs: remaining, maxBytes, truncate, headers });
    } catch (error) {
      return failureFromError(error, current);
    }
    rememberCookies(jar, current.hostname, answer.headers['set-cookie']);

    if (answer.location) {
      let next;
      try {
        next = new URL(answer.location, current);
      } catch {
        return fail('BAD_RESPONSE', `${current.hostname} sent us to an address that does not make sense.`);
      }
      const checked = parseTarget(next.href, { allowPrivate });
      if (!checked.ok) {
        return fail(checked.code === 'BLOCKED_ADDRESS' ? 'BLOCKED_ADDRESS' : 'BAD_RESPONSE', checked.code === 'BLOCKED_ADDRESS' ? 'The website tried to send us to a private or reserved network address, so it was not followed.' : `${current.hostname} sent us to an address that cannot be read.`);
      }
      redirects.push(current.href);
      current = new URL(checked.url);
      continue;
    }

    const { status, headers: responseHeaders, body, truncated } = answer;
    const contentType = String(responseHeaders['content-type'] || '');
    const kind = kindOfType(contentType, body);
    const textual = ['html', 'xml', 'json', 'text', 'other'].includes(kind);
    const text = textual ? decodeText(body, contentType) : '';
    const info = { url: current.href, status, kind, contentType, redirects, headers: responseHeaders };

    if (status < 200 || status >= 300) {
      const blocked = looksBlocked({ status, headers: responseHeaders, text });
      if (status === 404 || status === 410) return fail('NOT_FOUND', `${current.hostname} says this page does not exist (error ${status}). Check the address.`, { status });
      if (status === 429) return fail('RATE_LIMITED', `${current.hostname} says too many requests were made. Try again in a few minutes.`, { status });
      if (blocked || status === 401 || status === 403) return fail('BLOCKED_BY_SITE', `${current.hostname} does not allow automatic reading of this page (it answered "${status}"). You can open the page in your browser, copy its text, and paste it here instead.`, { status, blocked: true });
      if (status >= 500) return fail('SITE_ERROR', `${current.hostname} had a problem and could not show the page (error ${status}). Try again later.`, { status });
      return fail('HTTP_ERROR', `${current.hostname} did not show the page (error ${status}).`, { status });
    }

    if (!accept.includes(kind)) {
      return fail('NOT_A_PAGE', `That address is ${KIND_WORDS[kind] || 'not a web page'}, so it cannot be read as a hotel website. Paste the hotel's home page address.`, { status, kind });
    }
    return { ok: true, ...info, body, text, truncated, blocked: kind === 'html' && looksBlocked({ status, headers: responseHeaders, text }) };
  }
  return fail('TOO_MANY_REDIRECTS', `${current.hostname} keeps sending us from one address to another. Try the hotel's home page address.`);
};
