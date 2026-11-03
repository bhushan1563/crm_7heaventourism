import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { formatDate } from './dateHelper';
import { SHARE_LIMITS, confirmationEmailSubject, contactToSave, defaultConfirmationMessage, defaultEmailSubject, defaultShareMessage, emailAddress, mailtoLink, shareFileName, whatsappLink, whatsappNumber } from './shareContact';

describe('whatsappNumber', () => {
  it.each([
    ['9876543210', '919876543210', '+91 98765 43210'],
    ['98765 43210', '919876543210', '+91 98765 43210'],
    ['098765 43210', '919876543210', '+91 98765 43210'],
    ['+91 98765-43210', '919876543210', '+91 98765 43210'],
    ['0091 (98765) 43210', '919876543210', '+91 98765 43210'],
    ['919876543210', '919876543210', '+91 98765 43210'],
    ['+971 50 123 4567', '971501234567', '+971501234567'],
    ['+1 (415) 555-2671', '14155552671', '+14155552671'],
    ['  98765.43210  ', '919876543210', '+91 98765 43210']
  ])('accepts %s as typed and gives the number wa.me needs', (typed, digits, display) => {
    expect(whatsappNumber(typed)).toEqual({ ok: true, digits, display });
  });

  it('asks for a number when there is none, in plain words', () => {
    for (const nothing of ['', '   ', undefined, null]) {
      const r = whatsappNumber(nothing);
      expect(r.ok).toBe(false);
      expect(r.empty).toBe(true);
      expect(r.message).toMatch(/Enter the client's WhatsApp number/);
    }
  });

  it('explains what is wrong with a bad number instead of sending it', () => {
    expect(whatsappNumber('98765').message).toMatch(/too short.*10 digits/);
    expect(whatsappNumber('+91 123').message).toMatch(/too short/);
    expect(whatsappNumber('9876543210123456789').message).toMatch(/too long/);
    expect(whatsappNumber('call me').message).toMatch(/only have digits/);
    expect(whatsappNumber('98765x43210').message).toMatch(/only have digits/);
    expect(whatsappNumber('98765#43210').message).toMatch(/only have digits/);
    expect(whatsappNumber('0000000000').message).toMatch(/country code never starts with 0/); // ten zeros: nonsense, not a number
    expect(whatsappNumber('+0 123 456 789').message).toMatch(/country code never starts with 0/);
    expect(whatsappNumber('0987654321').message).toMatch(/should not start with 0/);
  });

  it('never treats a script or a link as a number', () => {
    for (const hostile of ['<script>alert(1)</script>', 'https://evil.example/?x=1', '1; DROP TABLE', '9876543210/../../x', '+91 98765 43210 ext 5']) {
      expect(whatsappNumber(hostile).ok).toBe(false);
    }
  });

  it('property: whatever is typed it never throws, and an accepted number is only digits, 8 to 15 long', () => {
    fc.assert(
      fc.property(fc.oneof(fc.string({ maxLength: 30 }), fc.array(fc.constantFrom(...'0123456789 +-().'), { maxLength: 24 }).map((a) => a.join(''))), (typed) => {
        const r = whatsappNumber(typed);
        expect(typeof r.ok).toBe('boolean');
        if (r.ok) {
          expect(r.digits).toMatch(/^[1-9]\d{7,14}$/); // a country code never starts with 0
          expect(r.display.startsWith('+')).toBe(true);
          expect(whatsappNumber(r.display).digits).toBe(r.digits); // what is shown can be typed back
        } else {
          expect(r.message.length).toBeGreaterThan(5);
        }
      }),
      { numRuns: 400 }
    );
  });

  it('property: any ten digits (not starting with 0) become the same number with 91 in front', () => {
    fc.assert(
      fc.property(fc.array(fc.constantFrom(...'0123456789'), { minLength: 10, maxLength: 10 }).map((a) => a.join('')).filter((ten) => !ten.startsWith('0')), (ten) => {
        expect(whatsappNumber(ten).digits).toBe(`91${ten}`);
      })
    );
  });
});

describe('emailAddress', () => {
  it('accepts a normal address and trims it', () => {
    expect(emailAddress('  meera@example.com ')).toEqual({ ok: true, value: 'meera@example.com' });
    expect(emailAddress('a.b+c@sub.example.co.in').ok).toBe(true);
  });
  it('asks for one when empty, and explains a wrong one', () => {
    expect(emailAddress('').message).toMatch(/Enter the client's e-mail/);
    for (const bad of ['meera', 'meera@', '@example.com', 'meera@example', 'meera@@example.com', 'me era@example.com', 'meera@example..com']) {
      const r = emailAddress(bad);
      expect(r.ok, bad).toBe(false);
      expect(r.message, bad).toMatch(/e-mail address/);
    }
  });
  it('accepts one address only, so a second one cannot be smuggled into the mail', () => {
    expect(emailAddress('a@example.com, b@example.com').ok).toBe(false);
    expect(emailAddress('a@example.com;b@example.com').ok).toBe(false);
    expect(emailAddress('a@example.com\nBcc: x@example.com').ok).toBe(false);
  });
  it('property: it never throws and an accepted address has one @ and no spaces', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 40 }), (typed) => {
        const r = emailAddress(typed);
        if (r.ok) {
          expect(r.value.split('@')).toHaveLength(2);
          expect(r.value).not.toMatch(/\s/);
        }
      }),
      { numRuns: 400 }
    );
  });
});

