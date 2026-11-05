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

  it('has them when the booking says the voucher shows prices', async () => {
    const plain = await open(booking({ showPricing: true }));
    for (const text of ['Payment', 'Total amount', 'Rs 1,20,000', 'Balance to pay', 'Rs 80,000', 'Advance by cheque', 'Pricing', 'Grand Total', 'Rs 50,000']) expect(plain).toContain(text);
  });
});
