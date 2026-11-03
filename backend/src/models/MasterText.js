import mongoose from 'mongoose';

// The standard Notes and Policy texts of the company: what every NEW quotation starts with (important notes, payment policy,
// cancellation policy, exclusions, vehicle notes). One record, edited by an Admin on the "Notes & Policies" screen. A quotation that
// was already made keeps its own copy, so changing the standard text never changes what a client was sent. When there is no record
// the browser uses the built-in standard text. Each line is plain or formatted text (cleaned on the server).

export const MASTER_TEXT_KEY = 'quotation-text';

const masterTextSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, default: MASTER_TEXT_KEY },
    importantNotes: { type: [String], default: [] },
    paymentPolicy: { type: [String], default: [] },
    cancellationPolicy: { type: [String], default: [] },
    exclusions: { type: [String], default: [] },
    vehicleNotes: { type: [String], default: [] },
    updatedBy: { type: String, default: '' },
    updatedByName: { type: String, default: '' }
  },
  { timestamps: true, minimize: false }
);

masterTextSchema.index({ key: 1 }, { unique: true });

export const MasterTextModel = mongoose.model('MasterText', masterTextSchema);
export default MasterTextModel;
