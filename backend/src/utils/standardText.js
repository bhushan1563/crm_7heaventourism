// The standard Notes and Policy texts of the company, for a quotation that has none of them.
//
// Every quotation made in the app starts with these lists. The quotations brought in from the old export (the CSV files) never had
// them, so they were opened, copied and confirmed with no notes, no payment or cancellation policy and no exclusions. A quotation
// that holds none of the five lists is given the company's standard text (the one saved on the "Notes & Policies" screen, else the
// built-in text below, the same as utils/standardText.js in the web app). A quotation that has even one of them written is left alone.
// Pure functions (no database).

export const STANDARD_TEXT = {
  importantNotes: [
    'All guests must carry valid government-issued photo ID (Aadhaar / Passport / Voter ID).',
    'Hotel check-in time is standard 12:00 PM / 02:00 PM and check-out is 10:00 AM / 11:00 AM.',
    'Extras and personal incidentals to be settled directly at the hotel upon check-out.',
    'Quotation rates are subject to availability at the time of final confirmation.'
  ],
  paymentPolicy: [
    '25% Token advance payment at the time of booking confirmation.',
    '50% Second payment installment 30 days prior to travel departure.',
    '25% Balance final payment at least 15 days prior to arrival date.',
    '100% full payment required at booking confirmation for flight tickets and peak-season hotels.'
  ],
  cancellationPolicy: [
    '30 days or more prior to departure: 10% of total tour cost or token booking fee.',
    '15 to 29 days prior to departure: 25% of total tour cost.',
    '07 to 14 days prior to departure: 50% of total tour cost.',
    'Less than 07 days / No-show: 100% of total tour cost (Non-refundable).',
    'Flight cancellations and non-refundable hotel rates subject to airline/supplier terms.'
  ],
  exclusions: [
    'Any kind of monument / temple entry fees unless specified',
    'Personal expenses such as laundry, telephone, room service, alcoholic/non-alcoholic beverages',
    'Early check-in and late check-out charges',
    'Airfare / Train fare unless explicitly specified',
    'Cost of optional excursions, rides or services not mentioned in the inclusions',
    'Travel Insurance and emergency medical expenses'
  ],
  vehicleNotes: [
    'For airport transfers in case of flight delays exceeding 1 hr, charges apply as per hourly schedule',
    'Opening & closing kilometers and hours calculated garage to garage',
    'AC system will be switched off on hilly / ghat sections where applicable',
    'Extra mileage exceeding package limits will be charged at standard per-km rates',
    'Local usage beyond 12 hours will be billed on hourly & extra km basis'
  ]
};

export const STANDARD_TEXT_KEYS = Object.keys(STANDARD_TEXT);

const written = (list) => Array.isArray(list) && list.some((line) => String(line ?? '').trim());

/** True when the quotation has none of the five lists: it was brought in from the old export (or never filled in at all). */
export const isMissingStandardText = (quotation) => Boolean(quotation) && STANDARD_TEXT_KEYS.every((key) => !written(quotation[key]));

/**
 * The quotation with the standard text in the five lists when it has none of them, else the same quotation.
 * @param {object} quotation a plain object (`doc.toJSON()` or `doc.toObject()`)
 * @param {object|null} [master] the company's saved standard text; a list it does not have uses the built-in text
 */
export const withStandardText = (quotation, master = null) => {
  if (!isMissingStandardText(quotation)) return quotation;
  const lists = Object.fromEntries(STANDARD_TEXT_KEYS.map((key) => [key, written(master?.[key]) ? [...master[key]] : [...STANDARD_TEXT[key]]]));
  return { ...quotation, ...lists };
};
