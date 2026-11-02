// Small helpers that keep request data from being interpreted as regex syntax or Mongo operators.

/** Escapes a user-supplied string so it matches literally inside a RegExp (prevents regex injection / ReDoS). */
export const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Case-insensitive "contains" RegExp for a user-supplied search term. */
export const containsRegex = (value) => new RegExp(escapeRegex(String(value).trim().slice(0, 100)), 'i');

/**
 * Query-string values can arrive as arrays or objects (`?status[$ne]=x`). Only plain strings are accepted;
 * anything else is dropped, so a filter can never become a Mongo operator.
 */
export const queryString = (value) => (typeof value === 'string' && value.trim() ? value.trim() : undefined);

/** Copies only the listed keys, and only when the client actually sent them. */
export const pick = (source = {}, keys = []) => {
  const out = {};
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(source, key) && source[key] !== undefined) {
      out[key] = source[key];
    }
  }
  return out;
};

/** Copies everything except the listed keys and any `$`-prefixed key (Mongo update operators). */
export const omit = (source = {}, keys = []) => {
  const out = {};
  for (const [key, value] of Object.entries(source)) {
    if (keys.includes(key) || key.startsWith('$')) continue;
    out[key] = value;
  }
  return out;
};

export const ADMIN_ROLES = ['Admin', 'SuperAdmin'];
export const isAdminRole = (role) => ADMIN_ROLES.includes(role);

export const isValidEmail = (value) => typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 72; // bcrypt ignores everything after 72 bytes, so a longer password could not be honoured

/** Why a password cannot be used, in plain words, or null. One rule for creating, editing and resetting a password. */
export const passwordProblem = (password, { email = '' } = {}) => {
  if (typeof password !== 'string' || !password) return 'Please enter a password.';
  if (password.length < MIN_PASSWORD_LENGTH) return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_LENGTH) return `Password can be at most ${MAX_PASSWORD_LENGTH} characters.`;
  if (password !== password.trim()) return 'The password must not start or end with a space.';
  if (email && password.toLowerCase() === String(email).trim().toLowerCase()) return 'The password must not be the same as the email address.';
  return null;
};
