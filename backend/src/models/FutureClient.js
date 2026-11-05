import mongoose from 'mongoose';

// A person who may travel with us one day: not yet an inquiry on the guest list, just someone to keep in touch with.
const futureClientSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, default: '', trim: true },
    email: { type: String, default: '', trim: true },
    destination: { type: String, default: '', trim: true }, // where they would like to go
    expectedTravel: { type: String, default: '', trim: true }, // when, as they said it: "December 2026", "after Diwali"
    budget: { type: String, default: '', trim: true },
    source: { type: String, default: '', trim: true }, // how they came to us: Instagram, a reference, a walk-in
    notes: { type: String, default: '' },
    createdBy: { type: String, required: true },
    createdByName: { type: String, default: '' },
    updatedBy: { type: String, default: '' },
    updatedByName: { type: String, default: '' }
  },
  { timestamps: true }
);

futureClientSchema.index({ createdAt: -1 });

export const FutureClientModel = mongoose.model('FutureClient', futureClientSchema);
export default FutureClientModel;
