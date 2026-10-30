import mongoose from 'mongoose';

const parseDateValue = (val) => {
  if (!val || val === '' || val === null || val === undefined) return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
};

const guestSchema = new mongoose.Schema({
  srNo: {
    type: String,
    required: true,
    unique: true
  },
  inquiryDate: {
    type: Date,
    required: true,
    default: Date.now,
    set: parseDateValue
  },
  guestNames: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: false,
    trim: true,
    default: ''
  },
  contactNumber: {
    type: String,
    required: true,
    trim: true
  },
  destination: {
    type: String,
    required: true,
    trim: true
  },
  travelDate: {
    type: Date,
    required: true,
    set: parseDateValue
  },
  status: {
    type: String,
    enum: [
      'Under Process',
      'Follow up',
      'Quoted',
      'Confirmed',
      'Confirmed & Payment received',
      'Travelled',
      'Cancelled'
    ],
    default: 'Under Process'
  },
  sales: {
    type: String,
    required: true,
    trim: true
  },
  salesId: {
    type: String,
    default: ''
  },
  ops: {
    type: String,
    required: true,
    trim: true
  },
  opsId: {
    type: String,
    default: ''
  },
  paxCount: {
    type: Number,
    default: 2
  },
  budget: {
    type: String,
    default: ''
  },
  notes: {
    type: String,
    default: ''
  },
  isLocked: {
    type: Boolean,
    default: false
  },
  deleted: {
    type: Boolean,
    default: false
  },
  followUpNotes: [{
    date: { type: String, default: () => new Date().toISOString() },
    note: { type: String, default: '' },
    channel: { type: String, default: 'WhatsApp' }, // WhatsApp, Phone, Email, Note
    by: { type: String, default: '' }
  }],
  createdBy: {
    type: String,
    required: true
  },
  createdByName: {
    type: String,
    default: ''
  },
  updatedBy: {
    type: String,
    default: ''
  },
  updatedByName: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
});

export const GuestModel = mongoose.model('Guest', guestSchema);
export default GuestModel;
