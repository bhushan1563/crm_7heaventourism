import mongoose from 'mongoose';
import QuotationModel from '../models/Quotation.js';
import { findGuestDocument } from './guestController.js';
import { containsRegex, omit, queryString } from '../utils/security.js';
import { friendlyMessage } from '../utils/errors.js';
import { itineraryPhotoTokens, normalizeQuotationItinerary } from '../utils/quotationItinerary.js';
import { normalizeQuotationHotels, stayPhotoTokens } from '../utils/quotationHotels.js';
import { normalizeQuotationLists } from '../utils/quotationLists.js';
import { normalizeQuotationOptions, optionPhotoTokens } from '../utils/quotationOptions.js';
import { normalizeQuotationVehicles } from '../utils/quotationVehicles.js';
import { normalizeQuotationVisa } from '../utils/quotationVisa.js';
import { normalizeQuotationText } from '../utils/quotationText.js';
import { LAYOUT_OF_TYPE, normalizeQuotationPriceTables, tableHasData, tableTotal } from '../utils/quotationPriceTables.js';
import { roomDefaults } from '../utils/roomTables.js';
import { loadPhotoSizes } from '../services/photoRefs.js';
import { isStaleClaim, releaseStaleClaim } from '../services/confirmationClaims.js';

/**
 * The parts of a request body that carry photos and formatted text, cleaned: the itinerary days, the hotel stays and the lists
 * of lines (inclusions, exclusions, policies, notes). A part the request does not mention is left out (an update that only
 * changes the status must leave the days alone). Text is sanitised, and every photo is confirmed to exist and gets its size
 * from the database (one lookup for all of them).
 * @returns {Promise<{ ok: true, overrides: object } | { ok: false, message: string }>} `overrides` replace those fields of the body
 */
