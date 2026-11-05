// The details kept for a future client, checked in plain words. Pure logic (no database) so every rule can be tested.
import { line } from './itineraryInput.js';

export const CLIENT_LIMITS = { name: 100, phone: 30, email: 254, destination: 100, expectedTravel: 60, budget: 40, source: 40, notes: 1000 };

const PHONE = /^\+?[0-9][0-9 ().-]{4,28}$/;
const EMAIL = /^[^\s@,;]+@[^\s@,;.]+(\.[^\s@,;.]+)+$/;

/**
 * @param {object} body what the client sent
 * @param {{ partial?: boolean }} [options] with `partial` only the keys present are checked and returned (an update)
 * @returns {{ ok: true, data: object } | { ok: false, message: string }}
 */
export const normalizeFutureClient = (body, { partial = false } = {}) => {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return { ok: false, message: 'The client details must be a set of fields.' };
  const L = CLIENT_LIMITS;
  const data = {};
  const take = (key, label, max, options) => {
    if (body[key] === undefined && partial) return null;
    const r = line(body[key], label, max, options);
    if (!r.ok) return r;
    data[key] = r.value;
    return null;
  };
  const checks = [
    take('name', 'the name of the client', L.name, { required: true }),
    take('phone', 'the phone number', L.phone),
    take('email', 'the e-mail address', L.email),
    take('destination', 'the destination', L.destination),
    take('expectedTravel', 'when they want to travel', L.expectedTravel),
    take('budget', 'the budget', L.budget),
    take('source', 'where the client came from', L.source),
    take('notes', 'the notes', L.notes)
  ];
  const failed = checks.find((r) => r && !r.ok);
  if (failed) return failed;
  if (data.phone && !PHONE.test(data.phone)) return { ok: false, message: 'The phone number can only have digits, spaces, "+", "-", "(" and ")".' };
  if (data.email && !EMAIL.test(data.email)) return { ok: false, message: 'The e-mail address does not look right. It should be like name@example.com.' };
  return { ok: true, data };
};
