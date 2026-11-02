// Passwords handed out by an Admin: a strong random one on request, and the same rule the server applies (see passwordProblem on the server).

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 72;

// Letters and digits that cannot be mistaken for each other when read out or typed from a note (no 0/O, 1/l/I).
const LOWER = 'abcdefghijkmnpqrstuvwxyz';
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGITS = '23456789';
const SYMBOLS = '-_@#';

const randomBelow = (n) => {
  // rejection sampling: no modulo bias
  const limit = Math.floor(0x100000000 / n) * n;
  const buffer = new Uint32Array(1);
  do crypto.getRandomValues(buffer);
  while (buffer[0] >= limit);
  return buffer[0] % n;
};
const pick = (chars) => chars[randomBelow(chars.length)];

/** A random password with lower case, upper case, a digit and a symbol, easy to read out loud. */
export const generatePassword = (length = 12) => {
  const size = Math.min(MAX_PASSWORD_LENGTH, Math.max(MIN_PASSWORD_LENGTH, length));
  const all = LOWER + UPPER + DIGITS;
  const chars = [pick(LOWER), pick(UPPER), pick(DIGITS), pick(SYMBOLS)];
  while (chars.length < size) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = randomBelow(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
};

/** Why a password cannot be used, in plain words, or null. */
export const passwordProblem = (password, { email = '' } = {}) => {
  if (typeof password !== 'string' || !password) return 'Please enter a password.';
  if (password.length < MIN_PASSWORD_LENGTH) return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (new TextEncoder().encode(password).length > MAX_PASSWORD_LENGTH) return `Password can be at most ${MAX_PASSWORD_LENGTH} characters.`;
  if (password !== password.trim()) return 'The password must not start or end with a space.';
  if (email && password.toLowerCase() === String(email).trim().toLowerCase()) return 'The password must not be the same as the email address.';
  return null;
};
