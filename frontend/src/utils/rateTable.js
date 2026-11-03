// Editing the rate table of a hotel (the client's sheet). Pure functions (no network, no React) so every rule can be tested.
// The figures themselves (a row's total, a hotel's total, the Grand Total of an option) are in hotelRates.js, the same file the server uses.
import { RATE_KINDS, RATE_LABELS, RATE_LIMITS } from './hotelRates';

/** The rows a hotel can add after the room itself: the client said they are optional ("can be added or may not be"). */
export const OPTIONAL_KINDS = ['extraBed', 'childWithBed', 'childNoBed'];

export const blankRow = (kind) => ({ kind, label: RATE_LABELS[kind], rate: 0, nights: null, rooms: null });

/** What a hotel starts with: the room for 2 adults, nothing else. */
export const startRates = () => [blankRow('room')];

export const hasKind = (rates, kind) => (rates || []).some((row) => row.kind === kind);

/** The optional rows a hotel does not have yet (these are the buttons to offer). */
export const missingKinds = (rates) => OPTIONAL_KINDS.filter((kind) => !hasKind(rates, kind));

const byKind = (a, b) => RATE_KINDS.indexOf(a.kind) - RATE_KINDS.indexOf(b.kind);

/** Adds a row once; the rows always stay in the client's order (room, extra bed, child with bed, child with no bed). */
export const addRateRow = (rates, kind) => {
  const rows = rates || [];
  if (!RATE_KINDS.includes(kind) || hasKind(rows, kind) || rows.length >= RATE_LIMITS.rows) return rows;
  return [...rows, blankRow(kind)].sort(byKind);
};

/** Takes an optional row away. The room row stays: a hotel without it has no rate at all. */
export const removeRateRow = (rates, kind) => (kind === 'room' ? rates : (rates || []).filter((row) => row.kind !== kind));

export const patchRateRow = (rates, kind, patch) => (rates || []).map((row) => (row.kind === kind ? { ...row, ...patch } : row));

/** A rate as typed: an amount with at most two decimals, never negative, never above the limit; nothing typed is 0. */
export const typedRate = (text) => {
  const n = Number(text);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(Math.round(n * 100) / 100, RATE_LIMITS.maxRate);
};

/** Nights or rooms as typed: a whole number up to the limit; nothing typed is null, which means "follow the stay". */
export const typedCount = (text, max) => {
  if (text === '' || text === null || text === undefined) return null;
  const n = Math.floor(Number(text));
  return Number.isFinite(n) ? Math.min(Math.max(n, 0), max) : null;
};
