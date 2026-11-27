import { describe, expect, it } from 'vitest';
import { fullAddress } from './companyHeader';

describe('the company address on the documents', () => {
  it('goes on with the state and the country after Vadodara', () => {
    expect(fullAddress('Opp Express Tower Hotel, Alkapuri 390007, Vadodara')).toBe('Opp Express Tower Hotel, Alkapuri 390007, Vadodara, Gujarat, India');
    expect(fullAddress('Alkapuri, Vadodara - 390007.')).toBe('Alkapuri, Vadodara - 390007, Gujarat, India');
    expect(fullAddress('Alkapuri, Vadodara, Gujarat')).toBe('Alkapuri, Vadodara, Gujarat, India');
  });

  it('is not repeated, and another town or an empty address is left alone', () => {
    const done = 'Alkapuri, Vadodara, Gujarat, India';
    expect(fullAddress(done)).toBe(done);
    expect(fullAddress('Ring Road, Surat')).toBe('Ring Road, Surat');
    expect(fullAddress('')).toBe('');
    expect(fullAddress(undefined)).toBe('');
  });
});

