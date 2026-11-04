import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ create: vi.fn(), markAdded: vi.fn() }));
vi.mock('../services/hotelService', () => ({ default: { create: h.create } }));
vi.mock('../services/hotelFinderService', () => ({ default: { markAdded: h.markAdded } }));
vi.mock('../services/api', () => ({ getErrorMessage: (e, f) => e?.message || f, default: {} }));
import { addFoundToHotelList } from './addFoundToHotels';

const found = (over = {}) => ({ _id: 'f1', name: 'Palm Grove', address: { locality: 'Goa', country: 'India' }, phones: ['+91 832 227 5599'], emails: [], amenities: ['Pool'], photos: [], ...over });

describe('addFoundToHotelList', () => {
  beforeEach(() => { h.create.mockReset(); h.markAdded.mockReset(); });

  it('creates the hotel straight from the find and marks the find as added', async () => {
    h.create.mockResolvedValue({ success: true, data: { _id: 'h1' } });
    h.markAdded.mockResolvedValue({ success: true });
    const r = await addFoundToHotelList(found());
    expect(r).toMatchObject({ ok: true, marked: true, hotel: { _id: 'h1' } });
    expect(h.create).toHaveBeenCalledWith(expect.objectContaining({ name: 'Palm Grove', city: 'Goa' }));
    expect(h.markAdded).toHaveBeenCalledWith('f1', 'h1');
  });

  it('asks for the form, without calling the server, when the name or city is missing', async () => {
    expect(await addFoundToHotelList(found({ address: {} }))).toEqual({ ok: false, needsForm: true });
    expect(h.create).not.toHaveBeenCalled();
  });

  it('says so when the hotel was added but could not be marked, and passes on a refusal', async () => {
    h.create.mockResolvedValue({ success: true, data: { _id: 'h2' } });
    h.markAdded.mockRejectedValue(new Error('offline'));
    expect(await addFoundToHotelList(found())).toMatchObject({ ok: true, marked: false });
    h.create.mockResolvedValue({ success: false, message: 'A hotel with this name exists.' });
    expect(await addFoundToHotelList(found())).toEqual({ ok: false, message: 'A hotel with this name exists.' });
  });
});
