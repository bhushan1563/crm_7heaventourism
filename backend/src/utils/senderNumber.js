// The sender number of a person: the WhatsApp / phone number their messages to clients carry. An Admin sets it on the Rights & Security
// screen. Pure logic (no database). The same rules as the "Send" windows of the web app use for a client's number, so what one accepts
// the other accepts: separators are ignored, "+" or "00" in front means the country code is included, ten digits are Indian numbers.

const DEFAULT_COUNTRY = '91';

/**
 * @param {unknown} raw what was typed (nothing at all clears the number)
 * @returns {{ ok: true, value: string } | { ok: false, message: string }} value is "+" and the digits with the country code, or ""
 */
export const normalizeSenderNumber = (raw) => {
  if (raw === undefined || raw === null) return { ok: true, value: '' };
  if (typeof raw !== 'string' && typeof raw !== 'number') return { ok: false, message: 'The sender number must be text.' };
  const text = String(raw).trim();
  if (!text) return { ok: true, value: '' };
  if (text.length > 40) return { ok: false, message: 'The sender number is too long.' };
  if (/[A-Za-z]/.test(text)) return { ok: false, message: 'The sender number can only have digits, spaces, "+" and "-".' };

  let rest = text.replace(/[\s().\- ]/g, '');
  let international = false;
  if (rest.startsWith('+')) {
    international = true;
    rest = rest.slice(1);
  } else if (rest.startsWith('00')) {
    international = true;
    rest = rest.slice(2);
  }
  if (!/^\d+$/.test(rest)) return { ok: false, message: 'The sender number can only have digits, spaces, "+" and "-".' };

  let digits = rest;
  if (international) {
    if (digits.startsWith('0')) return { ok: false, message: 'A country code never starts with 0. Please check the sender number.' };
    if (digits.length < 8) return { ok: false, message: 'The sender number looks too short.' };
  } else {
    if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1); // the 0 in front of an Indian number
    if (digits.startsWith('0')) return { ok: false, message: 'The sender number should not start with 0. Add the country code, for example +91.' };
    if (digits.length < 10) return { ok: false, message: 'The sender number looks too short. Indian numbers have 10 digits; for another country add the country code, for example +971 50 123 4567.' };
    if (digits.length === 10) digits = `${DEFAULT_COUNTRY}${digits}`;
  }
  if (digits.length > 15) return { ok: false, message: 'The sender number looks too long.' };
  return { ok: true, value: `+${digits}` };
};