const prepareExtras = async (body) => {
  const overrides = {};
  if (!body) return { ok: true, overrides };
  const days = body.itinerary === undefined ? null : normalizeQuotationItinerary(body.itinerary);
  if (days && !days.ok) return days;
  const hasStays = body.packageDetails && typeof body.packageDetails === 'object' && body.packageDetails.hotels !== undefined;
  const stays = hasStays ? normalizeQuotationHotels(body.packageDetails.hotels) : null;
  if (stays && !stays.ok) return stays;

  const lists = normalizeQuotationLists(body);
  if (!lists.ok) return lists;
  const options = body.options === undefined ? null : normalizeQuotationOptions(body.options);
  if (options && !options.ok) return options;
  const vehicles = normalizeQuotationVehicles(body);
  if (!vehicles.ok) return vehicles;
  const visa = normalizeQuotationVisa(body);
  if (!visa.ok) return visa;
  const texts = normalizeQuotationText(body);
  if (!texts.ok) return texts;
  const priceTables = body.priceTables === undefined ? null : normalizeQuotationPriceTables(body.priceTables);
  if (priceTables && !priceTables.ok) return priceTables;

  const tokens = [...(days ? itineraryPhotoTokens(days.value) : []), ...(stays ? stayPhotoTokens(stays.value) : []), ...(options ? optionPhotoTokens(options.value) : [])];
  const loaded = await loadPhotoSizes(tokens);
  if (!loaded.ok) return loaded;
  const sized = (photos) => photos.map((p) => ({ ...p, ...loaded.sizeOf(p.token) }));
  if (days) overrides.itinerary = days.value.map((d) => ({ ...d, photos: sized(d.photos) }));
  if (stays) overrides.packageDetails = { ...body.packageDetails, hotels: stays.value.map((s) => ({ ...s, photos: sized(s.photos) })) };
  if (vehicles.vehicles) overrides.vehicles = vehicles.vehicles;
  if (vehicles.landService) overrides.landService = vehicles.landService;
  // The price of a land service quotation IS its vehicles: keep the amount the lists and statistics read (pricing.grandTotal)
  // equal to the vehicle total, so the two can never disagree.
  if (vehicles.vehicles && body.quotationType === 'Land Service' && body.pricing && typeof body.pricing === 'object' && !Array.isArray(body.pricing)) {
    overrides.pricing = { ...body.pricing, grandTotal: vehicles.total, totalCostPerPerson: 0, totalCostNote: `Rs ${vehicles.total.toLocaleString('en-IN')} total` };
  }
  if (priceTables) overrides.priceTables = priceTables.value;
  // A hotel or package quotation priced with the pricing tables is "from" its lowest Grand Total: keep the amount that lists and
  // statistics read (pricing.grandTotal) equal to it. A "rooms" row that follows the trip needs the duration; without it nothing is changed.
  if (priceTables && LAYOUT_OF_TYPE[body.quotationType]) {
    const defaults = roomDefaults(body);
    const counted = priceTables.value.filter((table) => table.layout === LAYOUT_OF_TYPE[body.quotationType]); // only tables laid out the way this kind is priced
    const totals = counted.filter(tableHasData).map((table) => tableTotal(table, defaults)).filter((total) => total > 0);
    const followsTrip = counted.some((table) => table.layout === 'rooms' && table.rows.some((row) => row.nights === null));
    if (totals.length && !(followsTrip && !defaults.nights)) {
      const lowest = Math.min(...totals);
      const base = body.pricing && typeof body.pricing === 'object' && !Array.isArray(body.pricing) ? body.pricing : {};
      overrides.pricing = { ...base, grandTotal: lowest, totalCostPerPerson: 0, totalCostNote: `${totals.length > 1 ? 'From ' : ''}Rs ${lowest.toLocaleString('en-IN')}` };
    }
  }
  if (visa.visa) overrides.visa = visa.visa;
  if (visa.visaFees) overrides.visaFees = visa.visaFees;
  // The price of a visa quotation IS its fees (per applicant or for the group): keep the amount that lists and statistics read
  // (pricing.grandTotal) equal to the fee total.
  if (visa.total !== undefined && body.quotationType === 'Visa' && body.pricing && typeof body.pricing === 'object' && !Array.isArray(body.pricing)) {
    overrides.pricing = { ...body.pricing, grandTotal: visa.total, totalCostPerPerson: 0, totalCostNote: `Rs ${visa.total.toLocaleString('en-IN')} total` };
  }
  if (options) overrides.options = options.value.map((o) => ({ ...o, hotels: o.hotels.map((s) => ({ ...s, photos: sized(s.photos) })) }));
  if (lists.inclusions) overrides.packageDetails = { ...(overrides.packageDetails || body.packageDetails), inclusions: lists.inclusions };
  // The texts staff can format (price line and notes, room allocation, flight ticket note, end-of-tour banner). The price line of a
  // land service or visa is worked out from its vehicles or fees, so that one is never replaced.
  if (texts.pricing) overrides.pricing = { ...(overrides.pricing || body.pricing), ...(overrides.pricing ? { notes: texts.pricing.notes ?? overrides.pricing.notes } : texts.pricing) };
  if (texts.roomInfo !== undefined) overrides.packageDetails = { ...(overrides.packageDetails || body.packageDetails), roomInfo: texts.roomInfo };
  if (texts.flightTicketNote !== undefined) overrides.flightTicketNote = texts.flightTicketNote;
  if (texts.endOfTourNote !== undefined) overrides.endOfTourNote = texts.endOfTourNote;
  Object.assign(overrides, lists.lists); // the cleaned top-level lists (exclusions, policies, notes)
  return { ok: true, overrides };
};

export const findQuotationDocument = async (id) => {
  if (!id) return null;
  if (mongoose.isValidObjectId(id)) {
    const byId = await QuotationModel.findById(id);
    if (byId) return byId;
  }
  return QuotationModel.findOne({ quotationNo: id });
};

// Fields the server owns: never accepted from the request body when creating or updating a quotation.
const PROTECTED_QUOTATION_FIELDS = ['_id', '__v', 'createdAt', 'updatedAt', 'deleted', 'createdBy', 'createdByName', 'confirmationId', 'confirmationNo'];

/** Why a confirmed quotation cannot be changed, or null. Applies to everyone, Admin included: cancel the confirmation first. */
const lockedMessage = (quotation, action) =>
  quotation?.confirmationId
    ? `This quotation is confirmed as ${quotation.confirmationNo || 'a booking'} and is locked, so it cannot be ${action}. Open the confirmation to add booking details, or cancel the confirmation to change the quotation.`
    : null;

const buildQuotationFilter = (query = {}) => {
  const filter = {};
  filter.deleted = false;
  const status = queryString(query.status);
  const destination = queryString(query.destination);
  const sales = queryString(query.sales);
  const ops = queryString(query.ops);
  const guestId = queryString(query.guestId);
  const search = queryString(query.search);
  const quotationType = queryString(query.quotationType);
  if (status) filter.status = status;
  if (quotationType) filter.quotationType = quotationType; // e.g. "Visa": the Visas section lists only visa quotations
  if (destination) filter.destination = containsRegex(destination);
  if (sales) filter.sales = containsRegex(sales);
  if (ops) filter.ops = containsRegex(ops);
  if (guestId) filter.guestId = guestId;
  if (search) {
    const regex = containsRegex(search);
    filter.$or = [
      { quotationNo: regex },
      { clientName: regex },
      { destination: regex },
      { clientEmail: regex },
      { clientPhone: regex },
      { 'visa.country': regex }, // a visa is found by its country even when the title was typed differently
      { 'visa.visaType': regex },
      { sales: regex },
      { ops: regex }
    ];
  }
  return filter;
};

