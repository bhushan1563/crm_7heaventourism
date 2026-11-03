import crypto from 'node:crypto';

// A picture the finder found is shown through the app's own address (the page's security rules allow no other sites' pictures), and
// that address carries a signed, short-lived ticket naming exactly one picture address. So the picture route is not an open proxy: it
// only fetches addresses the finder itself found, for an hour, and a ticket cannot be forged or changed without the secret.

export const IMAGE_TICKET_SECONDS = 3600;

const b64 = (buf) => Buffer.from(buf).toString('base64url');
const mac = (payload, secret) => b64(crypto.createHmac('sha256', `finder-image|${secret}`).update(payload).digest().subarray(0, 18));

/** @returns {string} a ticket for one picture address (and the page it came from, sent as the referrer like a browser would) */
export const signImageTicket = ({ url, referer = '' }, secret, now = Date.now()) => {
  const payload = b64(JSON.stringify({ u: url, r: referer, e: Math.floor(now / 1000) + IMAGE_TICKET_SECONDS }));
  return `${payload}.${mac(payload, secret)}`;
};

/** @returns {{ ok: true, url: string, referer: string } | { ok: false, reason: 'malformed' | 'forged' | 'expired' }} */
export const readImageTicket = (ticket, secret, now = Date.now()) => {
  if (typeof ticket !== 'string' || ticket.length > 3000 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(ticket)) return { ok: false, reason: 'malformed' };
  const [payload, tag] = ticket.split('.');
  const expected = mac(payload, secret);
  const a = Buffer.from(tag);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { ok: false, reason: 'forged' };
  let data;
  try {
    data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (typeof data?.u !== 'string' || typeof data?.e !== 'number') return { ok: false, reason: 'malformed' };
  if (data.e * 1000 < now) return { ok: false, reason: 'expired' };
  return { ok: true, url: data.u, referer: typeof data.r === 'string' ? data.r : '' };
};
