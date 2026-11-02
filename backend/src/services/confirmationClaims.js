import QuotationModel from '../models/Quotation.js';
import ConfirmationModel from '../models/Confirmation.js';

// Confirming a quotation first CLAIMS it (so two people cannot confirm it at once) and then creates the confirmation. If the
// server stops between those two steps (a restart while someone presses the button), the quotation would stay locked behind the
// placeholder with no booking behind it. A claim older than a couple of minutes is such a leftover and is released here.

export const CLAIM_MARK = 'pending';
const STALE_AFTER_MS = 2 * 60 * 1000;

export const isStaleClaim = (quotation, now = Date.now()) =>
  quotation?.confirmationId === CLAIM_MARK && now - new Date(quotation.updatedAt).getTime() > STALE_AFTER_MS;

/**
 * Releases the quotation if its claim was left behind. When a live confirmation was in fact created, the quotation is linked to it;
 * otherwise it is unlocked and returns to "Sent" (what it was before is not known any more).
 * @returns {Promise<boolean>} true when something was changed
 */
export const releaseStaleClaim = async (quotation) => {
  if (!isStaleClaim(quotation)) return false;
  const live = await ConfirmationModel.findOne({ quotationId: String(quotation._id), status: 'Confirmed' }).select('confirmationNo').lean();
  const set = live
    ? { confirmationId: String(live._id), confirmationNo: live.confirmationNo }
    : { confirmationId: '', confirmationNo: '', isLocked: false, status: 'Sent' };
  const result = await QuotationModel.updateOne({ _id: quotation._id, confirmationId: CLAIM_MARK }, { $set: set });
  return result.modifiedCount > 0;
};