describe('the links', () => {
  const message = 'Hello Meera,\n\nYour quotation & prices: 50% off? "Yes" #1 — ₹6,500 😀';
  it('the WhatsApp link carries the message exactly, once decoded', () => {
    const link = whatsappLink('919876543210', message);
    expect(link.startsWith('https://wa.me/919876543210?text=')).toBe(true);
    expect(decodeURIComponent(link.split('?text=')[1])).toBe(message);
    expect(link).not.toMatch(/[\n "<>]/);
  });
  it('the mail link carries subject and body exactly, once decoded, and cannot add other headers', () => {
    const link = mailtoLink('meera@example.com', 'Quotation & prices', `${message}\nBcc: x@example.com`);
    const [, query] = link.split('?');
    const params = new URLSearchParams(query);
    expect(link.startsWith('mailto:meera@example.com?subject=')).toBe(true);
    expect(params.get('subject')).toBe('Quotation & prices');
    expect(params.get('body')).toContain('Bcc: x@example.com'); // only text in the body
    expect([...params.keys()]).toEqual(['subject', 'body']); // no extra Bcc/Cc header
  });
  it('a very long message is cut, so the link stays usable', () => {
    const long = 'x'.repeat(5000);
    expect(decodeURIComponent(whatsappLink('919876543210', long).split('?text=')[1])).toHaveLength(SHARE_LIMITS.message);
    expect(decodeURIComponent(new URLSearchParams(mailtoLink('a@b.co', 'y'.repeat(900), long).split('?')[1]).get('subject'))).toHaveLength(SHARE_LIMITS.subject);
  });
  it('property: any text survives the round trip through the WhatsApp link', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 200 }), (text) => {
        expect(decodeURIComponent(whatsappLink('919876543210', text).split('?text=')[1])).toBe(text);
      })
    );
  });
});

