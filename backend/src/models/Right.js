import mongoose from 'mongoose';

const rightSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: false,
    default: null // Can be specific userId or null if role-based
  },
  userRole: {
    type: String,
    enum: ['Admin', 'Sales', 'Ops', 'Viewer'],
    required: false,
    default: null
  },
  module: {
    type: String,
    enum: ['guest_list', 'supplier_list', 'quotations', 'users', 'rights', 'scanner', 'reports'],
    required: true
  },
  canCreate: {
    type: Boolean,
    default: true
  },
  canRead: {
    type: Boolean,
    default: true // "All data can be seen by any user" by default
  },
  canUpdate: {
    type: Boolean,
    default: true
  },
  canDelete: {
    type: Boolean,
    default: false
  },
  canDownload: {
    type: Boolean,
    default: false // "Restrictions should there in Data download"
  },
  canEditOthers: {
    type: Boolean,
    default: false // "Restrictions should there in access to change of data updated by other member"
  }
}, {
  timestamps: true
});

// Every authenticated request loads rights by user and by role.
rightSchema.index({ userId: 1, module: 1 });
rightSchema.index({ userRole: 1, module: 1 });

export const RightModel = mongoose.model('Right', rightSchema);
export default RightModel;
