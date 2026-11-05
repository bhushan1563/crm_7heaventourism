import { describe, expect, it } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { generateConfirmationDocx } from './quotationDocx';
import { bookingView, quotationOf } from './confirmation';

// The Word file of a booking confirmation follows the same switch as the page and the PDF: no payment and no price tables unless the
// booking says the voucher shows prices.

const read = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result));
    reader.onerror = reject;
    reader.readAsArrayBuffer(blob);
  });
const open = async (confirmation) => {
  const { blob } = await generateConfirmationDocx(quotationOf(confirmation), bookingView(confirmation), confirmation);
  const xml = strFromU8(unzipSync(await read(blob))['word/document.xml']);
  return xml.replace(/<w:br\/>/g, '\n').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
};

const booking = (over = {}) => ({
  _id: 'c1', confirmationNo: '7H-CF-2026-001', quotationNo: '7H-QT-2026-004', clientName: 'Aarav Mehta', destination: 'UDAIPUR', duration: '2 Nights', paxDetails: '2 Adults',
  status: 'Confirmed', confirmedAt: '2026-11-01T10:00:00.000Z', travelDate: '2027-04-10T00:00:00.000Z',
  travellers: [{ name: 'Aarav Mehta', age: 41, passportNo: 'Z1234567', notes: '' }],
  payment: { totalAmount: 120000, received: 40000, balanceDueDate: '2027-03-01T00:00:00.000Z', note: 'Advance by cheque' },
  contacts: { coordinator: { name: 'Ravi Shah', numbers: ['+91 98765 43210', '0294 242 8800'] }, emergency: { name: 'Office', numbers: ['+91 99999 11111'] } },
  notes: '', customFields: [],
  quote: {
    quotationNo: '7H-QT-2026-004', quotationType: 'Only Hotel', clientName: 'Aarav Mehta', destination: 'UDAIPUR', paxDetails: '2 Adults',
    packageDetails: { hotels: [{ hotelName: 'Hotel Sunrise', city: 'Udaipur', address: 'Lake Road', checkInDate: '2027-04-10', checkOutDate: '2027-04-12', nights: '2 Nights' }], inclusions: [] },
    priceTables: [{ name: 'Option 1', layout: 'sheet', rows: [{ label: 'Adult', package: 25000, airfare: 0, visa: 0, tcs: 0, pax: 2 }] }],
    pricing: { grandTotal: 50000, totalCostPerPerson: 25000, totalCostNote: 'Rs 25,000 Per person', items: [] }
  },
  ...over
});

describe('the Word file of a booking confirmation', () => {
  it('has no payment table and no pricing tables unless the booking shows prices, and keeps everything else', async () => {
    const plain = await open(booking());
    expect(plain.toUpperCase()).toContain('BOOKING CONFIRMATION');
    for (const text of ['Aarav Mehta', 'Hotel Sunrise', 'Tour coordinator', 'Ravi Shah', '+91 98765 43210', '0294 242 8800', 'Emergency contact']) expect(plain).toContain(text);
    for (const text of ['Payment', 'Total amount', 'Balance to pay', 'Rs 1,20,000', 'Rs 80,000', 'Advance by cheque', 'Pricing', 'Grand Total', 'Rs 50,000']) expect(plain).not.toContain(text);
  });

  it('has each itinerary day heading in bold blue', async () => {
    const { blob } = await generateConfirmationDocx(
      quotationOf(booking({ quote: { ...booking().quote, quotationType: 'Package', itinerary: [{ dayNumber: 'Day 01', title: 'Arrival in Udaipur', description: 'Meet and greet' }] } })),
      bookingView(booking()),
      booking()
    );
    const xml = strFromU8(unzipSync(await read(blob))['word/document.xml']);
    const at = xml.indexOf('Day 01: Arrival in Udaipur');
    expect(at).toBeGreaterThan(-1);
    const paragraph = xml.slice(xml.lastIndexOf('<w:p>', at), xml.indexOf('</w:p>', at));
    expect(paragraph).toContain('<w:b/>');
    expect(paragraph).toMatch(/w:color w:val="1D4ED8"/i);
  });

  it('ends with "General Policy": the booking\'s additional services and important notes first, then the standard terms and policies', async () => {
    const plain = await open(booking({
      additionalServices: '<p>Airport transfer</p><p>Candle-light dinner</p>',
      importantNotes: '<ul><li>Carry a passport</li></ul>',
      quote: { ...booking().quote, importantNotes: ['Standard term one.'], paymentPolicy: ['25% advance.'], cancellationPolicy: ['10% fee.'], exclusions: ['Airfare'] }
    }));
    const at = ['General Policy', 'Additional Services', 'Airport transfer', 'Candle-light dinner', 'Important Notes', 'Carry a passport', 'Terms', 'Standard term one.', 'Payment Policy', '25% advance.', 'Cancellation Policy', '10% fee.', 'Exclusions', 'Airfare'].map((t) => plain.lastIndexOf(t));
    expect(at.every((n) => n >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(plain.lastIndexOf('General Policy')).toBeGreaterThan(plain.indexOf('Hotel Sunrise')); // after the trip, on the last page
  });

  it('has no General Policy section when there is nothing to put in it', async () => {
    const plain = await open(booking());
    expect(plain).not.toContain('General Policy');
    expect(plain).not.toContain('Additional Services');
  });

  it('has them when the booking says the voucher shows prices', async () => {
    const plain = await open(booking({ showPricing: true }));
    for (const text of ['Payment', 'Total amount', 'Rs 1,20,000', 'Balance to pay', 'Rs 80,000', 'Advance by cheque', 'Pricing', 'Grand Total', 'Rs 50,000']) expect(plain).toContain(text);
  });
});
