import { describe, expect, it } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { generateQuotationDocx } from './quotationDocx';

const read = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result));
    reader.onerror = reject;
    reader.readAsArrayBuffer(blob);
  });
const open = async (quotation) => {
  const { blob } = await generateQuotationDocx(quotation);
  const xml = strFromU8(unzipSync(await read(blob))['word/document.xml']);
  const plain = xml.replace(/<w:br\/>/g, '\n').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ');
  return { xml, plain };
};
const wellFormed = (xml) => !new DOMParser().parseFromString(xml, 'application/xml').querySelector('parsererror');

// A quotation as it was saved before the pricing tables existed: only the old price list, plain-text lines, a flight and policies.
const oldPackage = (over = {}) => ({
  quotationNo: '7H-QT-2026-016', quotationType: 'Package', clientName: 'PARESH PATEL', destination: 'Bali', paxDetails: '3 Adults', duration: '3 Nights / 4 Days', travelDate: '2026-12-14',
  itinerary: [
    { dayNumber: 'Day 01', title: 'Arrival in Bali', description: 'Pick-up from the airport.\nCheck in and rest.', stay: 'Ubud', meals: 'Dinner' },
    { dayNumber: 'Day 02', title: 'Temples', description: '<p>Visit <strong>Tanah Lot</strong>.</p><ul><li>Uluwatu</li><li>Kecak dance</li></ul>' }
  ],
  packageDetails: { roomInfo: '1 Double + 1 Single', inclusions: ['Daily breakfast', 'Airport transfers'], hotels: [{ hotelName: 'Ubud Palace', city: 'Ubud', address: 'Jl. Raya 1', starRating: '4 star', roomCategory: 'Deluxe', mealPlan: 'Breakfast', nights: '3 Nights', contactNumber: '+62 361 123', email: 'stay@ubud.example', amenities: ['Pool', 'Spa'] }] },
  pricing: { items: [{ name: 'Land package', costPerPerson: 38500, note: 'Per person' }, { name: 'Hidden', costPerPerson: 1, isIncluded: false }], totalCostPerPerson: 38500, grandTotal: 115500, notes: 'GST extra' },
  flightDetails: [{ flightType: 'Departure', fromAirport: 'BOM', toAirport: 'DPS', airline: 'Garuda', flightNumber: 'GA 405', depTime: '10:20', arrTime: '19:05', baggageCheckIn: '20 kg' }],
  importantNotes: ['Rates are subject to availability'], paymentPolicy: ['50% advance'], cancellationPolicy: ['Non refundable within 7 days'], exclusions: ['Personal expenses'],
  ...over
});

describe('the Word file of an older quotation says everything the PDF says', () => {
  it('prints the trip, itinerary, hotel, room allocation, inclusions, flight, old price list and every policy', async () => {
    const { xml, plain } = await open(oldPackage());
    expect(wellFormed(xml)).toBe(true);
    for (const t of ['PACKAGE QUOTATION', 'PARESH PATEL', '3 Nights / 4 Days', 'Day 01: Arrival in Bali', 'Overnight: Ubud', 'Meals: Dinner', 'Pick-up from the airport.', 'Check in and rest.', 'Tanah Lot', 'Uluwatu', 'Kecak dance', '***End of the Tour***']) expect(plain).toContain(t);
    for (const t of ['Ubud Palace', '4 star', 'Deluxe', 'Jl. Raya 1', 'Breakfast', '3 Nights', '+62 361 123', 'stay@ubud.example', 'Pool', 'Spa', 'Room Allocation:', '1 Double + 1 Single', 'Daily breakfast', 'Airport transfers']) expect(plain).toContain(t);
    for (const t of ['Flight Details', 'Garuda GA 405', 'BOM', 'DPS', '10:20', '19:05', '20 kg']) expect(plain).toContain(t);
    for (const t of ['Pricing Breakdown', 'Land package: Rs 38,500 Per person', 'Rs 38,500 Per person (Incl of GST)', 'Total Package: Rs 1,15,500', 'GST extra']) expect(plain).toContain(t);
    expect(plain).not.toContain('Hidden');
    for (const t of ['Rates are subject to availability', '50% advance', 'Non refundable within 7 days', 'Personal expenses']) expect(plain).toContain(t);
    expect(xml).toMatch(/<w:b\/>[\s\S]{0,300}Tanah Lot/); // the bold of the day text becomes real Word bold
  });

  it('says so when a package has no itinerary yet, and leaves out sections that are empty', async () => {
    const { plain } = await open(oldPackage({ itinerary: [], flightDetails: [], pricing: {}, packageDetails: { hotels: [], inclusions: [] }, exclusions: [], paymentPolicy: [], cancellationPolicy: [], importantNotes: [] }));
    expect(plain).toContain('Detailed day-wise itinerary will be customized as per guest preference.');
    for (const t of ['Flight Details', 'Pricing Breakdown', 'Payment Policy', 'Exclusions', 'Terms']) expect(plain).not.toContain(t);
  });

  it('a hotel quotation that has an itinerary prints it too', async () => {
    const { plain } = await open(oldPackage({ quotationType: 'Only Hotel' }));
    expect(plain).toContain('HOTEL QUOTATION');
    expect(plain).toContain('Day 01: Arrival in Bali');
    expect(plain).toContain('Grand Total: Rs 1,15,500');
  });
});

