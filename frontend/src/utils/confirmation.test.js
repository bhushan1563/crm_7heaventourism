import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { balanceOf, blankDetail, blankTraveller, bookingErrors, bookingPayload, bookingView, confirmBlockedReason, firstErrorKey, formFromConfirmation, isFullyPaid, needsOptionChoice, quotationOf, toDateInput } from './confirmation';

const form = (over = {}) => ({ travelDate: '2027-04-10', travellers: [{ name: 'Aarav', age: '41', passportNo: 'Z1', notes: '' }], payment: { totalAmount: 120000, received: 40000, balanceDueDate: '2027-03-01', note: '' }, notes: '', customFields: [], ...over });

describe('payment', () => {
  it('the balance is the total minus what was received, to the paisa', () => {
    expect(balanceOf({ totalAmount: 120000, received: 40000 })).toBe(80000);
    expect(balanceOf({ totalAmount: 0.3, received: 0.1 })).toBe(0.2);
    expect(balanceOf(undefined)).toBe(0);
    expect(balanceOf({ totalAmount: '500', received: '200' })).toBe(300);
  });
  it('is fully paid only when something is due and all of it is received', () => {
    expect(isFullyPaid({ totalAmount: 100, received: 100 })).toBe(true);
    expect(isFullyPaid({ totalAmount: 100, received: 99.9 })).toBe(false);
    expect(isFullyPaid({ totalAmount: 0, received: 0 })).toBe(false);
  });
});

describe('the form and the payload', () => {
  it('turns a confirmation into form text and back', () => {
    const c = { travelDate: '2027-04-10T00:00:00.000Z', travellers: [{ name: 'Aarav', age: 41, passportNo: 'Z1' }, { name: 'Anaya', age: null }], payment: { totalAmount: 5000, received: 1000, balanceDueDate: '2027-03-01T00:00:00.000Z', note: 'Cheque' }, notes: '<p>x</p>', customFields: [{ label: 'Driver', value: 'Raju' }] };
    const f = formFromConfirmation(c);
    expect(f.travelDate).toBe('2027-04-10');
    expect(f.travellers[1]).toEqual({ name: 'Anaya', age: '', passportNo: '', notes: '' });
    expect(f.payment.balanceDueDate).toBe('2027-03-01');
    const p = bookingPayload(f);
    expect(p.travellers).toEqual([{ name: 'Aarav', age: 41, passportNo: 'Z1', notes: '' }, { name: 'Anaya', age: null, passportNo: '', notes: '' }]);
    expect(p.payment).toEqual({ totalAmount: 5000, received: 1000, balanceDueDate: '2027-03-01', supplier: '', note: 'Cheque' });
    expect(p.customFields).toEqual([{ label: 'Driver', value: 'Raju' }]);
  });
  it('copes with a confirmation that has nothing yet', () => {
    expect(formFromConfirmation(undefined)).toEqual({ travelDate: '', travellers: [], payment: { totalAmount: 0, received: 0, balanceDueDate: '', supplier: '', note: '' }, contacts: { coordinator: { name: '', numbers: [''] }, emergency: { name: '', numbers: [''] } }, showPricing: false, hotelBookings: [], notes: '', customFields: [] });
    expect(toDateInput(null)).toBe('');
  });
  it('keeps the tour coordinator and the emergency contact with several numbers, leaving a blank box to type in', () => {
    const f = formFromConfirmation({ contacts: { coordinator: { name: 'Ravi Shah', numbers: ['+91 98765 43210', '0294 242 8800'] } } });
    expect(f.contacts.coordinator).toEqual({ name: 'Ravi Shah', numbers: ['+91 98765 43210', '0294 242 8800'] });
    expect(f.contacts.emergency).toEqual({ name: '', numbers: [''] });
    const typed = { ...f, contacts: { coordinator: { name: ' Ravi Shah ', numbers: [' +91 98765 43210 ', '', '0294 242 8800'] }, emergency: { name: '', numbers: [''] } } };
    expect(bookingPayload(typed).contacts).toEqual({ coordinator: { name: 'Ravi Shah', numbers: ['+91 98765 43210', '0294 242 8800'] }, emergency: { name: '', numbers: [] } });
    expect(bookingView(null, typed).contacts).toEqual([{ key: 'coordinator', label: 'Tour coordinator', name: 'Ravi Shah', numbers: ['+91 98765 43210', '0294 242 8800'] }]);
    expect(bookingView(null, form()).contacts).toEqual([]);
  });
  it('keeps whether the voucher shows prices: off unless the booking says so, in the form, the payload, the preview and the printed page', () => {
    expect(formFromConfirmation({}).showPricing).toBe(false);
    expect(formFromConfirmation({ showPricing: true }).showPricing).toBe(true);
    expect(bookingPayload(formFromConfirmation({ showPricing: true })).showPricing).toBe(true);
    expect(bookingPayload(form()).showPricing).toBe(false); // a form that never heard of it sends "no"
    expect(bookingView({}, form({ showPricing: true })).showPricing).toBe(true);
    expect(bookingView({}, form()).showPricing).toBe(false);
    expect(quotationOf({ quote: {} }).confirmationInfo.showPricing).toBe(false);
    expect(quotationOf({ quote: {}, showPricing: true }).confirmationInfo.showPricing).toBe(true);
    expect(quotationOf({ quote: {}, showPricing: true }, { showPricing: false }).confirmationInfo.showPricing).toBe(false); // an unsaved switch wins in the preview
  });
  it('says which number is wrong, and allows a form that has no contacts at all', () => {
    const wrong = bookingErrors(form({ contacts: { coordinator: { name: 'Ravi', numbers: ['98765 43210', 'call me'] }, emergency: { name: '', numbers: [''] } } }));
    expect(wrong['contact-coordinator-number-1']).toMatch(/Number 2 of the tour coordinator can only have digits/);
    expect(wrong['contact-coordinator-number-0']).toBeUndefined();
    expect(firstErrorKey(wrong, form({ contacts: { coordinator: { name: '', numbers: ['', ''] }, emergency: { name: '', numbers: [''] } } }))).toBe('contact-coordinator-number-1');
    expect(bookingErrors(form())).toEqual({});
  });
  it('trims what is typed', () => {
    const p = bookingPayload(form({ travellers: [{ name: '  Aarav  ', age: '', passportNo: ' Z1 ', notes: ' vegan ' }], customFields: [{ label: ' A ', value: ' b ' }] }));
    expect(p.travellers[0]).toEqual({ name: 'Aarav', age: null, passportNo: 'Z1', notes: 'vegan' });
    expect(p.customFields[0]).toEqual({ label: 'A', value: 'b' });
  });
});

