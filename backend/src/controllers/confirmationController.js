import mongoose from 'mongoose';
import ConfirmationModel from '../models/Confirmation.js';
import QuotationModel from '../models/Quotation.js';
import GuestModel from '../models/Guest.js';
import { findQuotationDocument } from './quotationController.js';
import { findGuestDocument } from './guestController.js';
import { confirmationFromQuotation } from '../utils/confirmationSnapshot.js';
import { balanceOf, isFullyPaid, normalizeBookingInput, normalizeCancelReason } from '../utils/confirmationInput.js';
import { escapeRegex, queryString } from '../utils/security.js';
import { friendlyMessage } from '../utils/errors.js';

const fail = (res, message) => res.status(200).json({ success: false, message });
const fullName = (user) => `${user.firstName} ${user.lastName}`.trim();
const clampInt = (value, min, max, fallback) => {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

// A guest moves to "Confirmed" only from an earlier stage; one who is already confirmed, paid or travelled is left as they are.
const GUEST_STATUSES_BEFORE_CONFIRMATION = ['Under Process', 'Follow up', 'Quoted'];
const QUOTATION_STATUSES_THAT_CANNOT_BE_CONFIRMED = ['Cancelled', 'Expired'];

/** The record as the web app receives it (the balance is calculated here, never stored). */
const present = (doc) => {
  const { __v, ...rest } = doc.toObject ? doc.toObject() : doc;
  return { ...rest, balance: balanceOf(rest.payment) };
};

/** Used by the ownership check and the routes. Accepts the database id or the confirmation number. */
export const findConfirmationDocument = async (id) => {
  if (!id) return null;
  if (mongoose.isValidObjectId(id)) {
    const byId = await ConfirmationModel.findById(id);
    if (byId) return byId;
  }
  return ConfirmationModel.findOne({ confirmationNo: String(id) });
};

/** The quotation named in the body of a "confirm" request (for the ownership check). */
export const findQuotationToConfirm = async (req) => {
  const id = req.body?.quotationId;
  if (typeof id !== 'string' || !id) return null;
  const quotation = await findQuotationDocument(id);
  return quotation && !quotation.deleted ? quotation : null;
};

const getNextConfirmationNo = async () => {
  const prefix = `7H-CF-${new Date().getFullYear()}-`;
  const rows = await ConfirmationModel.find({ confirmationNo: new RegExp(`^${prefix}`) }).select('confirmationNo').lean();
  let max = 0;
  for (const row of rows) {
    const n = parseInt(String(row.confirmationNo).replace(prefix, ''), 10);
    if (!Number.isNaN(n) && n > max) max = n;
  }
  return `${prefix}${String(max + 1).padStart(3, '0')}`;
};

/** Moves the guest on with the booking, remembering where they were so cancelling can put them back. Returns that earlier status. */
const confirmGuest = async (guestId) => {
  const guest = guestId ? await findGuestDocument(guestId) : null;
  if (!guest || !GUEST_STATUSES_BEFORE_CONFIRMATION.includes(guest.status)) return '';
  await GuestModel.updateOne({ _id: guest._id, status: guest.status }, { $set: { status: 'Confirmed' } });
  return guest.status;
};

export const getConfirmations = async (req, res) => {
  try {
    const search = queryString(req.query.search);
    const status = queryString(req.query.status) || 'all';
    const limit = clampInt(req.query.limit, 1, 50, 20);
    const page = clampInt(req.query.page, 1, 10000, 1);

    const filter = {};
    if (status === 'Confirmed' || status === 'Cancelled') filter.status = status;
    if (search) {
      const rx = new RegExp(escapeRegex(search.slice(0, 100)), 'i');
      filter.$or = [{ confirmationNo: rx }, { quotationNo: rx }, { clientName: rx }, { destination: rx }, { clientPhone: rx }, { clientEmail: rx }, { sales: rx }, { ops: rx }, { 'travellers.name': rx }];
    }

    const [total, rows] = await Promise.all([
      ConfirmationModel.countDocuments(filter),
      // The frozen copy of the quotation stays in the database: the list shows only what it needs.
      ConfirmationModel.find(filter).select('-quote -previousQuotationStatus -previousQuotationLocked -previousGuestStatus -__v').sort({ updatedAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean()
    ]);

    res.json({ success: true, data: rows.map((r) => ({ ...r, balance: balanceOf(r.payment) })), page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) });
  } catch (error) {
    fail(res, friendlyMessage(error, 'Failed to load confirmations'));
  }
};

export const getConfirmationById = async (req, res) => {
  try {
    const doc = await findConfirmationDocument(req.params.id);
    if (!doc) return fail(res, 'Confirmation not found.');
    res.json({ success: true, data: present(doc) });
  } catch (error) {
    fail(res, friendlyMessage(error));
  }
};

/** Turns a quotation into a booking confirmation: a frozen copy plus the booking information, with the quotation locked. */
export const createConfirmation = async (req, res) => {
  try {
    const quotation = await findQuotationToConfirm(req);
    if (!quotation) return fail(res, 'Quotation not found. It may have been deleted.');
    if (quotation.confirmationId) return fail(res, `This quotation is already confirmed as ${quotation.confirmationNo || 'a booking'}. Open that confirmation instead.`);
    if (QUOTATION_STATUSES_THAT_CANNOT_BE_CONFIRMED.includes(quotation.status)) {
      return fail(res, `This quotation is ${quotation.status.toLowerCase()}. Change its status on the quotation before confirming it.`);
    }
    // Problems with the chosen option are reported before anything is changed.
    const early = confirmationFromQuotation(quotation.toObject(), req.body.optionIndex);
    if (!early.ok) return fail(res, early.message);
    const booking = normalizeBookingInput({ travellers: req.body.travellers, notes: req.body.notes, customFields: req.body.customFields });
    if (!booking.ok) return fail(res, booking.message);

    // Claim the quotation first, in one step: of two people confirming at the same moment only one gets it. What it was before
    // (status, lock) comes back with the claim, so the copy is of exactly what was claimed and a failure can be undone.
    const claimed = await QuotationModel.findOneAndUpdate(
      { _id: quotation._id, deleted: false, confirmationId: { $in: ['', null] } },
      { $set: { status: 'Confirmed', isLocked: true, confirmationId: 'pending' } },
      { new: false }
    );
    if (!claimed) return fail(res, 'This quotation was just confirmed by someone else. Please reload the list.');

    const undoClaim = () =>
      QuotationModel.updateOne({ _id: claimed._id }, { $set: { status: claimed.status, isLocked: claimed.isLocked, confirmationId: '', confirmationNo: '' } });

    try {
      const snapshot = confirmationFromQuotation(claimed.toObject(), req.body.optionIndex);
      if (!snapshot.ok) {
        await undoClaim();
        return fail(res, snapshot.message);
      }
      const previousGuestStatus = await confirmGuest(claimed.guestId);
      const me = { id: String(req.user._id), name: fullName(req.user) };

      let doc;
      for (let attempt = 0; !doc && attempt < 5; attempt += 1) {
        try {
          doc = await ConfirmationModel.create({
            confirmationNo: await getNextConfirmationNo(),
            quotationId: String(claimed._id),
            quotationNo: claimed.quotationNo,
            guestId: claimed.guestId || '',
            clientName: claimed.clientName,
            clientEmail: claimed.clientEmail || '',
            clientPhone: claimed.clientPhone || '',
            destination: claimed.destination,
            duration: claimed.duration || '',
            paxDetails: claimed.paxDetails || '',
            quotationType: claimed.quotationType,
            travelDate: claimed.travelDate,
            optionName: snapshot.optionName,
            quote: snapshot.quote,
            previousQuotationStatus: claimed.status,
            previousQuotationLocked: Boolean(claimed.isLocked),
            previousGuestStatus,
            ...booking.data,
            payment: { totalAmount: snapshot.totalAmount, received: 0, balanceDueDate: null, note: '' },
            sales: claimed.sales || '',
            salesId: claimed.salesId ? String(claimed.salesId) : '',
            ops: claimed.ops || '',
            opsId: claimed.opsId ? String(claimed.opsId) : '',
            createdBy: me.id,
            createdByName: me.name,
            updatedBy: me.id,
            updatedByName: me.name
          });
        } catch (error) {
          if (error?.code === 11000 && error.keyPattern?.confirmationNo) continue; // two numbers drawn at once: draw again
          throw error;
        }
      }
      if (!doc) throw new Error('Could not number the confirmation');

      await QuotationModel.updateOne({ _id: claimed._id }, { $set: { confirmationId: String(doc._id), confirmationNo: doc.confirmationNo } });
      res.json({ success: true, message: `Booking confirmed as ${doc.confirmationNo}. The quotation is now locked.`, data: present(doc) });
    } catch (error) {
      await undoClaim().catch(() => {});
      if (error?.code === 11000) return fail(res, 'This quotation was just confirmed by someone else. Please reload the list.');
      throw error;
    }
  } catch (error) {
    fail(res, friendlyMessage(error, 'Failed to confirm the booking'));
  }
};

export const updateConfirmation = async (req, res) => {
  try {
    const existing = await findConfirmationDocument(req.params.id);
    if (!existing) return fail(res, 'Confirmation not found.');
    if (existing.status === 'Cancelled') return fail(res, 'This confirmation was cancelled and can no longer be changed.');

    const input = normalizeBookingInput(req.body, { payment: existing.payment });
    if (!input.ok) return fail(res, input.message);

    // Two people editing the same booking: the second save must not silently overwrite the first.
    const conflict = () =>
      fail(res, `This confirmation was changed by ${existing.updatedByName || existing.createdByName || 'someone else'} while you were editing it. Please reload to see their changes before saving.`);
    if (req.body.updatedAt !== undefined) {
      const seen = new Date(req.body.updatedAt).getTime();
      if (!Number.isFinite(seen) || seen !== existing.updatedAt.getTime()) return conflict();
    }

    const updated = await ConfirmationModel.findOneAndUpdate(
      { _id: existing._id, status: 'Confirmed', updatedAt: existing.updatedAt }, // the version we validated against
      { $set: { ...input.data, updatedBy: String(req.user._id), updatedByName: fullName(req.user) } },
      { new: true, runValidators: true }
    );
    if (!updated) return conflict();

    // Everything received: the guest moves on from "Confirmed" to "Confirmed & Payment received" (never the other way).
    if (isFullyPaid(updated.payment) && updated.guestId) {
      const guest = await findGuestDocument(updated.guestId);
      if (guest?.status === 'Confirmed') await GuestModel.updateOne({ _id: guest._id, status: 'Confirmed' }, { $set: { status: 'Confirmed & Payment received' } });
    }
    res.json({ success: true, message: 'Booking details saved.', data: present(updated) });
  } catch (error) {
    fail(res, friendlyMessage(error, 'Failed to save the booking details'));
  }
};

/** Cancels the booking: the quotation is unlocked and the statuses go back to what they were. The record itself is kept. */
export const cancelConfirmation = async (req, res) => {
  try {
    const existing = await findConfirmationDocument(req.params.id);
    if (!existing) return fail(res, 'Confirmation not found.');
    if (existing.status === 'Cancelled') return fail(res, 'This confirmation was already cancelled.');
    const reason = normalizeCancelReason(req.body?.reason);
    if (!reason.ok) return fail(res, reason.message);

    const cancelled = await ConfirmationModel.findOneAndUpdate(
      { _id: existing._id, status: 'Confirmed' },
      { $set: { status: 'Cancelled', cancelledAt: new Date(), cancelledByName: fullName(req.user), cancelReason: reason.value, updatedBy: String(req.user._id), updatedByName: fullName(req.user) } },
      { new: true }
    );
    if (!cancelled) return fail(res, 'This confirmation was already cancelled.');

    // Only the quotation that still belongs to this confirmation is unlocked (never one that was meanwhile re-confirmed).
    await QuotationModel.updateOne(
      { _id: cancelled.quotationId, confirmationId: String(cancelled._id) },
      { $set: { confirmationId: '', confirmationNo: '', isLocked: cancelled.previousQuotationLocked, status: cancelled.previousQuotationStatus || 'Sent' } }
    );
    if (cancelled.previousGuestStatus && cancelled.guestId) {
      const guest = await findGuestDocument(cancelled.guestId);
      if (guest?.status === 'Confirmed') await GuestModel.updateOne({ _id: guest._id, status: 'Confirmed' }, { $set: { status: cancelled.previousGuestStatus } });
    }
    res.json({ success: true, message: `Booking ${cancelled.confirmationNo} cancelled. The quotation can be edited again.`, data: present(cancelled) });
  } catch (error) {
    fail(res, friendlyMessage(error, 'Failed to cancel the booking'));
  }
};
