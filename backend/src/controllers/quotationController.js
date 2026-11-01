import mongoose from 'mongoose';
import QuotationModel from '../models/Quotation.js';
import { findGuestDocument } from './guestController.js';
import { containsRegex, omit, queryString } from '../utils/security.js';
import { friendlyMessage } from '../utils/errors.js';
import { itineraryPhotoTokens, normalizeQuotationItinerary } from '../utils/quotationItinerary.js';
import { loadPhotoSizes } from '../services/photoRefs.js';

/**
 * The cleaned `itinerary` of a request body, or nothing when the request does not touch it (an update that only changes the
 * status must leave the days alone). Descriptions are sanitised, photos are confirmed to exist and get their size from the
 * database.
 * @returns {Promise<{ ok: true, itinerary?: object[] } | { ok: false, message: string }>}
 */
const prepareItinerary = async (body) => {
  if (!body || body.itinerary === undefined) return { ok: true };
  const days = normalizeQuotationItinerary(body.itinerary);
  if (!days.ok) return days;
  const loaded = await loadPhotoSizes(itineraryPhotoTokens(days.value));
  if (!loaded.ok) return loaded;
  return { ok: true, itinerary: days.value.map((d) => ({ ...d, photos: d.photos.map((p) => ({ ...p, ...loaded.sizeOf(p.token) })) })) };
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
const PROTECTED_QUOTATION_FIELDS = ['_id', '__v', 'createdAt', 'updatedAt', 'deleted', 'createdBy', 'createdByName'];

const buildQuotationFilter = (query = {}) => {
  const filter = {};
  filter.deleted = false;
  const status = queryString(query.status);
  const destination = queryString(query.destination);
  const sales = queryString(query.sales);
  const ops = queryString(query.ops);
  const guestId = queryString(query.guestId);
  const search = queryString(query.search);
  if (status) filter.status = status;
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
    const { status, destination, sales, ops, guestId, search } = req.query;
    const quotations = await QuotationModel.find(buildQuotationFilter({ status, destination, sales, ops, guestId, search })).sort({ createdAt: -1 });
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
    const days = await prepareItinerary(req.body);
    if (!days.ok) return res.status(200).json({ success: false, message: days.message });

    const quotationNo = req.body.quotationNo || await getNextQuotationNo();
    const createdBy = req.user._id;
    const createdByName = `${req.user.firstName} ${req.user.lastName}`.trim();

    const quotationData = {
      ...omit(req.body, PROTECTED_QUOTATION_FIELDS),
      ...(days.itinerary ? { itinerary: days.itinerary } : {}),
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
    const days = await prepareItinerary(req.body);
    if (!days.ok) return res.status(200).json({ success: false, message: days.message });

    const existing = await findQuotationDocument(req.params.id);
    const changes = { ...omit(req.body, PROTECTED_QUOTATION_FIELDS), ...(days.itinerary ? { itinerary: days.itinerary } : {}) };
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
        tagline: 'Travel with the Trust',
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