describe('bookingErrors', () => {
  it('has nothing to say about a good booking', () => {
    expect(bookingErrors(form())).toEqual({});
    expect(bookingErrors(form({ travelDate: '', travellers: [], customFields: [] }))).toEqual({});
  });
  it('names the traveller and the field', () => {
    const e = bookingErrors(form({ travellers: [{ ...blankTraveller(), name: 'A' }, { ...blankTraveller(), name: ' ', age: '200' }] }));
    expect(e['traveller-1-name']).toBe('Please enter the name of traveller 2, or remove that line.');
    expect(e['traveller-1-age']).toBe('The age of traveller 2 must be a whole number from 0 to 120.');
    expect(e['traveller-0-name']).toBeUndefined();
    expect(bookingErrors(form({ travellers: [{ ...blankTraveller(), name: 'A', age: '4.5' }] }))['traveller-0-age']).toBeDefined();
    expect(bookingErrors(form({ travellers: [{ ...blankTraveller(), name: 'A', passportNo: 'x'.repeat(31) }] }))['traveller-0-passport']).toMatch(/too long/);
  });
  it('refuses more received than the total, with both amounts in the message', () => {
    const e = bookingErrors(form({ payment: { totalAmount: 1000, received: 1500, balanceDueDate: '', note: '' } }));
    expect(e['payment-received']).toBe('The amount received (Rs 1,500) cannot be more than the total amount (Rs 1,000).');
  });
  it('refuses impossible amounts and dates', () => {
    expect(bookingErrors(form({ payment: { totalAmount: -1, received: 0, balanceDueDate: '', note: '' } }))['payment-total']).toMatch(/total amount must be an amount/);
    expect(bookingErrors(form({ payment: { totalAmount: 'lots', received: 0, balanceDueDate: '', note: '' } }))['payment-total']).toBeDefined();
    expect(bookingErrors(form({ payment: { totalAmount: 10, received: 0, balanceDueDate: '2027-02-31', note: '' } }))['payment-date']).toMatch(/real date/);
    expect(bookingErrors(form({ travelDate: '2027-13-01' })).travelDate).toMatch(/real date/);
    expect(bookingErrors(form({ travelDate: '2028-02-29' })).travelDate).toBeUndefined();
    expect(bookingErrors(form({ travelDate: '2027-02-29' })).travelDate).toBeDefined();
  });
  it('wants a label for each additional detail, each used once', () => {
    const e = bookingErrors(form({ customFields: [{ label: 'Driver', value: 'a' }, { label: 'DRIVER', value: 'b' }, { ...blankDetail() }] }));
    expect(e['detail-1-label']).toBe('The label "DRIVER" is already used by additional detail 1. Please use each label once.');
    expect(e['detail-2-label']).toBe('Please enter a label for additional detail 3, or remove that line.');
    expect(e['detail-0-label']).toBeUndefined();
  });
  it('points at the first problem in the order the page shows them', () => {
    const f = form({ travelDate: '2027-02-31', travellers: [{ ...blankTraveller() }], payment: { totalAmount: 1, received: 5, balanceDueDate: '', note: '' } });
    const e = bookingErrors(f);
    expect(firstErrorKey(e, f)).toBe('travelDate');
    const g = form({ travellers: [{ ...blankTraveller() }], payment: { totalAmount: 1, received: 5, balanceDueDate: '', note: '' } });
    expect(firstErrorKey(bookingErrors(g), g)).toBe('traveller-0-name');
    expect(firstErrorKey({}, g)).toBeNull();
  });
});

