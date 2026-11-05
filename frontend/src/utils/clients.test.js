import { describe, expect, it } from 'vitest';
import { CLIENT_LIMITS, blankClient, clientErrors, clientForm, clientPayload, matchesClient, uniqueEmails, whatsappUrl } from './clients';

describe('the form of a future client', () => {
  it('starts empty, turns a saved client into text and back, and trims what is typed', () => {
    expect(blankClient()).toEqual({ name: '', phone: '', email: '', destination: '', expectedTravel: '', budget: '', source: '', notes: '' });
    const saved = { _id: 'f1', name: 'Meera Joshi', phone: '+91 98765 11111', destination: 'Bali', createdByName: 'Sana' };
    expect(clientForm(saved)).toEqual({ ...blankClient(), name: 'Meera Joshi', phone: '+91 98765 11111', destination: 'Bali' });
    expect(clientPayload({ ...blankClient(), name: '  Meera  ', notes: ' call after Diwali ' })).toEqual({ ...blankClient(), name: 'Meera', notes: 'call after Diwali' });
  });

  it('only needs a name, and says in words what is wrong', () => {
    expect(clientErrors({ ...blankClient(), name: 'Meera' })).toEqual({});
    expect(clientErrors(blankClient()).name).toMatch(/enter the name/);
    expect(clientErrors({ ...blankClient(), name: 'A', phone: 'call me' }).phone).toMatch(/can only have digits/);
    expect(clientErrors({ ...blankClient(), name: 'A', email: 'nope' }).email).toMatch(/does not look right/);
    expect(clientErrors({ ...blankClient(), name: 'x'.repeat(CLIENT_LIMITS.name + 1) }).name).toMatch(/too long/);
    expect(clientErrors({ ...blankClient(), name: 'A', phone: '+91 (98765) 43210', email: 'a.b@mail.example.com' })).toEqual({});
  });
});

describe('searching the clients', () => {
  const current = { name: 'Aarav Mehta', emails: ['aarav@example.com'], phones: ['+91 98765 43210'], destination: 'Rajasthan', status: 'Confirmed', sales: 'Sana' };
  const future = { name: 'Meera Joshi', phone: '+91 90000 11111', email: 'meera@mail.com', destination: 'Bali', expectedTravel: 'December 2026', source: 'Instagram', notes: 'Honeymoon' };

  it('finds a client by any word, in any case, and every word typed must match', () => {
    expect(matchesClient(current, '')).toBe(true);
    expect(matchesClient(current, 'AARAV rajasthan')).toBe(true);
    expect(matchesClient(current, 'aarav goa')).toBe(false);
    expect(matchesClient(future, 'honeymoon bali')).toBe(true);
    expect(matchesClient(future, 'instagram')).toBe(true);
  });

  it('finds a number however it was written', () => {
    expect(matchesClient(current, '9876543210')).toBe(true);
    expect(matchesClient(future, '90000')).toBe(true);
    expect(matchesClient(future, '12345')).toBe(false);
  });
});

describe('e-mails and WhatsApp', () => {
  it('lists every e-mail address once, whatever the letter case, from both kinds of client', () => {
    const list = uniqueEmails([{ emails: ['Aarav@Example.com', 'a2@example.com'] }, { emails: ['aarav@example.com'] }, { email: 'meera@mail.com' }, { email: '' }, { emails: [] }]);
    expect(list).toEqual(['Aarav@Example.com', 'a2@example.com', 'meera@mail.com']);
    expect(uniqueEmails([])).toEqual([]);
  });

  it('opens WhatsApp for a number typed the way people type it, and for nothing else', () => {
    expect(whatsappUrl('98765 43210')).toBe('https://wa.me/919876543210');
    expect(whatsappUrl('+971 50 123 4567')).toBe('https://wa.me/971501234567');
    expect(whatsappUrl('call me')).toBe('');
    expect(whatsappUrl('')).toBe('');
  });
});
