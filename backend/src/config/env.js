import crypto from 'crypto';
import dotenv from 'dotenv';

// Reads backend/.env when present (VPS / local). On Vercel the platform injects the variables instead.
dotenv.config();

const isProduction = process.env.NODE_ENV === 'production';

// Values that must never be used to sign tokens (placeholders from .env.example and the old hard-coded fallback).
const KNOWN_WEAK_SECRETS = new Set([
  'change-me-to-a-long-random-string',
  'seven_heaven_jwt_secret_super_key_2026_luxury_travel',
  'secret',
  'changeme'
]);

const list = (value) =>
  String(value || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);

const int = (value, fallback) => {
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

let devSecret;
const resolveJwtSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (secret) return secret;
  if (isProduction) return '';
  // Development only: a per-process random secret (sessions reset on restart) instead of a secret that lives in the source code.
  devSecret = devSecret || crypto.randomBytes(48).toString('hex');
  return devSecret;
};

export const config = {
  isProduction,
  isVercel: Boolean(process.env.VERCEL),
  port: int(process.env.PORT, 5000),
  mongoUri: process.env.MONGODB_URI || '',
  jwtSecret: resolveJwtSecret(),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  // Comma-separated browser origins allowed to call the API cross-origin. Empty = allow any origin (the API uses
  // Bearer tokens, not cookies, so this is not a CSRF risk). Same-origin deployments never need CORS at all.
  corsOrigins: list(process.env.CORS_ORIGINS),
  // Number of reverse proxies in front of the app (Nginx = 1, Vercel = 1), needed for correct client IPs / rate limiting.
  // Defaults to 1 in production and 0 in development, where nothing sits in front and X-Forwarded-For could be spoofed.
  trustProxy: process.env.TRUST_PROXY !== undefined ? Number(process.env.TRUST_PROXY) || 0 : isProduction ? 1 : 0,
  dnsServers: list(process.env.DNS_SERVERS),
  // Optional first-run bootstrap: creates this Admin only when the users collection is empty.
  adminEmail: (process.env.ADMIN_EMAIL || '').trim().toLowerCase(),
  adminPassword: process.env.ADMIN_PASSWORD || ''
};

/**
 * Fails fast on a misconfigured deployment instead of limping along with an insecure default.
 * Returns a list of non-fatal warnings.
 */
export const validateConfig = () => {
  const errors = [];
  const warnings = [];

  if (!config.mongoUri) errors.push('MONGODB_URI is not set.');

  if (!config.jwtSecret) {
    errors.push('JWT_SECRET is not set. Generate one with: openssl rand -hex 48');
  } else if (KNOWN_WEAK_SECRETS.has(config.jwtSecret)) {
    errors.push('JWT_SECRET is a known placeholder value. Generate a real one with: openssl rand -hex 48');
  } else if (config.jwtSecret.length < 32) {
    warnings.push('JWT_SECRET is shorter than 32 characters; use a longer random value.');
  }

  if (!process.env.JWT_SECRET && !config.isProduction) {
    warnings.push('JWT_SECRET is not set - using a temporary random secret; sessions will reset on every restart.');
  }

  if (config.adminEmail && config.adminPassword.length < 8) {
    errors.push('ADMIN_PASSWORD must be at least 8 characters.');
  }

  if (errors.length) {
    const error = new Error(`Invalid configuration:\n - ${errors.join('\n - ')}`);
    error.isConfigError = true;
    throw error;
  }

  return warnings;
};
