import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, generatePassword, passwordProblem } from './password';

describe('generatePassword', () => {
  it('makes a password of the asked length with every kind of character, and never anything that is easy to misread', () => {
    for (let i = 0; i < 200; i += 1) {
      const p = generatePassword(12);
      expect(p).toHaveLength(12);
      expect(p).toMatch(/[a-z]/);
      expect(p).toMatch(/[A-Z]/);
      expect(p).toMatch(/[0-9]/);
      expect(p).toMatch(/[-_@#]/);
      expect(p).not.toMatch(/[0O1lI]/);
      expect(passwordProblem(p)).toBeNull();
    }
  });
  it('keeps the length within what the server accepts', () => {
    expect(generatePassword(2)).toHaveLength(MIN_PASSWORD_LENGTH);
    expect(generatePassword(500)).toHaveLength(MAX_PASSWORD_LENGTH);
  });
  it('is different every time', () => {
    expect(new Set(Array.from({ length: 50 }, () => generatePassword())).size).toBe(50);
  });
});

describe('passwordProblem', () => {
  it('says what is wrong in plain words', () => {
    expect(passwordProblem('Strong-pass-1')).toBeNull();
    expect(passwordProblem('')).toBe('Please enter a password.');
    expect(passwordProblem(undefined)).toBe('Please enter a password.');
    expect(passwordProblem('short')).toBe('Password must be at least 8 characters.');
    expect(passwordProblem('x'.repeat(73))).toBe('Password can be at most 72 characters.');
    expect(passwordProblem('é'.repeat(40))).toBe('Password can be at most 72 characters.');
    expect(passwordProblem(' padded-pass')).toBe('The password must not start or end with a space.');
    expect(passwordProblem('Ops1@7HeavenTourism.in', { email: 'ops1@7heaventourism.in' })).toBe('The password must not be the same as the email address.');
  });
  it('property: a password with no problem is always between 8 and 72 bytes with no outer spaces', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 100 }), (p) => {
        if (passwordProblem(p) === null) {
          expect(p.length).toBeGreaterThanOrEqual(8);
          expect(new TextEncoder().encode(p).length).toBeLessThanOrEqual(72);
          expect(p).toBe(p.trim());
        }
      }),
      { numRuns: 300 }
    );
  });
});
