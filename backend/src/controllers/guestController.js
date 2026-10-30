import mongoose from 'mongoose';
import GuestModel from '../models/Guest.js';
import { containsRegex, pick, queryString } from '../utils/security.js';

export const findGuestDocument = async (id) => {
  if (!id) return null;
  if (mongoose.isValidObjectId(id)) {
    const byId = await GuestModel.findById(id);
    if (byId) return byId;
  }
  return GuestModel.findOne({ srNo: id });
};

// Fields a client may change through PUT /guests/:id. Ownership, audit, lock and delete flags are server-controlled.
const UPDATABLE_GUEST_FIELDS = [
  'inquiryDate',
  'guestNames',
  'email',
  'contactNumber',
  'destination',
  'travelDate',
  'status',
  'sales',
  'salesId',
  'ops',
  'opsId',
  'paxCount',
  'budget',
  'notes'
];

const buildGuestFilter = (query = {}) => {
  const filter = {};
  filter.deleted = false;
  const status = queryString(query.status);
  const destination = queryString(query.destination);
  const sales = queryString(query.sales);
  const ops = queryString(query.ops);
  const search = queryString(query.search);
  if (status) filter.status = status;
  if (destination) filter.destination = containsRegex(destination);
  if (sales) filter.sales = containsRegex(sales);
  if (ops) filter.ops = containsRegex(ops);
  if (search) {
    const regex = containsRegex(search);
    filter.$or = [
      { guestNames: regex },
      { srNo: regex },
      { email: regex },
      { contactNumber: regex },
      { destination: regex },
      { sales: regex },
      { ops: regex }
    ];
  }
  return filter;
};

const getNextGuestSrNo = async () => {
  const year = new Date().getFullYear();
  const prefix = `${year}-`;
  const guests = await GuestModel.find({ srNo: new RegExp(`^${prefix}`) }).select('srNo');
  let maxNum = 0;
  guests.forEach(g => {
    const numPart = parseInt(String(g.srNo).replace(prefix, ''), 10);
    if (!isNaN(numPart) && numPart > maxNum) maxNum = numPart;
  });
  return `${prefix}${String(maxNum + 1).padStart(3, '0')}`;
};

export const getGuests = async (req, res) => {
  try {
    const guests = await GuestModel.find(buildGuestFilter(req.query)).sort({ createdAt: -1 });
    res.json({
      success: true,
      count: guests.length,
      data: guests
    });
  } catch (error) {
    res.status(200).json({ success: false, message: 'Failed to fetch guests: ' + error.message });
  }
};

export const getGuestById = async (req, res) => {
  try {
    const guest = await findGuestDocument(req.params.id);
    if (!guest) {
      return res.status(200).json({ success: false, message: 'Guest inquiry not found.' });
    }
    res.json({ success: true, data: guest });
  } catch (error) {
    res.status(200).json({ success: false, message: error.message });
  }
};

export const createGuest = async (req, res) => {
  try {
    const {
      inquiryDate,
      guestNames,
      email,
      contactNumber,
      destination,
      travelDate,
      status = 'Under Process',
      sales,
      salesId,
      ops,
      opsId,
      paxCount,
      budget,
      notes
    } = req.body;

    if (!guestNames || !contactNumber || !destination || !travelDate || !sales || !ops) {
      return res.status(200).json({
        success: false,
        message: 'Please provide all required fields: Guest Names, Contact Number, Destination, Travel Date, Sales, and Ops.'
      });
    }

    const srNo = req.body.srNo || await getNextGuestSrNo();
    const formattedInquiryDate = inquiryDate || new Date().toISOString().split('T')[0];

    const newGuest = await GuestModel.create({
      srNo,
      inquiryDate: formattedInquiryDate,
      guestNames: guestNames.trim(),
      email: email ? email.trim() : '',
      contactNumber: contactNumber.trim(),
      destination: destination.trim(),
      travelDate,
      status,
      sales: sales.trim(),
      salesId: salesId || req.user._id,
      ops: ops.trim(),
      opsId: opsId || '',
      paxCount: Number(paxCount) || 2,
      budget: budget || '',
      notes: notes || '',
      createdBy: req.user._id,
      createdByName: `${req.user.firstName} ${req.user.lastName}`,
      updatedBy: req.user._id,
      updatedByName: `${req.user.firstName} ${req.user.lastName}`
    });

    res.status(200).json({
      success: true,
      message: 'Guest inquiry created successfully.',
      data: newGuest
    });
  } catch (error) {
    console.error('Create guest error:', error);
    res.status(200).json({ success: false, message: 'Failed to create guest inquiry: ' + error.message });
  }
};

