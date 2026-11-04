import mongoose from 'mongoose';

// A hotel found with the hotel finder and saved in the app: what a hotel's website said about it, kept for the sales team to look at,
// edit, download, and (when it is a hotel the company works with) add to the hotel list. It is not the hotel list: nothing here is
// offered on a quotation until someone adds it there.

const photoSchema = new mongoose.Schema(
  {
    token: { type: String, required: true },
    width: { type: Number, required: true },
    height: { type: Number, required: true },
    caption: { type: String, default: '' }
  },
  { _id: false }
);

const foundHotelSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    // "name|city" in lower case: the same hotel is not saved twice (see utils/hotelInput.nameKeyOf)
    nameKey: { type: String, required: true },
    propertyType: { type: String, default: '' },
    starRating: { type: String, default: 'Unrated' },
    tagline: { type: String, default: '' },
    description: { type: String, default: '' }, // plain text, as found
    address: {
      full: { type: String, default: '' },
      street: { type: String, default: '' },
      locality: { type: String, default: '' }, // the city
      region: { type: String, default: '' },
      postalCode: { type: String, default: '' },
      country: { type: String, default: '' }
    },
    geo: { type: { lat: Number, lng: Number }, default: null, _id: false },
    phones: { type: [String], default: [] },
    emails: { type: [String], default: [] },
    website: { type: String, default: '' },
    social: { type: [{ network: String, url: String, _id: false }], default: [] },
    checkIn: { type: String, default: '' },
    checkOut: { type: String, default: '' },
    amenities: { type: [String], default: [] },
    rooms: { type: [{ name: String, details: { type: String, default: '' }, _id: false }], default: [] },
    rates: {
      type: {
        currency: String,
        from: Number,
        to: Number,
        unit: String,
        text: String,
        note: String,
        lines: { type: [{ text: String, from: Number, to: Number, unit: String, _id: false }], default: [] }
      },
      default: null,
      _id: false
    },
    priceLevel: { type: Number, default: 0 },
    guestRating: { type: { value: Number, best: Number, count: Number }, default: null, _id: false },
    policies: {
      cancellation: { type: String, default: '' },
      children: { type: String, default: '' },
      pets: { type: String, default: '' }
    },
    photos: { type: [photoSchema], default: [] }, // copied into the app's photo storage when the find was saved
    notes: { type: String, default: '' }, // internal
    tags: { type: [String], default: [] },
    sourceUrl: { type: String, default: '' },
    sourceSite: { type: String, default: '' },
    source: { type: String, enum: ['website', 'pasted', 'manual'], default: 'website' },
    completeness: { type: { score: Number, found: [String], missing: [String] }, default: null, _id: false },
    warnings: { type: [String], default: [] },
    pagesRead: { type: [{ url: String, label: String, _id: false }], default: [] },
    fieldLevels: { type: Map, of: String, default: {} }, // what the finder was sure about, by field: high | medium | low
    foundAt: { type: Date, default: Date.now },
    status: { type: String, enum: ['Saved', 'Added'], default: 'Saved' },
    hotelId: { type: String, default: '' }, // the hotel list record this one became
    addedAt: { type: Date, default: null },
    deleted: { type: Boolean, default: false },
    createdBy: { type: String, required: true },
    createdByName: { type: String, default: '' },
    updatedBy: { type: String, default: '' },
    updatedByName: { type: String, default: '' }
  },
  { timestamps: true }
);

foundHotelSchema.index({ nameKey: 1 }, { unique: true, partialFilterExpression: { deleted: false } });
foundHotelSchema.index({ deleted: 1, status: 1, updatedAt: -1 });

export const FoundHotelModel = mongoose.model('FoundHotel', foundHotelSchema);
export default FoundHotelModel;
