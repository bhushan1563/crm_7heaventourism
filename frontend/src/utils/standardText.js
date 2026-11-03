// The built-in standard Notes and Policy texts: what a new quotation starts with until an Admin saves the company's own text on the
// "Notes & Policies" screen (the master text). Kept in one place so the quotation builder and that screen use the same lines.

export const DEFAULT_EXCLUSIONS = [
  'Any kind of monument / temple entry fees unless specified',
  'Personal expenses such as laundry, telephone, room service, alcoholic/non-alcoholic beverages',
  'Early check-in and late check-out charges',
  'Airfare / Train fare unless explicitly specified',
  'Cost of optional excursions, rides or services not mentioned in the inclusions',
  'Travel Insurance and emergency medical expenses'
];

export const DEFAULT_PAYMENT_POLICY = [
  '25% Token advance payment at the time of booking confirmation.',
  '50% Second payment installment 30 days prior to travel departure.',
  '25% Balance final payment at least 15 days prior to arrival date.',
  '100% full payment required at booking confirmation for flight tickets and peak-season hotels.'
];

export const DEFAULT_CANCELLATION_POLICY = [
  '30 days or more prior to departure: 10% of total tour cost or token booking fee.',
  '15 to 29 days prior to departure: 25% of total tour cost.',
  '07 to 14 days prior to departure: 50% of total tour cost.',
  'Less than 07 days / No-show: 100% of total tour cost (Non-refundable).',
  'Flight cancellations and non-refundable hotel rates subject to airline/supplier terms.'
];

export const DEFAULT_VEHICLE_NOTES = [
  'For airport transfers in case of flight delays exceeding 1 hr, charges apply as per hourly schedule',
  'Opening & closing kilometers and hours calculated garage to garage',
  'AC system will be switched off on hilly / ghat sections where applicable',
  'Extra mileage exceeding package limits will be charged at standard per-km rates',
  'Local usage beyond 12 hours will be billed on hourly & extra km basis'
];

export const DEFAULT_IMPORTANT_NOTES = [
  'All guests must carry valid government-issued photo ID (Aadhaar / Passport / Voter ID).',
  'Hotel check-in time is standard 12:00 PM / 02:00 PM and check-out is 10:00 AM / 11:00 AM.',
  'Extras and personal incidentals to be settled directly at the hotel upon check-out.',
  'Quotation rates are subject to availability at the time of final confirmation.'
];

export const STANDARD_TEXT = {
  importantNotes: DEFAULT_IMPORTANT_NOTES,
  paymentPolicy: DEFAULT_PAYMENT_POLICY,
  cancellationPolicy: DEFAULT_CANCELLATION_POLICY,
  exclusions: DEFAULT_EXCLUSIONS,
  vehicleNotes: DEFAULT_VEHICLE_NOTES
};
