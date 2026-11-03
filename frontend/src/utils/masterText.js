// The standard Notes and Policy texts ("master text"): five lists of lines that a new quotation starts with. An Admin edits them on the
// "Notes & Policies" screen; until one is saved the built-in text (utils/standardText.js) is used. Pure functions (no network, no
// React) so every rule can be tested. The server repeats the checks and cleans formatted text.
import { STANDARD_TEXT } from './standardText';
import { richToPlainText } from './richText';

export const MASTER_LIMITS = { items: 100, text: 1000 };

export const MASTER_SECTIONS = [
  { key: 'importantNotes', title: 'Important notes & terms', noun: 'note', hint: 'Printed on the last page of every quotation, first in the list of terms.', placeholder: 'e.g. All guests must carry a valid photo ID.' },
  { key: 'paymentPolicy', title: 'Payment policy', noun: 'payment line', hint: 'When and how much the client pays.', placeholder: 'e.g. 25% advance at the time of booking.' },
  { key: 'cancellationPolicy', title: 'Cancellation policy', noun: 'cancellation line', hint: 'What is charged when the client cancels.', placeholder: 'e.g. 30 days or more before departure: 10% of the tour cost.' },
  { key: 'exclusions', title: 'Exclusions', noun: 'exclusion', hint: 'What the price does not include.', placeholder: 'e.g. Airfare unless specified.' },
  { key: 'vehicleNotes', title: 'Vehicle notes', noun: 'vehicle note', hint: 'Points about the vehicle on a package. (They are left out of a booking confirmation.)', placeholder: 'e.g. Kilometres are counted garage to garage.' }
];

export const MASTER_KEYS = MASTER_SECTIONS.map((s) => s.key);

const sameList = (a, b) => a.length === b.length && a.every((line, i) => line === b[i]);

/** The five lists in use: the saved ones, and for a list that was not saved the built-in text. Always fresh copies. */
export const standardLists = (master) => Object.fromEntries(MASTER_KEYS.map((key) => [key, Array.isArray(master?.[key]) ? [...master[key]] : [...STANDARD_TEXT[key]]]));

/**
 * What a NEW quotation starts with, given what it holds now: only a list that is still exactly the built-in text (nobody typed in
 * it) is replaced by the saved text. Returns just the lists to change, so what a person already typed is never overwritten.
 */
export const startingLists = (current, master) => {
  if (!master) return {};
  const standard = standardLists(master);
  const patch = {};
  for (const key of MASTER_KEYS) {
    const now = Array.isArray(current?.[key]) ? current[key] : [];
    if (sameList(now, STANDARD_TEXT[key]) && !sameList(standard[key], STANDARD_TEXT[key])) patch[key] = standard[key];
  }
  return patch;
};

/** A line with nothing visible in it (blank, or formatting around nothing). */
export const isBlankLine = (line) => !richToPlainText(String(line ?? '')).trim();

/** What goes to the server: every list without its blank lines. */
export const payloadOf = (lists) => Object.fromEntries(MASTER_KEYS.map((key) => [key, (lists?.[key] || []).filter((line) => !isBlankLine(line))]));

/** What stops the lists from being saved, in plain words (the first problem), or null. */
export const masterProblem = (lists) => {
  for (const { key, title, noun } of MASTER_SECTIONS) {
    const lines = (lists?.[key] || []).filter((line) => !isBlankLine(line));
    if (lines.length > MASTER_LIMITS.items) return `${title} can have at most ${MASTER_LIMITS.items} lines (there are ${lines.length}).`;
    const long = lines.findIndex((line) => richToPlainText(line).length > MASTER_LIMITS.text);
    if (long >= 0) return `The ${noun} ${long + 1} in ${title} is too long (the limit is ${MASTER_LIMITS.text} characters).`;
  }
  return null;
};

/** Whether the lists differ from what is saved (or from the built-in text when nothing is saved), ignoring blank lines. */
export const masterChanged = (lists, master) => {
  const saved = payloadOf(standardLists(master));
  const now = payloadOf(lists);
  return MASTER_KEYS.some((key) => !sameList(saved[key], now[key]));
};
