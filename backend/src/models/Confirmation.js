import mongoose from 'mongoose';

// A booking confirmation: what a quotation becomes once the client accepts it. It holds a frozen copy of the quotation as it was
// sold (`quote`: itinerary, hotels, prices, terms) and the booking information added at conversion: travellers, payment and
// whatever else the company wants to record. Confirmations are cancelled, never deleted, and a quotation has at most one live
// confirmation (the partial unique index below), so two people confirming it at the same moment cannot create two.

const parseDateValue = (val) => {
  if (!val) return null;
  if (val instanceof Date) return Number.isNaN(val.getTime()) ? null : val;
  const d = new Date(val);
  return Number.isNaN(d.getTime()) ? null : d;
};

const travellerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    age: { type: Number, default: null },
    passportNo: { type: String, default: '' },
    notes: { type: String, default: '' }
  },
  { _id: false }
);

const customFieldSchema = new mongoose.Schema(
  {
    label: { type: String, required: true },
    value: { type: String, default: '' }
  },
  { _id: false }
);

// What the hotel gave once the room was booked, one entry for each hotel of the copy of the quotation (the same order): the hotel's
// own confirmation number, its contact number, and the check-in and check-out time.
const hotelBookingSchema = new mongoose.Schema(
  {
    confirmationNo: { type: String, default: '' },
    contactNumber: { type: String, default: '' },
    checkInTime: { type: String, default: '' },
    checkOutTime: { type: String, default: '' }
  },
  { _id: false }
);

// A person the guests can call during the trip (the tour coordinator, the emergency contact): a name and one or more numbers.
const contactSchema = new mongoose.Schema(
  {
    name: { type: String, default: '' },
    numbers: { type: [String], default: [] }
  },
  { _id: false }
);

const confirmationSchema = new mongoose.Schema(
  {
    confirmationNo: { type: String, required: true },
    quotationId: { type: String, required: true },
    quotationNo: { type: String, default: '' },
    guestId: { type: String, default: '' },

    // What the list screen shows, copied from the quotation so the list never has to open the (large) copy.
    clientName: { type: String, default: '' },
    clientEmail: { type: String, default: '' },
    clientPhone: { type: String, default: '' },
    destination: { type: String, default: '' },
    duration: { type: String, default: '' },
    paxDetails: { type: String, default: '' },
    quotationType: { type: String, default: '' },
    travelDate: { type: Date, default: null, set: parseDateValue },
    optionName: { type: String, default: '' }, // the hotel option the client accepted, when the quotation offered several

    quote: { type: mongoose.Schema.Types.Mixed, default: {} },

    status: { type: String, enum: ['Confirmed', 'Cancelled'], default: 'Confirmed' },
    confirmedAt: { type: Date, default: Date.now },

    // The booking information added at conversion.
    travellers: { type: [travellerSchema], default: [] },
    payment: {
      totalAmount: { type: Number, default: 0 },
      received: { type: Number, default: 0 },
      balanceDueDate: { type: Date, default: null, set: parseDateValue },
      supplier: { type: String, default: '' }, // who the balance is paid to; shown on the travel calendar's payment deadline
      note: { type: String, default: '' }
    },
    // Whether the confirmation voucher prints the payment details and the prices. A voucher usually carries none, so it is off unless chosen.
    showPricing: { type: Boolean, default: false },
    contacts: {
      coordinator: { type: contactSchema, default: () => ({}) },
      emergency: { type: contactSchema, default: () => ({}) }
    },
    hotelBookings: { type: [hotelBookingSchema], default: [] }, // per hotel of the copy: its confirmation number, contact number and times
    notes: { type: String, default: '' }, // formatted text (sanitised on the server), printed on the confirmation
    customFields: { type: [customFieldSchema], default: [] }, // "Additional details": label + value, for what the client adds to their list

    // Kept so that cancelling puts things back as they were.
    previousQuotationStatus: { type: String, default: '' },
    previousQuotationLocked: { type: Boolean, default: false },
    previousGuestStatus: { type: String, default: '' },
    cancelledAt: { type: Date, default: null },
    cancelledByName: { type: String, default: '' },
    cancelReason: { type: String, default: '' },

    // Who it belongs to, in the shape the ownership check reads (copied from the quotation).
    sales: { type: String, default: '' },
    salesId: { type: String, default: '' },
    ops: { type: String, default: '' },
    opsId: { type: String, default: '' },
    createdBy: { type: String, required: true },
    createdByName: { type: String, default: '' },
    updatedBy: { type: String, default: '' },
    updatedByName: { type: String, default: '' }
  },
  { timestamps: true, minimize: false }
);

confirmationSchema.index({ confirmationNo: 1 }, { unique: true });
confirmationSchema.index({ quotationId: 1 }, { unique: true, partialFilterExpression: { status: 'Confirmed' } });
confirmationSchema.index({ status: 1, updatedAt: -1 });

export const ConfirmationModel = mongoose.model('Confirmation', confirmationSchema);
export default ConfirmationModel;
