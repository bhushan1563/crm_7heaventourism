import mongoose from 'mongoose';

// A saved itinerary for a destination. Staff keep these in a library and copy one into a quotation, confirmation or land
// service quotation (the copy can be edited without changing the library original).

const photoSchema = new mongoose.Schema(
  {
    token: { type: String, required: true },
    width: { type: Number, required: true },
    height: { type: Number, required: true },
    caption: { type: String, default: '' }
  },
  { _id: false }
);

const daySchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: { type: String, default: '' }, // formatted text (sanitised on the server)
    meals: { type: String, default: '' },
    stay: { type: String, default: '' },
    photos: { type: [photoSchema], default: [] }
  },
  { _id: false }
);

const itinerarySchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    destination: { type: String, required: true, trim: true },
    country: { type: String, default: '', trim: true },
    nights: { type: Number, default: 0, min: 0 },
    summary: { type: String, default: '' }, // formatted text
    photos: { type: [photoSchema], default: [] }, // the itinerary's own gallery; the first photo is its cover
    days: { type: [daySchema], default: [] },
    inclusions: { type: [String], default: [] },
    exclusions: { type: [String], default: [] },
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

// The list screen: newest first within a status, and quick lookups by destination.
itinerarySchema.index({ deleted: 1, status: 1, updatedAt: -1 });
itinerarySchema.index({ deleted: 1, destination: 1 });

export const ItineraryModel = mongoose.model('Itinerary', itinerarySchema);
export default ItineraryModel;
