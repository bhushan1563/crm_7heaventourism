import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  title:       { type: String, required: true, trim: true },
  kind:        { type: String, enum: ['payment', 'confirmation', 'quotation', 'guest'], default: 'payment' },
  start:       { type: String, required: true }, // YYYY-MM-DD
  end:         { type: String, required: true }, // YYYY-MM-DD (same as start for single-day events)
  destination: { type: String, trim: true, default: '' },
  amount:      { type: String, trim: true, default: '' }, // e.g. "Rs 10,000"
  supplier:    { type: String, trim: true, default: '' }, // who the payment is due to
  notes:       { type: String, trim: true, default: '' },
  createdBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

export default mongoose.model('ManualCalendarEvent', schema);