describe('file name and messages', () => {
  const q = { destination: 'JAPAN TOURIST VISA', quotationNo: '7H-QT-2026-014', clientName: 'Meera Iyer', travelDate: '2027-03-15T00:00:00.000Z' };
  it('names the file like the quotation list does, and is safe to save anywhere', () => {
    expect(shareFileName(q, 'pdf')).toBe('7Heaven_Quotation_JAPAN_TOURIST_VISA_7H-QT-2026-014.pdf');
    expect(shareFileName(q, 'docx')).toBe('7Heaven_Quotation_JAPAN_TOURIST_VISA_7H-QT-2026-014.docx');
    expect(shareFileName({ destination: '../../etc/passwd: "x"|*?' }, 'pdf')).toBe('7Heaven_Quotation_etc_passwd_x_Doc.pdf');
    expect(shareFileName({}, 'pdf')).toBe('7Heaven_Quotation_7Heaven_Doc.pdf');
    expect(shareFileName({ destination: 'A'.repeat(300) }, 'pdf').length).toBeLessThan(80);
  });
  it('writes a friendly message with the client, the visa, the number, the file kind and the sender', () => {
    const text = defaultShareMessage({ quotation: q, format: 'docx', senderName: 'Sana Tester', company: { name: '7HEAVEN TOURISM', phone: '+91 7862829178' } });
    expect(text).toMatch(/^Hello Meera Iyer,/);
    expect(text).toContain('JAPAN TOURIST VISA quotation (7H-QT-2026-014) attached as a Word file');
    expect(text).toContain(`Travel date: ${formatDate(q.travelDate)}`);
    expect(formatDate(q.travelDate)).not.toBe(''); // so the line above really checks something
    expect(text).toContain('Sana Tester');
    expect(text.length).toBeLessThanOrEqual(SHARE_LIMITS.message);
    expect(defaultShareMessage({ quotation: {}, format: 'pdf' })).toMatch(/^Hello,/);
  });
  it('property: the message never goes over the limit, whatever the quotation holds', () => {
    fc.assert(
      fc.property(fc.record({ clientName: fc.string({ maxLength: 500 }), destination: fc.string({ maxLength: 500 }), quotationNo: fc.string({ maxLength: 100 }) }), fc.string({ maxLength: 300 }), (quotation, sender) => {
        expect(defaultShareMessage({ quotation, senderName: sender, company: { name: 'X', phone: '1' } }).length).toBeLessThanOrEqual(SHARE_LIMITS.message);
        expect(defaultEmailSubject(quotation).length).toBeLessThanOrEqual(SHARE_LIMITS.subject);
      })
    );
  });
  it('the e-mail subject names the visa and the number', () => {
    expect(defaultEmailSubject(q)).toBe('7Heaven Tourism: JAPAN TOURIST VISA quotation 7H-QT-2026-014');
  });
});

describe('contactToSave', () => {
  const phone = (typed) => whatsappNumber(typed);
  const email = (typed) => emailAddress(typed);
  it('saves a number the quotation did not have, and a changed one', () => {
    expect(contactToSave({}, phone('9876543210'), { ok: false })).toEqual({ clientPhone: '+91 98765 43210' });
    expect(contactToSave({ clientPhone: '9000000000' }, phone('9876543210'), { ok: false })).toEqual({ clientPhone: '+91 98765 43210' });
  });
  it('does not call the same number in another format a change', () => {
    expect(contactToSave({ clientPhone: '+91 98765 43210' }, phone('9876543210'), { ok: false })).toEqual({});
    expect(contactToSave({ clientPhone: '09876543210' }, phone('+919876543210'), { ok: false })).toEqual({});
  });
  it('saves an e-mail address only when it is new, ignoring capitals', () => {
    expect(contactToSave({}, { ok: false }, email('Meera@Example.com'))).toEqual({ clientEmail: 'Meera@Example.com' });
    expect(contactToSave({ clientEmail: 'meera@example.com' }, { ok: false }, email('MEERA@example.com'))).toEqual({});
  });
  it('never saves what was not valid', () => {
    expect(contactToSave({}, phone('12'), email('nope'))).toEqual({});
  });
});

