import mongoose from 'mongoose';

// One pricing option of a hotel or of a hotel quotation (Option 1, Option 2 ...): a row per kind of traveller with the Package,
// Airfare, Visa and TCS amounts per person and the number of persons (PAX). Totals are never stored: they are worked out from these
// (see utils/quotationPriceTables.js), so they can never disagree.
const priceRowSchema = new mongoose.Schema(
  {
    label: { type: String, required: true },
    package: { type: Number, default: 0 },
    airfare: { type: Number, default: 0 },
    visa: { type: Number, default: 0 },
    tcs: { type: Number, default: 0 },
    pax: { type: Number, default: 0 }
  },
  { _id: false }
);

export const priceTableSchema = new mongoose.Schema({ name: { type: String, default: '' }, rows: { type: [priceRowSchema], default: [] } }, { _id: false });