export const updateGuest = async (req, res) => {
  try {
    const guestId = req.params.id;
    const existing = await findGuestDocument(guestId);
    if (!existing) {
      return res.status(200).json({ success: false, message: 'Guest inquiry not found.' });
    }

    const updateData = {
      ...pick(req.body, UPDATABLE_GUEST_FIELDS),
      updatedBy: req.user._id,
      updatedByName: `${req.user.firstName} ${req.user.lastName}`
    };

    const updated = await GuestModel.findByIdAndUpdate(existing._id, updateData, { new: true });

    res.json({
      success: true,
      message: 'Guest inquiry updated successfully.',
      data: updated
    });
  } catch (error) {
    res.status(200).json({ success: false, message: 'Failed to update guest: ' + error.message });
  }
};

export const updateGuestStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = [
      'Under Process',
      'Follow up',
      'Quoted',
      'Confirmed',
      'Confirmed & Payment received',
      'Travelled',
      'Cancelled'
    ];

    if (!validStatuses.includes(status)) {
      return res.status(200).json({ success: false, message: 'Invalid status provided.' });
    }

    const guestId = req.params.id;
    const existing = await findGuestDocument(guestId);
    if (!existing) {
      return res.status(200).json({ success: false, message: 'Guest inquiry not found.' });
    }

    const updated = await GuestModel.findByIdAndUpdate(existing._id, {
      status,
      updatedBy: req.user._id,
      updatedByName: `${req.user.firstName} ${req.user.lastName}`
    }, { new: true });

    res.json({
      success: true,
      message: `Status updated to "${status}"`,
      data: updated
    });
  } catch (error) {
    res.status(200).json({ success: false, message: error.message });
  }
};

export const addGuestFollowUp = async (req, res) => {
  try {
    const guestId = req.params.id;
    const { note, channel = 'WhatsApp', updateStatusToFollowUp = false } = req.body;

    const existing = await findGuestDocument(guestId);
    if (!existing) {
      return res.status(200).json({ success: false, message: 'Guest inquiry not found.' });
    }

    const followUpEntry = {
      date: new Date().toISOString(),
      note: (note || '').trim(),
      channel: channel || 'WhatsApp',
      by: `${req.user.firstName} ${req.user.lastName}`
    };

    const currentNotes = existing.followUpNotes || [];
    const updatePayload = {
      followUpNotes: [followUpEntry, ...currentNotes],
      updatedBy: req.user._id,
      updatedByName: `${req.user.firstName} ${req.user.lastName}`
    };

    if (updateStatusToFollowUp && existing.status !== 'Confirmed' && existing.status !== 'Confirmed & Payment received') {
      updatePayload.status = 'Follow up';
    }

    const updated = await GuestModel.findByIdAndUpdate(existing._id, updatePayload, { new: true });

    res.json({
      success: true,
      message: 'Follow-up interaction logged successfully.',
      data: updated
    });
  } catch (error) {
    res.status(200).json({ success: false, message: 'Failed to record follow-up: ' + error.message });
  }
};

export const deleteGuest = async (req, res) => {
  try {
    const guestId = req.params.id;
    const existing = await findGuestDocument(guestId);
    if (!existing) {
      return res.status(200).json({ success: false, message: 'Guest inquiry not found.' });
    }

    await GuestModel.findByIdAndUpdate(existing._id, { deleted: true });

    res.json({
      success: true,
      message: 'Guest inquiry deleted successfully.'
    });
  } catch (error) {
    res.status(200).json({ success: false, message: 'Failed to delete guest: ' + error.message });
  }
};

export const getGuestStats = async (req, res) => {
  try {
    // Counted by MongoDB instead of loading every inquiry into memory.
    const [byStatus, byDestination] = await Promise.all([
      GuestModel.aggregate([{ $match: { deleted: false } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
      GuestModel.aggregate([{ $match: { deleted: false } }, { $group: { _id: '$destination', count: { $sum: 1 } } }])
    ]);

    const countFor = (status) => byStatus.find((row) => row._id === status)?.count || 0;
    const stats = {
      total: byStatus.reduce((sum, row) => sum + row.count, 0),
      underProcess: countFor('Under Process'),
      followUp: countFor('Follow up'),
      quoted: countFor('Quoted'),
      confirmed: countFor('Confirmed'),
      confirmedAndPaid: countFor('Confirmed & Payment received'),
      travelled: countFor('Travelled'),
      cancelled: countFor('Cancelled'),
      topDestinations: {}
    };

    byDestination.forEach((row) => {
      const dest = row._id || 'Unspecified';
      stats.topDestinations[dest] = (stats.topDestinations[dest] || 0) + row.count;
    });

    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(200).json({ success: false, message: error.message });
  }
};