describe('the sender number', () => {
  const q = { destination: 'JAPAN TOURIST VISA', quotationNo: '7H-QT-2026-014', clientName: 'Meera Iyer' };
  const company = { name: '7HEAVEN TOURISM', phone: '+91 7862829178' };
  it('closes the message with the sender\'s own number when they have one, else with the company number', () => {
    const own = defaultShareMessage({ quotation: q, senderName: 'Sana Tester', senderNumber: '+919876543210', company });
    expect(own.endsWith('Sana Tester\n+919876543210')).toBe(true);
    expect(own).not.toContain('7862829178');
    const none = defaultShareMessage({ quotation: q, senderName: 'Sana Tester', senderNumber: '', company });
    expect(none.endsWith('Sana Tester\n+91 7862829178')).toBe(true);
    expect(defaultShareMessage({ quotation: q, company: {} }).endsWith('The 7Heaven Tourism team')).toBe(true);
  });
});

describe('a booking confirmation', () => {
  const c = { confirmationNo: '7H-CF-2026-001', quotationNo: '7H-QT-2026-022', clientName: 'Pujan', destination: 'Vietnam', travelDate: '2027-03-21T00:00:00.000Z', paxDetails: '6 Adults' };
  const company = { name: '7HEAVEN TOURISM', phone: '+91 7862829178' };
  it('is named after the booking number, like the preview names its PDF', () => {
    expect(shareFileName(c, 'pdf', 'Confirmation')).toBe('7Heaven_Confirmation_Vietnam_7H-CF-2026-001.pdf');
    expect(shareFileName({ ...c, confirmationNo: '' }, 'pdf', 'Confirmation')).toBe('7Heaven_Confirmation_Vietnam_7H-QT-2026-022.pdf');
    expect(shareFileName(c, 'pdf')).toBe('7Heaven_Quotation_Vietnam_7H-QT-2026-022.pdf'); // a quotation keeps its own name
  });
  it('gets a message that says the booking is confirmed, with the dates and the travellers, signed with the sender\'s number', () => {
    const text = defaultConfirmationMessage({ confirmation: c, senderName: 'Sana Tester', senderNumber: '+919876543210', company });
    expect(text).toMatch(/^Hello Pujan,/);
    expect(text).toContain('Your booking 7H-CF-2026-001 for Vietnam is confirmed');
    expect(text).toContain('attached as a PDF file');
    expect(text).toContain(`Travel date: ${formatDate(c.travelDate)}`);
    expect(text).toContain('Travellers: 6 Adults');
    expect(text.endsWith('Sana Tester\n+919876543210')).toBe(true);
    expect(formatDate(c.travelDate)).not.toBe('');
  });
  it('leaves out what it does not have, and still reads well', () => {
    const text = defaultConfirmationMessage({ confirmation: {}, company: {} });
    expect(text).toMatch(/^Hello,/);
    expect(text).toContain('Your booking for your trip is confirmed');
    expect(text).not.toContain('Travel date');
    expect(text).not.toContain('Travellers');
  });
  it('has an e-mail subject that names the booking and the destination', () => {
    expect(confirmationEmailSubject(c)).toBe('7Heaven Tourism: Booking confirmation 7H-CF-2026-001 for Vietnam');
    expect(confirmationEmailSubject({})).toBe('7Heaven Tourism: Booking confirmation for your trip');
  });
  it('property: the message and subject never go over their limits', () => {
    fc.assert(
      fc.property(fc.record({ clientName: fc.string({ maxLength: 400 }), destination: fc.string({ maxLength: 400 }), confirmationNo: fc.string({ maxLength: 100 }), paxDetails: fc.string({ maxLength: 400 }) }), fc.string({ maxLength: 200 }), (confirmation, sender) => {
        expect(defaultConfirmationMessage({ confirmation, senderName: sender, senderNumber: sender, company }).length).toBeLessThanOrEqual(SHARE_LIMITS.message);
        expect(confirmationEmailSubject(confirmation).length).toBeLessThanOrEqual(SHARE_LIMITS.subject);
      })
    );
  });
});
