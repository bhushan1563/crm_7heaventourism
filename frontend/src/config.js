export const GUEST_STATUSES = [
    'Under Process',
    'Follow up',
    'Quoted',
    'Confirmed',
    'Confirmed & Payment received',
    'Travelled',
    'Cancelled'
];

export const QUOTATION_STATUSES = [
    'Draft',
    'Follow up',
    'Sent',
    'Confirmed',
    'Revised',
    'Expired',
    'Cancelled'
];

export const QUOTATION_STATUS_TABS = ['ALL', ...QUOTATION_STATUSES];

export const QUOTATION_TYPES = [
    { value: 'Only Hotel', label: '1. Only Hotel', desc: 'Accommodation only' },
    { value: 'Package', label: '2. Package', desc: 'Full Tour Package' },
    { value: 'Events / Corporate', label: '3. Events / Corporate', desc: 'MICE & Retreats' }
];

export const HOTEL_STAR_RATINGS = [
    { value: '5 star', label: '5 Star Luxury' },
    { value: '4 star', label: '4 Star Premium' },
    { value: '3 star', label: '3 Star Deluxe' },
    { value: 'Heritage / Palace', label: 'Heritage / Palace' },
    { value: 'Resort / Villa', label: 'Resort / Villa' }
];

export const MEAL_PLANS = [
    { value: 'CP (Breakfast Only)', label: 'CP (Breakfast Only)' },
    { value: 'MAP (Breakfast & Dinner)', label: 'MAP (Breakfast & Dinner)' },
    { value: 'AP (All Meals)', label: 'AP (All Meals - B, L, D)' },
    { value: 'EP (Room Only)', label: 'EP (Room Only - No Meals)' }
];

export const FLIGHT_TYPES = [
    { value: 'Departure', label: 'Departure' },
    { value: 'Return', label: 'Return' },
    { value: 'Connecting', label: 'Connecting' }
];

export const USER_ROLES = [
    { value: 'Sales', label: 'Sales' },
    { value: 'Ops', label: 'Ops (Operations)' },
    { value: 'Viewer', label: 'Viewer (Read Only)' },
    { value: 'Admin', label: 'Admin' },
];

export const USER_ROLE_FILTERS = ['ALL', ...USER_ROLES.map(role => role.value)];

export const RIGHTS_MODULES = [
    { value: 'guest_list', label: 'Guest List' },
    { value: 'supplier_list', label: 'Supplier List (5 Categories)' },
    { value: 'quotations', label: 'Quotation Builder & Documents' },
    { value: 'reports', label: 'Reports & Dashboard' },
    { value: 'users', label: 'User Management' },
    { value: 'rights', label: 'Rights & Security' },
    { value: 'scanner', label: 'Mobile Scanner (OCR)' }
];


export const SUPPLIER_CATEGORIES = [
    { value: 'Domestic', label: 'Domestic', icon: '🏠', color: '#2563EB' },
    { value: 'International', label: 'International', icon: '✈️', color: '#0288D1' },
    { value: 'Flight Consolidator', label: 'Flight Consolidator', icon: '🛫', color: '#26C6DA' },
    { value: 'Visa', label: 'Visa', icon: '🛂', color: '#10B981' },
    { value: 'General', label: 'General', icon: '🌐', color: '#64748B' }
];

export const SUPPLIER_CATEGORY_OPTIONS = [
    { value: 'ALL', label: 'All Suppliers', icon: '🌐' },
    ...SUPPLIER_CATEGORIES
];

export const SUPPLIER_RATINGS = [
    { value: '5', label: '⭐⭐⭐⭐⭐ 5 Stars' },
    { value: '4', label: '⭐⭐⭐⭐ 4 Stars' },
    { value: '3', label: '⭐⭐⭐ 3 Stars' },
    { value: '2', label: '⭐⭐ 2 Stars' },
    { value: '1', label: '⭐ 1 Star' }
];

export const FOLLOW_UP_TEMPLATES = [
    { value: 'inquiry_followup', label: '1. General Inquiry Follow-up' },
    { value: 'quotation_discussion', label: '2. Quotation Review & Itinerary' },
    { value: 'confirmation_reminder', label: '3. Booking Confirmation Reminder' },
    { value: 'travel_date_approaching', label: '4. Upcoming Travel Reminder' }
];

export const FOLLOW_UP_CHANNELS = [
    { value: 'WhatsApp', label: 'Channel: WhatsApp' },
    { value: 'Phone Call', label: 'Channel: Phone Call' },
    { value: 'Email', label: 'Channel: Email' },
    { value: 'Meeting', label: 'Channel: In-Person' }
];
