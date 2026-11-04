import hotelService from '../services/hotelService';
import hotelFinderService from '../services/hotelFinderService';
import { getErrorMessage } from '../services/api';
import { emptyHotel, toPayload, validateHotel } from './hotel';
import { foundToHotelForm } from './hotelFinder';

/**
 * Puts a saved found hotel straight into the main hotel list, with no form in between.
 * Answers { ok: true, hotel } when it was added, { ok: false, needsForm: true } when the find lacks what the hotel list requires
 * (the person then completes it in the hotel form), or { ok: false, message } when the server refused.
 */
export const addFoundToHotelList = async (found) => {
  const form = foundToHotelForm(found, emptyHotel());
  if (Object.keys(validateHotel(form)).length) return { ok: false, needsForm: true };
  try {
    const res = await hotelService.create(toPayload(form));
    if (!res.success) return { ok: false, message: res.message || 'The hotel could not be added to the hotel list.' };
    let marked = true;
    try {
      marked = Boolean((await hotelFinderService.markAdded(found._id, res.data._id)).success);
    } catch {
      marked = false;
    }
    return { ok: true, hotel: res.data, marked };
  } catch (err) {
    return { ok: false, message: getErrorMessage(err, 'The hotel could not be added to the hotel list.') };
  }
};

export default addFoundToHotelList;
