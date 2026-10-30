import mongoose from 'mongoose';

const supplierSchema = new mongoose.Schema({
  supplierName: {
    type: String,
    required: true,
    trim: true
  },
  category: {
    type: String,
    enum: [
      'All',
      'Domestic',
      'International',
      'Flight Consolidator',
      'Visa',
      'General'
    ],
    required: true
  },
  contactPerson: {
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
  phone: {
    type: String,
    required: true,
    trim: true
  },
  city: {
    type: String,
    default: ''
  },
  country: {
    type: String,
    default: 'India'
  },
  services: {
    type: String,
    default: ''
  },
  rating: {
    type: Number,
    min: 1,
    max: 5,
    default: 5
  },
  active: {
    type: Boolean,
    default: true
  },
  deleted: {
    type: Boolean,
    default: false
  },
  notes: {
    type: String,
    default: ''
  },
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

supplierSchema.index({ deleted: 1, createdAt: -1 });

export const SupplierModel = mongoose.model('Supplier', supplierSchema);
export default SupplierModel;
