import mongoose from 'mongoose';

// A visa in the company's visa list: one product (a country, a kind of visa and an entry type) with what it needs and what it usually
// costs, saved once and picked in visa quotations instead of typing it again. It is kept forever: visas are archived, not destroyed,
// and a quotation that used one keeps its own copy, so later edits here never change a quotation that was already sent.

const feeSchema = new mongoose.Schema(
  {
    label: { type: String, required: true },
    amount: { type: Number, default: 0 },
    per: { type: String, enum: ['applicant', 'group'], default: 'applicant' }
  },
  { _id: false }
);

const visaSchema = new mongoose.Schema(
  {
    country: { type: String, required: true, trim: true },
    visaType: { type: String, default: '', trim: true }, // e.g. Tourist, Business
    entryType: { type: String, default: '' }, // Single entry, Double entry, Multiple entry
    mode: { type: String, default: '', trim: true }, // how it is issued, e.g. e-Visa
    validity: { type: String, default: '', trim: true },
    stay: { type: String, default: '', trim: true },
    processingTime: { type: String, default: '', trim: true },
    // "country|type|entry" in lower case with single spaces: the same visa cannot be added twice, however it was typed.
    nameKey: { type: String, required: true },
    documents: { type: [String], default: [] }, // the checklist (formatted lines)
    fees: { type: [feeSchema], default: [] }, // the usual fee lines: per applicant or once for the group
    inclusions: { type: [String], default: [] }, // formatted lines
    priceNote: { type: String, default: '' }, // printed under the fees (formatted)
    notes: { type: String, default: '' }, // internal: never printed
    status: { type: String, enum: ['Active', 'Archived'], default: 'Active' },
    deleted: { type: Boolean, default: false },
    createdBy: { type: String, required: true },
    createdByName: { type: String, default: '' },
    updatedBy: { type: String, default: '' },
    updatedByName: { type: String, default: '' }
  },
  { timestamps: true }
);

visaSchema.index({ nameKey: 1 }, { unique: true, partialFilterExpression: { deleted: false } });
visaSchema.index({ deleted: 1, status: 1, updatedAt: -1 });
visaSchema.index({ deleted: 1, country: 1 });

export const VisaModel = mongoose.model('Visa', visaSchema);
export default VisaModel;