const getNextQuotationNo = async () => {
  const year = new Date().getFullYear();
  const prefix = `7H-QT-${year}-`;
  const quotations = await QuotationModel.find({ quotationNo: new RegExp(`^${prefix}`) }).select('quotationNo');
  let maxNum = 0;
  quotations.forEach(q => {
    const numPart = parseInt(String(q.quotationNo).replace(prefix, ''), 10);
    if (!isNaN(numPart) && numPart > maxNum) maxNum = numPart;
  });
  return `${prefix}${String(maxNum + 1).padStart(3, '0')}`;
};

export const getQuotations = async (req, res) => {
  try {
    const { status, destination, sales, ops, guestId, search, quotationType } = req.query;
    const filter = buildQuotationFilter({ status, destination, sales, ops, guestId, search, quotationType });
    let quotations = await QuotationModel.find(filter).sort({ createdAt: -1 });
    // A quotation left locked by a confirmation that never finished (the server restarted half-way) is released before it is listed.
    const stale = quotations.filter((q) => isStaleClaim(q));
    if (stale.length && (await Promise.all(stale.map(releaseStaleClaim))).some(Boolean)) quotations = await QuotationModel.find(filter).sort({ createdAt: -1 });
    res.json({
      success: true,
      count: quotations.length,
      data: quotations
    });
  } catch (error) {
    console.error('Error fetching quotations:', error);
    res.status(200).json({ success: false, message: friendlyMessage(error, 'Failed to fetch quotations') });
  }
};

export const getQuotationById = async (req, res) => {
  try {
    const quotation = await findQuotationDocument(req.params.id);
    if (!quotation) {
      return res.status(200).json({ success: false, message: 'Quotation not found.' });
    }
    res.json({
      success: true,
      data: quotation
    });
  } catch (error) {
    console.error('Error fetching quotation:', error);
    res.status(200).json({ success: false, message: friendlyMessage(error, 'Failed to fetch quotation') });
  }
};

export const createQuotation = async (req, res) => {
  try {
    const extras = await prepareExtras(req.body);
    if (!extras.ok) return res.status(200).json({ success: false, message: extras.message });

    const quotationNo = req.body.quotationNo || await getNextQuotationNo();
    const createdBy = req.user._id;
    const createdByName = `${req.user.firstName} ${req.user.lastName}`.trim();

    const quotationData = {
      ...omit(req.body, PROTECTED_QUOTATION_FIELDS),
      ...extras.overrides,
      quotationNo,
      createdBy,
      createdByName,
      sales: req.body.sales || createdByName,
      salesId: req.body.salesId || createdBy
    };

    const newQuotation = await QuotationModel.create(quotationData);
    res.status(200).json({
      success: true,
      message: 'Quotation created successfully.',
      data: newQuotation
    });
  } catch (error) {
    console.error('Error creating quotation:', error);
    res.status(200).json({ success: false, message: friendlyMessage(error, 'Failed to create quotation') });
  }
};

export const updateQuotation = async (req, res) => {
  try {
    const extras = await prepareExtras(req.body);
    if (!extras.ok) return res.status(200).json({ success: false, message: extras.message });

    const existing = await findQuotationDocument(req.params.id);
    const locked = lockedMessage(existing, 'changed');
    if (locked) return res.status(200).json({ success: false, message: locked });
    const changes = {
      ...omit(req.body, PROTECTED_QUOTATION_FIELDS),
      ...extras.overrides
    };
    const updated = existing ? await QuotationModel.findByIdAndUpdate(existing._id, changes, { new: true }) : null;
    if (!updated) {
      return res.status(200).json({ success: false, message: 'Quotation not found.' });
    }
    res.json({
      success: true,
      message: 'Quotation updated successfully.',
      data: updated
    });
  } catch (error) {
    console.error('Error updating quotation:', error);
    res.status(200).json({ success: false, message: friendlyMessage(error, 'Failed to update quotation') });
  }
};

