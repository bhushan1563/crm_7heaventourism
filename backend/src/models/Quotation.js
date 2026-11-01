import mongoose from 'mongoose';

const parseDateValue = (val) => {
  if (!val || val === '' || val === null || val === undefined) return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
};

// A photo on a day of the itinerary: a reference to a stored photo (see Media), with its size and an optional caption.
const dayPhotoSchema = new mongoose.Schema({
  token: { type: String, required: true },
  width: { type: Number, required: true },
  height: { type: Number, required: true },
  caption: { type: String, default: '' }
}, { _id: false });

const itineraryDaySchema = new mongoose.Schema({
  dayNumber: { type: String, default: 'Day 01' },
  title: { type: String, default: '' },
  description: { type: String, default: '' }, // plain text (older quotations) or formatted text (sanitised on the server)
  stay: { type: String, default: '' },
  meals: { type: String, default: '' },
  photos: { type: [dayPhotoSchema], default: [] }
}, { _id: false });

const hotelStaySchema = new mongoose.Schema({
  nights: { type: String, default: '1 Night' },
  city: { type: String, default: '' },
  hotelName: { type: String, default: '' },
  starRating: { type: String, default: '4 star' },
  roomCategory: { type: String, default: 'Deluxe Room' },
  mealPlan: { type: String, default: 'CP (Breakfast Only)' },
  checkInDate: { type: Date, default: null, set: parseDateValue },
  checkOutDate: { type: Date, default: null, set: parseDateValue },
  noOfRooms: { type: String, default: '1 Room' },
  address: { type: String, default: '' },
  contactNumber: { type: String, default: '' },
  contactPerson: { type: String, default: '' },
  email: { type: String, default: '' },
  notes: { type: String, default: '' },
  // When the stay was taken from the hotel list: which hotel, and a copy of what was shown, so editing the hotel later
  // never changes a quotation that was already sent.
  hotelId: { type: String, default: '' },
  photos: { type: [dayPhotoSchema], default: [] },
  amenities: { type: [String], default: [] },
  roomOptions: { type: [String], default: [] }, // the room types the hotel offers (suggestions for "Room category")
  checkInTime: { type: String, default: '' },
  checkOutTime: { type: String, default: '' }
}, { _id: false });

const pricingItemSchema = new mongoose.Schema({
  id: { type: String, default: '' },
  name: { type: String, default: '' },
  costPerPerson: { type: Number, default: 0 },
  totalCost: { type: Number, default: 0 },
  note: { type: String, default: '' },
  isIncluded: { type: Boolean, default: true },
  type: { type: String, default: 'per_person' } // 'per_person' | 'fixed'
}, { _id: false });

const flightSegmentSchema = new mongoose.Schema({
  flightType: { type: String, default: 'Departure' }, // Departure, Return, Connecting
  departureDate: { type: Date, default: null, set: parseDateValue },
  route: { type: String, default: '' }, // e.g. Ahmedabad -> Varanasi
  cabinClass: { type: String, default: 'Economy - Normal' },
  airline: { type: String, default: 'Indigo' },
  flightNumber: { type: String, default: '' },
  operatedBy: { type: String, default: 'Operated by: Indigo' },
  fromAirport: { type: String, default: '' }, // e.g. AMD - Ahmedabad
  depTime: { type: String, default: '' },
  depDate: { type: Date, default: null, set: parseDateValue },
  depTerminal: { type: String, default: '' },
  duration: { type: String, default: '' }, // e.g. 01H:50M
  flightStop: { type: String, default: 'Non-stop' },
  toAirport: { type: String, default: '' }, // e.g. VNS - Varanasi
  arrTime: { type: String, default: '' },
  arrDate: { type: Date, default: null, set: parseDateValue },
  arrTerminal: { type: String, default: '' },
  baggageCheckIn: { type: String, default: '15 kg' },
  baggageCabin: { type: String, default: '7 kg' }
}, { _id: false });

const quotationSchema = new mongoose.Schema({
  quotationNo: {
    type: String,
    required: true,
    unique: true
  },
  quotationType: {
    type: String,
    enum: ['Only Hotel', 'Package', 'Events / Corporate'],
    default: 'Package'
  },
  guestId: {
    type: String,
    default: null
  },
  clientName: {
    type: String,
    required: true
  },
  clientEmail: {
    type: String,
    default: ''
  },
  clientPhone: {
    type: String,
    default: ''
  },
  destination: {
    type: String,
    required: true
  },
  duration: {
    type: String,
    default: '3 Nights / 4 Days'
  },
  paxDetails: {
    type: String,
    default: '3 Adults'
  },
  travelDate: {
    type: Date,
    default: null,
    set: parseDateValue
  },
  validUntil: {
    type: Date,
    default: null,
    set: parseDateValue
  },
  status: {
    type: String,
    enum: ['Draft', 'Follow up', 'Sent', 'Confirmed', 'Revised', 'Expired', 'Cancelled'],
    default: 'Draft'
  },
  sales: {
    type: String,
    default: ''
  },
  salesId: {
    type: String,
    default: null
  },
  ops: {
    type: String,
    default: ''
  },
  opsId: {
    type: String,
    default: null
  },
  companyDetails: {
    name: { type: String, default: '7HEAVEN TOURISM' },
    tagline: { type: String, default: 'Travel with the Trust' },
    description: { type: String, default: 'Tour Package, Visa Service, Flight Tickets, Cruises & Hotel Bookings' },
    address: { type: String, default: '405 (FOF) Kanha Capital, Above IDFC bank, Opp Express Tower Hotel, Alkapuri 390007, Vadodara' },
    phone: { type: String, default: '+91 7862829178' },
    email: { type: String, default: 'sales@7heaventourism.in' },
    website: { type: String, default: 'www.7heaventourism.in' }
  },
  itinerary: [itineraryDaySchema],
  endOfTourNote: {
    type: String,
    default: '***End of the Tour***'
  },
  packageDetails: {
    hotels: [hotelStaySchema],
    roomInfo: { type: String, default: '2 Rooms' },
    inclusions: [{ type: String }]
  },
  pricing: {
    packageCostPerPerson: { type: Number, default: 0 },
    packageCostNote: { type: String, default: 'Per person' },
    airfareCostPerPerson: { type: Number, default: 0 },
    airfareCostNote: { type: String, default: 'Per person' },
    otherCostPerPerson: { type: Number, default: 0 },
    otherCostNote: { type: String, default: 'Per person' },
    totalCostPerPerson: { type: Number, default: 0 },
    totalCostNote: { type: String, default: 'Rs 0 Per person (Incl of GST)' },
    grandTotal: { type: Number, default: 0 },
    currency: { type: String, default: 'Rs' },
    notes: { type: String, default: '' },
    items: [pricingItemSchema]
  },
  asPerFlightTicket: {
    type: Boolean,
    default: false
  },
  flightTicketNote: {
    type: String,
    default: 'Flight details will be as per confirmed flight ticket'
  },
  flightTicketUrl: {
    type: String,
    default: ''
  },
  flightDetails: [flightSegmentSchema],
  exclusions: [{ type: String }],
  paymentPolicy: [{ type: String }],
  cancellationPolicy: [{ type: String }],
  vehicleNotes: [{ type: String }],
  importantNotes: [{ type: String }],
  isLocked: {
    type: Boolean,
    default: false
  },
  deleted: {
    type: Boolean,
    default: false
  },
  createdBy: {
    type: String,
    required: true
  },
  createdByName: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
});

quotationSchema.index({ deleted: 1, createdAt: -1 });

export const QuotationModel = mongoose.model('Quotation', quotationSchema);
export default QuotationModel;
