import { config } from '../config/env.js';

// Friendly names for field paths, so users read "Guest names is required" instead of "Path `guestNames` is required."
const LABELS = {
  guestNames: 'Guest names', contactNumber: 'Contact number', email: 'Email', destination: 'Destination', travelDate: 'Travel date',
  inquiryDate: 'Inquiry date', sales: 'Sales person', ops: 'Ops person', status: 'Status', paxCount: 'Pax count', budget: 'Budget',
  supplierName: 'Supplier name', contactPerson: 'Contact person', phone: 'Phone number', category: 'Category', city: 'City',
  country: 'Country', services: 'Services', rating: 'Rating', clientName: 'Client name', clientEmail: 'Client email',
  clientPhone: 'Client phone', quotationNo: 'Quotation number', quotationType: 'Quotation type', duration: 'Duration',
  paxDetails: 'Pax details', firstName: 'First name', lastName: 'Last name', role: 'Role', password: 'Password', srNo: 'Sr No',
  module: 'Module', userRole: 'Role', userId: 'User'
};

const humanize = (path) => {
  const last = String(path || 'value').split('.').pop().replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  return last.charAt(0).toUpperCase() + last.slice(1);
};

const label = (path) => LABELS[path] || LABELS[String(path || '').split('.').pop()] || humanize(path);

/** One Mongoose validator error -> one short sentence. */
const fieldMessage = (err) => {
  const name = label(err.path);
  switch (err.kind) {
    case 'required':
      return `${name} is required.`;
    case 'enum':
      return `${name} has an invalid value.`;
    case 'Number':
    case 'Date':
    case 'ObjectId':
    case 'Boolean':
      return `${name} has an invalid ${err.kind === 'Number' ? 'number' : err.kind === 'Date' ? 'date' : 'value'}.`;
    case 'minlength':
    case 'maxlength':
    case 'min':
    case 'max':
      return `${name} is out of the allowed range.`;
    default:
      // A custom validator message is already written for people; anything raw from the driver is not.
      return /Path `|Cast to /.test(err.message) ? `${name} is invalid.` : err.message;
  }
};

/**
 * Turns whatever a controller caught into a message a person can act on.
 * - validation / cast / duplicate-key errors are translated to plain language
 * - anything unexpected is shown as-is in development, and as a generic message in production (the real error is logged)
 */
export const friendlyMessage = (error, prefix = '') => {
  let detail;

  if (error?.name === 'ValidationError' && error.errors) {
    detail = Object.values(error.errors).map(fieldMessage).join(' ');
  } else if (error?.name === 'CastError') {
    detail = `${label(error.path)} has an invalid value.`;
  } else if (error?.code === 11000) {
    const field = Object.keys(error.keyPattern || error.keyValue || {})[0];
    detail = `${field ? label(field) : 'This record'} already exists.`;
  } else if (error?.name === 'MongoServerSelectionError' || error?.name === 'MongoNetworkError') {
    console.error('[7Heaven] Database unreachable:', error.message);
    detail = 'The database is temporarily unreachable. Please try again in a moment.';
  } else {
    console.error('[7Heaven] Unexpected error:', error);
    detail = config.isProduction ? 'Something went wrong on the server. Please try again.' : String(error?.message || error);
  }

  return prefix ? `${prefix}: ${detail}` : detail;
};