describe('the printed view', () => {
  it('numbers the copy of the quotation with the confirmation number', () => {
    expect(quotationOf({ confirmationNo: '7H-CF-2026-004', quote: { quotationNo: '7H-QT-2026-009', destination: 'GOA' } })).toMatchObject({ quotationNo: '7H-CF-2026-004', destination: 'GOA', confirmationInfo: { no: '7H-CF-2026-004', status: 'Confirmed' } });
    expect(quotationOf(undefined)).toMatchObject({ quotationNo: '', packageDetails: { hotels: [] } });
  });
  it('shows what is typed (saved or not), leaves empty lines out, and works out the balance', () => {
    const v = bookingView({}, form({ travellers: [{ name: 'Aarav', age: '41', passportNo: '', notes: '' }, { ...blankTraveller() }], customFields: [{ label: 'Driver', value: 'Raju' }, { ...blankDetail() }] }));
    expect(v.travellers).toEqual([{ name: 'Aarav', age: 41, passportNo: '', notes: '' }]);
    expect(v.customFields).toEqual([{ label: 'Driver', value: 'Raju' }]);
    expect(v.payment.balance).toBe(80000);
  });
});

describe('confirmBlockedReason and needsOptionChoice', () => {
  it('allows an open quotation and explains every refusal', () => {
    expect(confirmBlockedReason({ status: 'Sent' })).toBeNull();
    expect(confirmBlockedReason({ status: 'Draft' })).toBeNull();
    expect(confirmBlockedReason({ status: 'Confirmed' })).toBeNull();
    expect(confirmBlockedReason({ status: 'Cancelled' })).toBe('This quotation is cancelled. Change its status before confirming it.');
    expect(confirmBlockedReason({ status: 'Expired' })).toMatch(/expired/);
    expect(confirmBlockedReason({ status: 'Sent', confirmationId: 'x', confirmationNo: '7H-CF-2026-001' })).toBe('Already confirmed as 7H-CF-2026-001.');
    expect(confirmBlockedReason(undefined)).toMatch(/could not be found/);
  });
  it('asks for a choice only when there are hotel options', () => {
    expect(needsOptionChoice({ options: [{}, {}] })).toBe(true);
    expect(needsOptionChoice({ options: [] })).toBe(false);
    expect(needsOptionChoice({})).toBe(false);
  });
});

describe('property', () => {
  it('whatever is typed, the errors are plain messages, never throw, and an error-free form always produces a payload the rules accept', () => {
    const text = fc.oneof(fc.string({ maxLength: 20 }), fc.constantFrom('', '41', '-3', '4.5', '2027-02-31', '2027-03-15', 'x'.repeat(150)));
    const traveller = fc.record({ name: text, age: text, passportNo: text, notes: text });
    const detail = fc.record({ label: text, value: text });
    const payment = fc.record({ totalAmount: fc.oneof(text, fc.integer({ min: -5, max: 1e6 })), received: fc.oneof(text, fc.integer({ min: -5, max: 1e6 })), balanceDueDate: text, note: text });
    fc.assert(
      fc.property(fc.record({ travelDate: text, travellers: fc.array(traveller, { maxLength: 4 }), payment, notes: fc.constant(''), customFields: fc.array(detail, { maxLength: 4 }) }), (f) => {
        const errors = bookingErrors(f);
        for (const message of Object.values(errors)) expect(typeof message).toBe('string');
        if (Object.keys(errors).length === 0) {
          const p = bookingPayload(f);
          expect(p.payment.received).toBeLessThanOrEqual(p.payment.totalAmount);
          expect(p.travellers.every((t) => t.name.length > 0 && (t.age === null || (Number.isInteger(t.age) && t.age >= 0 && t.age <= 120)))).toBe(true);
          expect(new Set(p.customFields.map((d) => d.label.toLowerCase())).size).toBe(p.customFields.length);
        } else {
          expect(firstErrorKey(errors, f)).toBeTruthy();
        }
      }),
      { numRuns: 300 }
    );
  });
});

describe('durationText', () => {
  it('reads a bare number as nights and leaves written durations alone', async () => {
    const { durationText } = await import('./confirmation');
    expect(durationText('7')).toBe('7 Nights');
    expect(durationText(' 1 ')).toBe('1 Night');
    expect(durationText('4 Nights / 5 Days')).toBe('4 Nights / 5 Days');
    expect(durationText(undefined)).toBe('');
    expect(quotationOf({ quote: { duration: '7' } }).duration).toBe('7 Nights');
  });
});
