import mongoose from 'mongoose';

// A hotel in the company's hotel list. It is kept forever: hotels are archived, not destroyed, and a quotation that used a
// hotel keeps its own copy of what it showed, so later edits here never change a quotation that was already sent.

const photoSchema = new mongoose.Schema(
  {
    token: { type: String, required: true },
    width: { type: Number, required: true },
    height: { type: Number, required: true },
    caption: { type: String, default: '' }
  },
  { _id: false }
);

const roomTypeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    details: { type: String, default: '' } // e.g. "King bed, sea view, 38 sq m"
  },
  { _id: false }
);

const hotelSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    // "name|city" in lower case with single spaces: the same hotel cannot be added twice, however it was typed.
    nameKey: { type: String, required: true },
    city: { type: String, required: true, trim: true },
    country: { type: String, default: '', trim: true },
    area: { type: String, default: '', trim: true }, // locality, e.g. "Seminyak" or "near the airport"
    address: { type: String, default: '', trim: true },
    starRating: { type: String, default: 'Unrated' },
    description: { type: String, default: '' }, // formatted text (sanitised on the server)
    photos: { type: [photoSchema], default: [] }, // the first photo is the cover
    contactPerson: { type: String, default: '' },
    phone: { type: String, default: '' },
    email: { type: String, default: '' },
    website: { type: String, default: '' },
    checkInTime: { type: String, default: '14:00' },
    checkOutTime: { type: String, default: '11:00' },
    amenities: { type: [String], default: [] },
    roomTypes: { type: [roomTypeSchema], default: [] },
    mealPlans: { type: [String], default: [] }, // the meal plans this hotel offers
    cancellationPolicy: { type: String, default: '' }, // printed on quotations
    notes: { type: String, default: '' }, // internal: never printed
    tags: { type: [String], default: [] },
    status: { type: String, enum: ['Active', 'Archived'], default: 'Active' },
    deleted: { type: Boolean, default: false },
    createdBy: { type: String, required: true },
    createdByName: { type: String, default: '' },
    updatedBy: { type: String, default: '' },
    updatedByName: { type: String, default: '' }
  },
  { timestamps: true }
);

// One live record per hotel (archived ones count: restore it instead of adding it again).
hotelSchema.index({ nameKey: 1 }, { unique: true, partialFilterExpression: { deleted: false } });
// The list screen: newest first within a status, and quick lookups by city.
hotelSchema.index({ deleted: 1, status: 1, updatedAt: -1 });
hotelSchema.index({ deleted: 1, city: 1 });

export const HotelModel = mongoose.model('Hotel', hotelSchema);
export default HotelModel;
