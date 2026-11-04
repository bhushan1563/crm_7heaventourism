import GuestModel from '../models/Guest.js';
import QuotationModel from '../models/Quotation.js';
import ConfirmationModel from '../models/Confirmation.js';
import { friendlyMessage } from '../utils/errors.js';
import { eventOf, lookBackFrom, overlaps, paymentEventOf, rangeOf } from '../utils/calendarEvents.js';
import { balanceOf } from '../utils/confirmationInput.js';

const LIMIT = 2000;

const mayRead = (req, moduleName) => {
  if (req.user && (req.user.role === 'Admin' || req.user.role === 'SuperAdmin')) return true;
  const rights = req.userRights?.[moduleName];
  return rights ? Boolean(rights.canRead) : true; // nothing stored: "all data can be seen by any user", as everywhere else
};

/**
 * GET /api/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD
 * The guests, quotations and bookings travelling in that range, each source only when the person may read it. A quotation that
 * has been confirmed is left out: its booking stands for it, so one trip is not shown twice. A booking that still owes money also puts
 * its payment deadline (the balance due date) on the calendar.
 */
export const getCalendar = async (req, res) => {
  try {
    const range = rangeOf(req.query);
    if (!range.ok) return res.status(200).json({ success: false, message: range.message });
    const { from, to } = range;
    const window = { $gte: new Date(`${lookBackFrom(from)}T00:00:00Z`), $lte: new Date(`${to}T23:59:59Z`) };

    const sources = { guests: mayRead(req, 'guest_list'), quotations: mayRead(req, 'quotations'), confirmations: mayRead(req, 'confirmations') };
    const [guests, quotations, confirmations] = await Promise.all([
      sources.guests ? GuestModel.find({ deleted: false, travelDate: window }).select('srNo guestNames destination travelDate status sales ops paxCount').limit(LIMIT).lean() : [],
      sources.quotations
        ? QuotationModel.find({ deleted: false, travelDate: window, $or: [{ confirmationId: '' }, { confirmationId: null }, { confirmationId: { $exists: false } }] })
            .select('quotationNo clientName destination duration travelDate status sales ops paxDetails quotationType').limit(LIMIT).lean()
        : [],
      sources.confirmations
        ? ConfirmationModel.find({ $or: [{ travelDate: window }, { 'payment.balanceDueDate': { $gte: new Date(`${from}T00:00:00Z`), $lte: new Date(`${to}T23:59:59Z`) } }] })
            .select('confirmationNo clientName destination duration travelDate status sales ops paxDetails quotationType payment').limit(LIMIT).lean()
        : []
    ]);

    const events = [
      ...guests.map((d) => eventOf('guest', d)),
      ...quotations.map((d) => eventOf('quotation', d)),
      ...confirmations.map((d) => eventOf('confirmation', d)),
      ...confirmations.map((d) => paymentEventOf(d, balanceOf(d.payment)))
    ]
      .filter((e) => e && overlaps(e, from, to))
      .sort((a, b) => a.start.localeCompare(b.start) || b.end.localeCompare(a.end) || a.title.localeCompare(b.title));

    res.json({ success: true, from, to, sources, count: events.length, data: events });
  } catch (error) {
    res.status(200).json({ success: false, message: friendlyMessage(error, 'Failed to load the travel calendar') });
  }
};
