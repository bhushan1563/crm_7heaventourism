import GuestModel from '../models/Guest.js';
import QuotationModel from '../models/Quotation.js';
import ConfirmationModel from '../models/Confirmation.js';
import ManualCalendarEvent from '../models/ManualCalendarEvent.js';
import { friendlyMessage } from '../utils/errors.js';
import { mayRead } from '../utils/mayRead.js';
import { daysBetween, eventOf, isIsoDate, lookBackFrom, overlaps, paymentEventOf, rangeOf } from '../utils/calendarEvents.js';
import { balanceOf } from '../utils/confirmationInput.js';

const LIMIT = 2000;

const manualEventOf = (doc) => ({
  id: `manual:${doc._id}`,
  kind: doc.kind,
  recordId: String(doc._id),
  title: doc.title,
  ref: null,
  destination: doc.destination || '',
  status: doc.kind === 'payment' ? 'Payment due' : 'Manual',
  start: doc.start,
  end: doc.end || doc.start,
  nights: doc.kind !== 'payment' ? Math.max(0, daysBetween(doc.start, doc.end || doc.start)) : 0,
  pax: null,
  amount: doc.amount || null,
  supplier: doc.supplier || '',
  travelStart: null,
  sales: null,
  ops: null,
  link: null,
  isManual: true
});

/**
 * GET /api/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD
 * The guests, quotations and bookings travelling in that range, each source only when the person may read it.
 * Manual events (added from the calendar) are always included.
 */
export const getCalendar = async (req, res) => {
  try {
    const range = rangeOf(req.query);
    if (!range.ok) return res.status(200).json({ success: false, message: range.message });
    const { from, to } = range;
    const window = { $gte: new Date(`${lookBackFrom(from)}T00:00:00Z`), $lte: new Date(`${to}T23:59:59Z`) };

    const sources = { guests: mayRead(req, 'guest_list'), quotations: mayRead(req, 'quotations'), confirmations: mayRead(req, 'confirmations') };
    const [guests, quotations, confirmations, manuals] = await Promise.all([
      sources.guests ? GuestModel.find({ deleted: false, travelDate: window }).select('srNo guestNames destination travelDate status sales ops paxCount').limit(LIMIT).lean() : [],
      sources.quotations
        ? QuotationModel.find({ deleted: false, travelDate: window, $or: [{ confirmationId: '' }, { confirmationId: null }, { confirmationId: { $exists: false } }] })
            .select('quotationNo clientName destination duration travelDate status sales ops paxDetails quotationType').limit(LIMIT).lean()
        : [],
      sources.confirmations
        ? ConfirmationModel.find({ $or: [{ travelDate: window }, { 'payment.balanceDueDate': { $gte: new Date(`${from}T00:00:00Z`), $lte: new Date(`${to}T23:59:59Z`) } }] })
            .select('confirmationNo clientName destination duration travelDate status sales ops paxDetails quotationType payment').limit(LIMIT).lean()
        : [],
      ManualCalendarEvent.find({ start: { $gte: from }, end: { $lte: to } }).lean()
    ]);

    const events = [
      ...guests.map((d) => eventOf('guest', d)),
      ...quotations.map((d) => eventOf('quotation', d)),
      ...confirmations.map((d) => eventOf('confirmation', d)),
      ...confirmations.map((d) => paymentEventOf(d, balanceOf(d.payment))),
      ...manuals.map(manualEventOf)
    ]
      .filter((e) => e && overlaps(e, from, to))
      .sort((a, b) => a.start.localeCompare(b.start) || b.end.localeCompare(a.end) || a.title.localeCompare(b.title));

    res.json({ success: true, from, to, sources, count: events.length, data: events });
  } catch (error) {
    res.status(200).json({ success: false, message: friendlyMessage(error, 'Failed to load the travel calendar') });
  }
};

/** POST /api/calendar/manual — save a manually-added event. */
export const createManual = async (req, res) => {
  try {
    const { title, kind, start, end, destination, amount, supplier, notes } = req.body;
    if (!title?.trim()) return res.status(400).json({ success: false, message: 'Guest name is required.' });
    if (!isIsoDate(start)) return res.status(400).json({ success: false, message: 'Date is required (YYYY-MM-DD).' });
    const validKind = ['payment', 'confirmation', 'quotation', 'guest'].includes(kind) ? kind : 'payment';
    const doc = await ManualCalendarEvent.create({
      title: title.trim(),
      kind: validKind,
      start,
      end: isIsoDate(end) ? end : start,
      destination: destination?.trim() || '',
      amount: amount?.trim() || '',
      supplier: typeof supplier === 'string' ? supplier.trim().slice(0, 100) : '',
      notes: notes?.trim() || '',
      createdBy: req.user._id
    });
    res.json({ success: true, data: manualEventOf(doc) });
  } catch (error) {
    res.status(200).json({ success: false, message: friendlyMessage(error, 'Could not save the event.') });
  }
};

/** DELETE /api/calendar/manual/:id — remove a manually-added event. */
export const deleteManual = async (req, res) => {
  try {
    const doc = await ManualCalendarEvent.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ success: false, message: 'Event not found.' });
    res.json({ success: true });
  } catch (error) {
    res.status(200).json({ success: false, message: friendlyMessage(error, 'Could not delete the event.') });
  }
};