export const deleteQuotation = async (req, res) => {
  try {
    const existing = await findQuotationDocument(req.params.id);
    const locked = lockedMessage(existing, 'deleted');
    if (locked) return res.status(200).json({ success: false, message: locked });
    const deleted = existing ? await QuotationModel.findByIdAndUpdate(existing._id, { deleted: true }) : null;
    if (!deleted) {
      return res.status(200).json({ success: false, message: 'Quotation not found.' });
    }
    res.json({
      success: true,
      message: 'Quotation deleted successfully.'
    });
  } catch (error) {
    console.error('Error deleting quotation:', error);
    res.status(200).json({ success: false, message: friendlyMessage(error, 'Failed to delete quotation') });
  }
};

export const duplicateQuotation = async (req, res) => {
  try {
    const original = await findQuotationDocument(req.params.id);
    if (!original) {
      return res.status(200).json({ success: false, message: 'Original quotation not found.' });
    }

    const nextNo = await getNextQuotationNo();
    const createdBy = req.user._id;
    const createdByName = `${req.user.firstName} ${req.user.lastName}`.trim();

    // Clone data and omit _id
    const originalObj = original.toObject ? original.toObject() : { ...original };
    delete originalObj._id;
    delete originalObj.createdAt;
    delete originalObj.updatedAt;

    const clonedData = {
      ...originalObj,
      quotationNo: nextNo,
      clientName: `${originalObj.clientName} (Copy)`,
      status: 'Draft',
      // A copy of a confirmed quotation is a new, open quotation: it is not part of that booking.
      isLocked: false,
      confirmationId: '',
      confirmationNo: '',
      createdBy,
      createdByName,
      sales: createdByName,
      salesId: createdBy
    };

    const duplicated = await QuotationModel.create(clonedData);
    res.status(200).json({
      success: true,
      message: 'Quotation duplicated successfully.',
      data: duplicated
    });
  } catch (error) {
    console.error('Error duplicating quotation:', error);
    res.status(200).json({ success: false, message: friendlyMessage(error, 'Failed to duplicate quotation') });
  }
};

