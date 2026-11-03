import mongoose from 'mongoose';

// One pricing option of a hotel or package quotation (Option 1, Option 2 ...), in one of two layouts (see utils/quotationPriceTables.js):
// "sheet": a row per kind of traveller with the Package, Airfare, Visa and TCS amounts per person and the number of persons (PAX);
// "rooms": a row per kind of guest with the rate per room per night, the nights and the rooms. Totals are never stored: they are worked
// out from these, so they can never disagree. A table saved before there were two layouts has none stored and is a sheet.
// A row keeps only the figures of its own layout (no defaults): the server's checks always write every figure that layout has, and the
// nights and rooms of a "rooms" row are null while they follow the trip.
const priceRowSchema = new mongoose.Schema(
  {
    label: { type: String, required: true },
    // sheet
    package: { type: Number, default: undefined },
    airfare: { type: Number, default: undefined },
    visa: { type: Number, default: undefined },
    tcs: { type: Number, default: undefined },
    pax: { type: Number, default: undefined },
    // rooms
    rate: { type: Number, default: undefined },
    nights: { type: Number, default: undefined },
    rooms: { type: Number, default: undefined }
  },
  { _id: false }
);

export const priceTableSchema = new mongoose.Schema(
  { name: { type: String, default: '' }, layout: { type: String, enum: ['sheet', 'rooms'], default: 'sheet' }, rows: { type: [priceRowSchema], default: [] } },
  { _id: false }
);