describe('hotel options with prices', () => {
  const stay = (hotelName, over = {}) => ({ hotelName, city: 'Udaipur', address: 'Lake Road', starRating: '3 star', checkInDate: '2026-11-07', checkOutDate: '2026-11-09', ...over });
  const sheet = (name, package_) => ({ name, layout: 'sheet', rows: [{ label: 'Adult', package: package_, airfare: 0, visa: 0, tcs: 0, pax: 2 }] });

  it('puts each option\'s price table right under its hotels, and shows the rates of a hotel priced by rate rows', async () => {
    const { plain } = await open({
      quotationNo: 'Q1', quotationType: 'Only Hotel', clientName: 'Bhavika', destination: 'Udaipur', paxDetails: '4 Adults', duration: '2 Nights',
      options: [{ name: '3 Star', recommended: true, hotels: [stay('Hotel One')] }, { name: '4 Star', hotels: [stay('Hotel Two')] }],
      priceTables: [sheet('3 Star', 1000), sheet('4 Star', 3000)]
    });
    const at = (t) => plain.indexOf(t);
    expect(at('OPTION 1')).toBeGreaterThan(-1);
    expect(at('Hotel One')).toBeGreaterThan(at('OPTION 1'));
    expect(at('Rs 2,000')).toBeGreaterThan(at('Hotel One'));
    expect(at('OPTION 2')).toBeGreaterThan(at('Rs 2,000'));
    expect(at('Hotel Two')).toBeGreaterThan(at('OPTION 2'));
    expect(at('Rs 6,000')).toBeGreaterThan(at('Hotel Two'));
    expect(plain).toContain('RECOMMENDED');
    expect(plain).toContain('Check In: 07 Nov 2026');
    expect(plain).not.toContain('Pricing Sr No'); // no separate PRICING block when the options carry their prices
  });

  it('options without tables keep their price per person, or their rate rows', async () => {
    const rated = stay('Rated Hotel', { nights: '2 Nights', noOfRooms: '1 Room', rates: [{ kind: 'room', label: '2 Adults', rate: 5000 }] });
    const { plain } = await open({
      quotationNo: 'Q2', quotationType: 'Package', clientName: 'X', destination: 'Goa', duration: '2 Nights',
      options: [{ name: 'Basic', hotels: [stay('Plain Hotel')], pricePerPerson: 20000, totalPrice: 40000, priceNote: 'Per person' }, { name: 'Rates', hotels: [rated] }]
    });
    expect(plain).toContain('Price per person: Rs 20,000');
    expect(plain).toContain('Total: Rs 40,000');
    expect(plain).toContain('2 Adults');
    expect(plain).toContain('Grand Total: Rs 10,000'); // 5,000 x 2 nights x 1 room
  });
});

describe('a land service quotation', () => {
  it('prints the route, the vehicle table with its total, the note, the inclusions and the vehicle notes', async () => {
    const { xml, plain } = await open({
      quotationNo: 'Q3', quotationType: 'Land Service', clientName: 'Y', destination: 'Rajasthan', paxDetails: '6 Adults',
      landService: { route: 'Jaipur to Udaipur', pickupPoint: 'Jaipur airport', dropPoint: 'Udaipur hotel', kmPolicy: '300 km per day', priceNote: 'Toll extra' },
      vehicles: [{ vehicleType: 'Innova Crysta', seats: 6, acType: 'AC', quantity: 2, rate: 4500, notes: 'Driver speaks English' }],
      vehicleInclusions: ['Fuel', 'Driver allowance'], vehicleNotes: ['Night driving not allowed']
    });
    expect(wellFormed(xml)).toBe(true);
    for (const t of ['LAND SERVICE QUOTATION', 'Vehicle & Rates', 'Jaipur to Udaipur', 'Jaipur airport', '300 km per day', 'Innova Crysta', 'Driver speaks English', 'Rs 4,500', 'Rs 9,000', 'Total for the trip', 'Toll extra', 'Vehicle Inclusions', 'Fuel', 'Driver allowance', 'Points to be Noted (Vehicle Note)', 'Night driving not allowed']) expect(plain).toContain(t);
  });
});

describe('hostile or odd data', () => {
  it('prints markup in names as plain text and survives missing parts', async () => {
    const { xml, plain } = await open({ quotationType: 'Package', clientName: '<img src=x onerror=alert(1)>', destination: 'A & B', itinerary: [{ title: 'T', description: null }], packageDetails: { hotels: [{ hotelName: null }], inclusions: [null, '', '<b>ok</b>'] }, options: [], priceTables: null, pricing: null });
    expect(wellFormed(xml)).toBe(true);
    expect(plain).toContain('<img src=x onerror=alert(1)>');
    expect(plain).toContain('A & B');
    expect(plain).toContain('ok');
  });
});