export const convertFromInquiry = async (req, res) => {
  try {
    const { guestId } = req.body;
    const guest = await findGuestDocument(guestId);
    if (!guest) {
      return res.status(200).json({ success: false, message: 'Guest inquiry not found.' });
    }

    const nextNo = await getNextQuotationNo();
    const createdBy = req.user._id;
    const createdByName = `${req.user.firstName} ${req.user.lastName}`.trim();

    const newQuotation = await QuotationModel.create({
      quotationNo: nextNo,
      guestId: guest._id,
      clientName: guest.guestNames || 'Valued Guest',
      clientEmail: guest.email || '',
      clientPhone: guest.contactNumber || '',
      destination: guest.destination || 'Luxury Tour Package',
      duration: '3 Nights / 4 Days',
      paxDetails: `${guest.paxCount || 2} Adults`,
      travelDate: guest.travelDate || '',
      status: 'Draft',
      sales: guest.sales || createdByName,
      salesId: guest.salesId || createdBy,
      ops: guest.ops || '',
      opsId: guest.opsId || '',
      quotationType: 'Package',
      companyDetails: {
        name: '7HEAVEN TOURISM',
        tagline: 'Travel with Trust',
        description: 'Tour Package, Visa Service, Flight Tickets, Cruises & Hotel Bookings',
        address: '405 (FOF) Kanha Capital, Above IDFC bank, Opp Express Tower Hotel, Alkapuri 390007, Vadodara',
        phone: '+91 7862829178',
        email: 'sales@7heaventourism.in',
        website: 'www.7heaventourism.in'
      },
      itinerary: [
        {
          dayNumber: 'Day 01',
          title: 'Arrival & Welcome',
          description: `Arrival at destination. Meet & greet and transfer to the luxury hotel. Check-in and relax.`
        },
        {
          dayNumber: 'Day 02',
          title: 'Full Day Sightseeing Tour',
          description: 'Post breakfast, enjoy premium guided sightseeing and local cultural experiences.'
        },
        {
          dayNumber: 'Day 03',
          title: 'Leisure & Local Exploration',
          description: 'Experience local highlights, shopping, and gourmet dining experiences.'
        },
        {
          dayNumber: 'Day 04',
          title: 'Departure',
          description: 'After breakfast, check-out and transfer to Airport/Railway Station with unforgettable memories.'
        }
      ],
      packageDetails: {
        hotels: [
          {
            nights: '3 Nights',
            city: guest.destination?.split('&')[0]?.trim() || 'Destination',
            hotelName: 'Luxury 4/5 Star Hotel',
            starRating: '4 star'
          }
        ],
        roomInfo: '1-2 Rooms',
        inclusions: [
          'Meet and greet at arrival',
          '03 Nights stay in above mentioned hotels',
          'Daily Breakfast & Dinner',
          'Assistance provided by dedicated chauffeur throughout the tour',
          'Transfers & sightseeing as per the itinerary in private AC vehicle',
          'All toll taxes, parking fees & driver allowance',
          'VIP assistance & priority darshan / passes where applicable'
        ]
      },
      pricing: {
        packageCostPerPerson: 25000,
        packageCostNote: `Per person X ${guest.paxCount || 2} Adults`,
        airfareCostPerPerson: 12000,
        airfareCostNote: `Per person X ${guest.paxCount || 2} Adults`,
        totalCostPerPerson: 37000,
        totalCostNote: `Rs 37000 Per person (Incl of GST)`,
        grandTotal: 37000 * (guest.paxCount || 2),
        currency: 'Rs',
        notes: ''
      },
      flightDetails: [],
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
        'Any kind of Entry Fees – Unless specified',
        'Any kind of personal expenses like telephone, Laundry, beverages (Both Hard & Soft) etc.',
        'Early check in and late check out is subject to availability',
        'Heater Charges are as per hotel policy and will be directly payable at hotel by Guest',
        'Ac will not work in hills.',
        'Any type of Aarti / special event tickets unless specified',
        'River Cruise or Boat Ride unless specified',
        'Cost of services which is not mentioned in the "Inclusions"',
        'Early Morning Aarti / transfers outside standard hours'
      ],
      vehicleNotes: [
        'For airport transfers in cases of flight delay more than 1 hr, charges apply as per hourly chart.',
        'Opening & closing Kilometers and Hours calculated From Garage to Garage.',
        'Air condition units will be switched off on hill roads and steep ghats.',
        'Over travel above limit for outstation kms per day will incur extra km rate.',
        'Local vehicle usage above 12 Hrs billed on hourly basis plus extra kms.',
        'Vehicle duty starts daily at 9:00 AM (includes lunch break) up to 7:00 PM.'
      ],
      importantNotes: [
        'All Guests must carry valid Govt. ID proof and present at time of check-in.',
        'Early check-in and late check-out requests are strictly subject to hotel availability.',
        'Extras & room incidentals to be paid directly by guest at hotel.',
        'No extra services or transfers provided unless booked and paid in advance.'
      ],
      createdBy,
      createdByName
    });

    res.status(200).json({
      success: true,
      message: 'Quotation created from inquiry successfully.',
      data: newQuotation
    });
  } catch (error) {
    console.error('Error converting inquiry to quotation:', error);
    res.status(200).json({ success: false, message: friendlyMessage(error, 'Failed to convert inquiry to quotation') });
  }
};

export const getQuotationStats = async (req, res) => {
  try {
    // Counted and summed by MongoDB instead of loading every quotation (with its full itinerary) into memory.
    const [byStatus, valueRows] = await Promise.all([
      QuotationModel.aggregate([{ $match: { deleted: false } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
      QuotationModel.aggregate([
        { $match: { deleted: false } },
        {
          $group: {
            _id: null,
            // grandTotal when set, otherwise the per-person total (same rule as before)
            value: { $sum: { $cond: [{ $gt: ['$pricing.grandTotal', 0] }, '$pricing.grandTotal', { $ifNull: ['$pricing.totalCostPerPerson', 0] }] } }
          }
        }
      ])
    ]);

    const countFor = (status) => byStatus.find((row) => row._id === status)?.count || 0;
    const total = byStatus.reduce((sum, row) => sum + row.count, 0);
    const drafts = countFor('Draft');
    const followUps = countFor('Follow up');
    const sent = countFor('Sent');
    const confirmed = countFor('Confirmed');
    const revised = countFor('Revised');
    const expired = countFor('Expired');
    const cancelled = countFor('Cancelled');
    const totalQuotedValue = valueRows[0]?.value || 0;

    res.json({
      success: true,
      data: {
        total,
        drafts,
        followUps,
        sent,
        confirmed,
        revised,
        expired,
        cancelled,
        totalQuotedValue,
        conversionRate: total > 0 ? Math.round((confirmed / total) * 100) : 0
      }
    });
  } catch (error) {
    console.error('Error fetching quotation stats:', error);
    res.status(200).json({ success: false, message: friendlyMessage(error, 'Failed to fetch quotation stats') });
  }
};
