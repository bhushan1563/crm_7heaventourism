import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { MASTER_KEYS, MASTER_LIMITS, MASTER_SECTIONS, isBlankLine, masterChanged, masterProblem, payloadOf, standardLists, startingLists } from './masterText';
import { STANDARD_TEXT } from './standardText';

const master = (over = {}) => ({ importantNotes: ['Our own note.'], paymentPolicy: ['Our own payment line.'], cancellationPolicy: ['Our own cancellation line.'], exclusions: ['Our own exclusion.'], vehicleNotes: ['Our own vehicle note.'], updatedAt: '2026-11-04T10:00:00.000Z', ...over });

describe('the five lists', () => {
  it('are the ones the server keeps, each with a title and a hint', () => {
    expect(MASTER_KEYS).toEqual(['importantNotes', 'paymentPolicy', 'cancellationPolicy', 'exclusions', 'vehicleNotes']);
    for (const s of MASTER_SECTIONS) expect(s.title && s.hint && s.placeholder && s.noun).toBeTruthy();
  });

  it('are the built-in text until something is saved', () => {
    const lists = standardLists(null);
    for (const key of MASTER_KEYS) expect(lists[key]).toEqual(STANDARD_TEXT[key]);
    expect(lists.paymentPolicy.length).toBeGreaterThan(0);
  });

  it('are the saved text once it is saved, and the built-in text only for a list that was not saved', () => {
    const lists = standardLists(master({ exclusions: undefined, vehicleNotes: [] }));
    expect(lists.importantNotes).toEqual(['Our own note.']);
    expect(lists.exclusions).toEqual(STANDARD_TEXT.exclusions);
    expect(lists.vehicleNotes).toEqual([]); // saved empty on purpose
  });

  it('are fresh copies, so changing one never changes the built-in text or the saved text', () => {
    const lists = standardLists(null);
    lists.paymentPolicy.push('typed');
    lists.paymentPolicy[0] = 'changed';
    expect(STANDARD_TEXT.paymentPolicy).not.toContain('typed');
    expect(standardLists(null).paymentPolicy[0]).toBe(STANDARD_TEXT.paymentPolicy[0]);
    const saved = master();
    standardLists(saved).paymentPolicy.push('x');
    expect(saved.paymentPolicy).toEqual(['Our own payment line.']);
  });
});

describe('what a new quotation starts with', () => {
  const fresh = () => ({ ...standardLists(null) });

  it('is the saved text, for every list that nobody has typed in', () => {
    const patch = startingLists(fresh(), master());
    expect(Object.keys(patch).sort()).toEqual([...MASTER_KEYS].sort());
    expect(patch.paymentPolicy).toEqual(['Our own payment line.']);
  });

  it('leaves a list alone that the person already changed, and replaces the others', () => {
    const current = { ...fresh(), paymentPolicy: ['I typed this myself.'], exclusions: [...STANDARD_TEXT.exclusions, 'one more'] };
    const patch = startingLists(current, master());
    expect(patch.paymentPolicy).toBeUndefined();
    expect(patch.exclusions).toBeUndefined();
    expect(patch.importantNotes).toEqual(['Our own note.']);
  });

  it('changes nothing when nothing is saved, or when the saved list is the built-in text anyway', () => {
    expect(startingLists(fresh(), null)).toEqual({});
    expect(startingLists(fresh(), master({ ...Object.fromEntries(MASTER_KEYS.map((k) => [k, STANDARD_TEXT[k]])) }))).toEqual({});
  });

  it('treats a missing list as empty, and a list emptied by the person as theirs', () => {
    expect(startingLists({}, master())).toEqual({}); // an empty list is not the built-in text: someone cleared it
    expect(startingLists(undefined, master())).toEqual({});
  });
});

describe('what is sent and what stops saving', () => {
  it('drops the blank lines, including formatting around nothing', () => {
    expect(isBlankLine('')).toBe(true);
    expect(isBlankLine('   ')).toBe(true);
    expect(isBlankLine('<p><strong> </strong></p>')).toBe(true);
    expect(isBlankLine('<p><strong>x</strong></p>')).toBe(false);
    const sent = payloadOf({ ...standardLists(null), paymentPolicy: ['A', '', '   ', '<p></p>', 'B'] });
    expect(sent.paymentPolicy).toEqual(['A', 'B']);
    expect(Object.keys(sent)).toEqual(MASTER_KEYS);
  });

  it('says plainly when a list or a line is too long, naming it', () => {
    expect(masterProblem(standardLists(null))).toBeNull();
    expect(masterProblem({ ...standardLists(null), exclusions: Array.from({ length: MASTER_LIMITS.items + 1 }, (_, i) => `Line ${i}`) })).toBe('Exclusions can have at most 100 lines (there are 101).');
    expect(masterProblem({ ...standardLists(null), cancellationPolicy: ['ok', 'x'.repeat(MASTER_LIMITS.text + 1)] })).toBe('The cancellation line 2 in Cancellation policy is too long (the limit is 1000 characters).');
  });

  it('is not troubled by blank lines when counting', () => {
    expect(masterProblem({ ...standardLists(null), exclusions: Array.from({ length: 150 }, () => '') })).toBeNull();
  });

  it('knows when something was changed, ignoring blank lines, against the saved text or the built-in text', () => {
    expect(masterChanged(standardLists(null), null)).toBe(false);
    expect(masterChanged({ ...standardLists(null), exclusions: [...STANDARD_TEXT.exclusions, ''] }, null)).toBe(false);
    expect(masterChanged({ ...standardLists(null), exclusions: [...STANDARD_TEXT.exclusions, 'new'] }, null)).toBe(true);
    expect(masterChanged(standardLists(master()), master())).toBe(false);
    expect(masterChanged(standardLists(null), master())).toBe(true); // the built-in text is not what was saved
  });
});

describe('property', () => {
  const line = fc.oneof(fc.string({ maxLength: 30 }), fc.constantFrom('', '  ', '<p></p>', '<p><strong>x</strong></p>'));

  it('what is sent is always the lists without blank lines, in order, and never more than was typed', () => {
    fc.assert(
      fc.property(fc.record(Object.fromEntries(MASTER_KEYS.map((k) => [k, fc.array(line, { maxLength: 8 })]))), (lists) => {
        const sent = payloadOf(lists);
        for (const key of MASTER_KEYS) {
          expect(sent[key].every((l) => !isBlankLine(l))).toBe(true);
          expect(sent[key]).toEqual(lists[key].filter((l) => !isBlankLine(l)));
        }
        expect(masterChanged(lists, { ...Object.fromEntries(MASTER_KEYS.map((k) => [k, sent[k]])) })).toBe(false);
      }),
      { numRuns: 200 }
    );
  });

  it('a new quotation is never given text over what the person typed', () => {
    fc.assert(
      fc.property(fc.record(Object.fromEntries(MASTER_KEYS.map((k) => [k, fc.oneof(fc.constant(null), fc.array(fc.string({ maxLength: 10 }), { maxLength: 4 }))]))), (typed) => {
        const current = Object.fromEntries(MASTER_KEYS.map((k) => [k, typed[k] === null ? [...STANDARD_TEXT[k]] : typed[k]]));
        const patch = startingLists(current, master());
        for (const key of Object.keys(patch)) expect(current[key]).toEqual(STANDARD_TEXT[key]); // only an untouched list was replaced
      }),
      { numRuns: 200 }
    );
  });
});
