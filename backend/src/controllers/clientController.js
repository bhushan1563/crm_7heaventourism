import mongoose from 'mongoose';
import GuestModel from '../models/Guest.js';
import ConfirmationModel from '../models/Confirmation.js';
import FutureClientModel from '../models/FutureClient.js';
import { friendlyMessage } from '../utils/errors.js';
import { mayRead } from '../utils/mayRead.js';
import { clientsFrom } from '../utils/clientDirectory.js';
import { normalizeFutureClient } from '../utils/clientInput.js';

const LIMIT = 5000;
const fullName = (user) => `${user.firstName || ''} ${user.lastName || ''}`.trim();
const fail = (res, message) => res.status(200).json({ success: false, message });

export const findFutureClient = async (req) => {
  const id = req.params.id;
  return id && mongoose.isValidObjectId(id) ? FutureClientModel.findById(id) : null;
};

/**
 * GET /api/clients/current
 * Everyone who has an inquiry or a booking, one entry per person with all their e-mail addresses and numbers, each source only when
 * the person may read it.
 */
export const getCurrentClients = async (req, res) => {
  try {
    const sources = { guests: mayRead(req, 'guest_list'), confirmations: mayRead(req, 'confirmations') };
    const [guests, confirmations] = await Promise.all([
      sources.guests ? GuestModel.find({ deleted: false }).select('guestNames email contactNumber destination travelDate status sales createdAt').limit(LIMIT).lean() : [],
      sources.confirmations ? ConfirmationModel.find({}).select('clientName clientEmail clientPhone destination travelDate status sales createdAt').limit(LIMIT).lean() : []
    ]);
    const data = clientsFrom({ guests, confirmations });
    res.json({ success: true, sources, count: data.length, data });
  } catch (error) {
    fail(res, friendlyMessage(error, 'Failed to load the clients'));
  }
};

/** GET /api/clients/future */
export const getFutureClients = async (req, res) => {
  try {
    const data = await FutureClientModel.find({}).sort({ createdAt: -1 }).limit(LIMIT).lean();
    res.json({ success: true, count: data.length, data });
  } catch (error) {
    fail(res, friendlyMessage(error, 'Failed to load the future clients'));
  }
};

/** POST /api/clients/future */
export const createFutureClient = async (req, res) => {
  try {
    const input = normalizeFutureClient(req.body);
    if (!input.ok) return fail(res, input.message);
    const created = await FutureClientModel.create({ ...input.data, createdBy: String(req.user._id), createdByName: fullName(req.user) });
    res.status(201).json({ success: true, message: 'Client added.', data: created });
  } catch (error) {
    fail(res, friendlyMessage(error, 'Failed to add the client'));
  }
};

/** PUT /api/clients/future/:id */
export const updateFutureClient = async (req, res) => {
  try {
    const input = normalizeFutureClient(req.body, { partial: true });
    if (!input.ok) return fail(res, input.message);
    const existing = req.targetRecord || (await findFutureClient(req));
    if (!existing) return fail(res, 'Client not found.');
    const updated = await FutureClientModel.findByIdAndUpdate(
      existing._id,
      { $set: { ...input.data, updatedBy: String(req.user._id), updatedByName: fullName(req.user) } },
      { new: true, runValidators: true }
    );
    res.json({ success: true, message: 'Client saved.', data: updated });
  } catch (error) {
    fail(res, friendlyMessage(error, 'Failed to save the client'));
  }
};

/** DELETE /api/clients/future/:id */
export const deleteFutureClient = async (req, res) => {
  try {
    const existing = req.targetRecord || (await findFutureClient(req));
    if (!existing) return fail(res, 'Client not found.');
    await FutureClientModel.deleteOne({ _id: existing._id });
    res.json({ success: true, message: 'Client removed.' });
  } catch (error) {
    fail(res, friendlyMessage(error, 'Failed to remove the client'));
  }
};
