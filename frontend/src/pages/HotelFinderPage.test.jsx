import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const h = vi.hoisted(() => ({ showToast: vi.fn(), navigate: vi.fn(), perms: { create: true }, addFound: vi.fn() }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ can: (m, a) => (a === 'canCreate' ? h.perms.create : true) }) }));
vi.mock('../context/ToastContext', () => ({ useToast: () => ({ showToast: h.showToast }) }));
vi.mock('react-router-dom', async (orig) => ({ ...(await orig()), useNavigate: () => h.navigate }));
vi.mock('../services/api', () => ({ API_ORIGIN: '', getErrorMessage: (e, fallback) => e?.message || fallback, default: {} }));
vi.mock('../services/hotelFinderService', () => ({ default: { find: vi.fn(), findText: vi.fn(), create: vi.fn() } }));
vi.mock('../utils/addFoundToHotels', () => ({ addFoundToHotelList: (...a) => h.addFound(...a) }));
vi.mock('../services/mediaService', () => ({ uploadPhoto: vi.fn() }));
vi.mock('../utils/pastedImages', () => ({ fileFromUrl: vi.fn() }));
vi.mock('../utils/hotelFinderExport', () => ({ exportFoundCsv: vi.fn(async () => ({ ok: true })), exportFoundDocx: vi.fn(async () => ({})), exportFoundPdf: vi.fn(async () => ({})), loadPictures: vi.fn(async () => []) }));

import hotelFinderService from '../services/hotelFinderService';
import { uploadPhoto } from '../services/mediaService';
import { fileFromUrl } from '../utils/pastedImages';
import { exportFoundCsv, exportFoundDocx, exportFoundPdf } from '../utils/hotelFinderExport';
import HotelFinderPage from './HotelFinderPage';

const image = (n) => ({ url: `https://palmgrove.com/p${n}.jpg`, preview: `/finder-image/t${n}`, alt: `Picture ${n}`, width: 1200, height: 800, role: 'gallery', confidence: 0.7 });
const findData = (over = {}) => ({
  sourceUrl: 'https://palmgrove.com/', site: 'palmgrove.com', source: 'website', likelyHotel: true,
  completeness: { score: 72, found: ['name'], missing: ['pictures'] },
  warnings: ['The rates are as printed on the website. They may be for one room type or a season: check them before quoting a guest.'],
  pages: [{ url: 'https://palmgrove.com/', kind: 'start', label: 'The address you gave', status: 200, title: 'Palm Grove' }, { url: 'https://palmgrove.com/contact', kind: 'contact', label: 'Contact page', status: 200, title: 'Contact' }],
  skipped: [{ url: 'https://palmgrove.com/private', reason: 'robots.txt asks not to read it' }],
  fieldInfo: { name: { level: 'high' }, address: { level: 'medium' }, addressParts: { locality: { level: 'medium' }, country: { level: 'low' } }, phones: [{ level: 'high' }], emails: [{ level: 'low' }], rates: { level: 'low' }, checkIn: { level: 'high' } },
  hotel: {
    name: 'Palm Grove Resort', propertyType: 'Resort', starRating: '4 star', tagline: 'By the sea', description: 'A beachside resort with two pools.',
    address: { full: '12 Candolim Beach Road, Candolim, Goa 403515, India', street: '12 Candolim Beach Road', locality: 'Candolim', region: 'Goa', postalCode: '403515', country: 'India' },
    geo: { lat: 15.5, lng: 73.76 }, phones: [{ display: '+91 832 227 5599', note: '', level: 'high' }], emails: ['stay@palmgrove.com'], website: 'https://palmgrove.com', social: [{ network: 'facebook', url: 'https://www.facebook.com/palmgrove' }],
    checkIn: '14:00', checkOut: '11:00', amenities: ['Pool', 'Spa'], rooms: [{ name: 'Sea View Room', details: 'A bright room.' }],
    rates: { currency: 'INR', from: 6500, to: 9000, unit: 'night', text: 'From Rs 6,500 per night', note: "As printed on the hotel's own website. Check it with the hotel before quoting.", lines: [{ text: 'From Rs 6,500 per night', from: 6500, to: 6500, unit: 'night' }] },
    priceLevel: 0, guestRating: { value: 4.5, best: 5, count: 1200 }, policies: { cancellation: 'Free until 7 days before.', children: '', pets: '' }, images: Array.from({ length: 10 }, (_, i) => image(i + 1)), logo: '', ...(over.hotel || {})
  },
  ...Object.fromEntries(Object.entries(over).filter(([k]) => k !== 'hotel'))
});

const show = () => render(<MemoryRouter><HotelFinderPage /></MemoryRouter>);
const address = () => screen.getByLabelText('Hotel website address');
const find = async (text = 'palmgrove.com') => {
  await userEvent.type(address(), text);
  await userEvent.click(screen.getByRole('button', { name: /find details/i }));
};
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };

beforeEach(() => {
  for (const fn of [hotelFinderService.find, hotelFinderService.findText, hotelFinderService.create, uploadPhoto, fileFromUrl, exportFoundCsv, exportFoundDocx, exportFoundPdf]) fn.mockClear();
  hotelFinderService.find.mockReset();
  hotelFinderService.findText.mockReset();
  hotelFinderService.create.mockReset();
  uploadPhoto.mockReset();
  fileFromUrl.mockReset();
  fileFromUrl.mockResolvedValue(new File(['x'], 'p.jpg', { type: 'image/jpeg' }));
  let n = 0;
  uploadPhoto.mockImplementation(async () => ({ token: `T${++n}`.padEnd(24, 'x'), width: 1000, height: 700 }));
  h.showToast.mockReset();
  h.navigate.mockReset();
  h.perms.create = true;
});
afterEach(cleanup);

describe('the address box', () => {
  it('asks for an address, and a mistake is shown at once without asking the server', async () => {
    show();
    await userEvent.click(screen.getByRole('button', { name: /find details/i }));
    expect(screen.getByRole('alert')).toHaveTextContent("Please paste the hotel's website address.");
    expect(address()).toHaveAttribute('aria-invalid', 'true');
    expect(address()).toHaveFocus();
    for (const [typed, message] of [['two words', /space/], ['javascript:alert(1)', /http/], ['hotel', /website name/]]) {
      await userEvent.clear(address());
      await userEvent.type(address(), typed);
      await userEvent.click(screen.getByRole('button', { name: /find details/i }));
      expect(screen.getByRole('alert')).toHaveTextContent(message);
    }
    expect(hotelFinderService.find).not.toHaveBeenCalled();
    await userEvent.type(address(), 'x');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('is locked for someone who may not add hotels', () => {
    h.perms.create = false;
    show();
    expect(screen.getByText(/do not have permission to use the hotel finder/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Hotel website address')).toBeNull();
  });
});

describe('finding', () => {
  it('shows what the finder is doing, then the hotel with how sure each fact is', async () => {
    const wait = deferred();
    hotelFinderService.find.mockReturnValue(wait.promise);
    show();
    await find();
    expect(hotelFinderService.find).toHaveBeenCalledWith('palmgrove.com');
    expect(screen.getByRole('button', { name: /finding/i })).toBeDisabled();
    expect(address()).toBeDisabled();
    expect(screen.getByLabelText('What the finder is doing')).toHaveTextContent('Checking the address…');
    await act(async () => wait.resolve({ success: true, data: findData() }));

    expect(await screen.findByRole('heading', { name: /Palm Grove Resort/ })).toBeInTheDocument();
    expect(screen.getByText('72 out of 100 complete. Not found: pictures.')).toBeInTheDocument();
    expect(screen.getByText('+91 832 227 5599')).toBeInTheDocument();
    expect(screen.getByText('stay@palmgrove.com')).toBeInTheDocument();
    expect(screen.getByText(/12 Candolim Beach Road/)).toBeInTheDocument();
    expect(screen.getByText('2:00 PM')).toBeInTheDocument();
    expect(screen.getByText('Sea View Room')).toBeInTheDocument();
    expect(screen.getByText('Rs 6,500 to Rs 9,000 a night')).toBeInTheDocument();
    expect(screen.getByText(/Check it with the hotel before quoting/)).toBeInTheDocument();
    expect(screen.getByText(/check them before quoting a guest/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open in Google Maps/ })).toHaveAttribute('href', 'https://www.google.com/maps?q=15.5,73.76');
    expect(screen.getByRole('link', { name: 'facebook' })).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getAllByRole('img', { name: 'Sure' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('img', { name: 'Please check' }).length).toBeGreaterThan(0);
    expect(screen.getByText(/Not read: https:\/\/palmgrove.com\/private \(robots.txt asks not to read it\)/)).toBeInTheDocument();
    expect(screen.getByText(/The address you gave/)).toBeInTheDocument();
  });

  it('every trouble is shown in words, with the paste option when it could help', async () => {
    hotelFinderService.find.mockResolvedValue({ success: false, message: 'palmgrove.com does not allow automatic reading of this page.', code: 'BLOCKED_BY_SITE', canPaste: true });
    show();
    await find();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('does not allow automatic reading');
    expect(within(alert).getByRole('button', { name: /paste the page's text/i })).toBeInTheDocument();
    expect(within(alert).getByRole('button', { name: /try again/i })).toBeInTheDocument();
    cleanup();

    hotelFinderService.find.mockResolvedValue({ success: false, message: 'We could not find the website nowhere.example.', code: 'DNS_FAILED', canPaste: false });
    show();
    await find('nowhere.example.com');
    const second = await screen.findByRole('alert');
    expect(second).toHaveTextContent('We could not find the website');
    expect(within(second).queryByRole('button', { name: /paste/i })).toBeNull();
    cleanup();

    hotelFinderService.find.mockRejectedValue(new Error('Network Error'));
    show();
    await find();
    expect(await screen.findByRole('alert')).toHaveTextContent('Network Error');
  });

  it('a slow first search never overwrites a newer one', async () => {
    const first = deferred();
    const second = deferred();
    hotelFinderService.find.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    show();
    await find('slow-hotel.com');
    // the box is locked while reading, so a second search starts from a paste (the other way to start one)
    await act(async () => first.resolve({ success: true, data: findData({ hotel: { name: 'Slow Hotel' } }) }));
    expect(await screen.findByRole('heading', { name: /Slow Hotel/ })).toBeInTheDocument();
    await userEvent.clear(address());
    await userEvent.type(address(), 'fast-hotel.com');
    await userEvent.click(screen.getByRole('button', { name: /find details/i }));
    await act(async () => second.resolve({ success: true, data: findData({ hotel: { name: 'Fast Hotel' } }) }));
    expect(await screen.findByRole('heading', { name: /Fast Hotel/ })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Slow Hotel/ })).toBeNull();
  });
});

describe('pasting the page\'s text', () => {
  it('opens from the box, needs some text, and reads it with the address when it is a good one', async () => {
    hotelFinderService.findText.mockResolvedValue({ success: true, data: findData({ source: 'pasted' }) });
    show();
    await userEvent.click(screen.getByRole('button', { name: /paste the page's text instead/i }));
    await userEvent.click(screen.getByRole('button', { name: /find details in this text/i }));
    expect(screen.getByRole('alert')).toHaveTextContent("Paste the page's text first");
    expect(hotelFinderService.findText).not.toHaveBeenCalled();
    await userEvent.type(address(), 'palmgrove.com');
    await userEvent.click(screen.getByLabelText("The page's text"));
    await userEvent.paste('Palm Grove Resort\nA beachside resort.');
    await userEvent.click(screen.getByRole('button', { name: /find details in this text/i }));
    expect(hotelFinderService.findText).toHaveBeenCalledWith('Palm Grove Resort\nA beachside resort.', 'palmgrove.com');
    expect(await screen.findByRole('heading', { name: /Palm Grove Resort/ })).toBeInTheDocument();
  });

  it('a refused website offers pasting straight from the message', async () => {
    hotelFinderService.find.mockResolvedValue({ success: false, message: 'robots.txt says no', code: 'ROBOTS_DISALLOWED', canPaste: true });
    show();
    await find();
    await userEvent.click(await screen.findByRole('button', { name: /paste the page's text$/i }));
    expect(screen.getByLabelText("The page's text")).toBeInTheDocument();
  });
});

describe('saving and what to do with a find', () => {
  const found = async (data = findData()) => {
    hotelFinderService.find.mockResolvedValue({ success: true, data });
    show();
    await find();
    await screen.findByRole('heading', { name: /Palm Grove Resort/ });
  };

  it('keeps the first eight pictures ticked, lets the person change that, and counts them', async () => {
    await found();
    expect(screen.getByText(/8 of 10 will be kept/)).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText('Keep this picture: Picture 1'));
    expect(screen.getByText(/7 of 10 will be kept/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'None' }));
    expect(screen.getByText(/0 of 10 will be kept/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Select all' }));
    expect(screen.getByText(/10 of 10 will be kept/)).toBeInTheDocument();
  });

  it('copies the ticked pictures into the app, saves the find, and says so', async () => {
    hotelFinderService.create.mockImplementation(async (payload) => ({ success: true, data: { ...payload, _id: 'saved1', status: 'Saved' } }));
    await found();
    await userEvent.click(screen.getByRole('button', { name: 'None' }));
    await userEvent.click(screen.getByLabelText('Keep this picture: Picture 2'));
    await userEvent.click(screen.getByLabelText('Keep this picture: Picture 3'));
    await userEvent.click(screen.getByRole('button', { name: /save to the app/i }));
    await waitFor(() => expect(hotelFinderService.create).toHaveBeenCalledTimes(1));
    expect(fileFromUrl).toHaveBeenCalledTimes(2);
    expect(fileFromUrl.mock.calls.map((c) => c[0]).sort()).toEqual(['/finder-image/t2', '/finder-image/t3']);
    expect(uploadPhoto).toHaveBeenCalledWith(expect.any(File), 'hotel');
    const payload = hotelFinderService.create.mock.calls[0][0];
    expect(payload).toMatchObject({ name: 'Palm Grove Resort', source: 'website', sourceUrl: 'https://palmgrove.com/', phones: ['+91 832 227 5599'], emails: ['stay@palmgrove.com'] });
    expect(payload.photos).toHaveLength(2);
    expect(payload.photos[0]).toMatchObject({ width: 1000, height: 700, caption: 'Picture 2' });
    expect(payload.fieldLevels.name).toBe('high');
    expect(await screen.findByRole('button', { name: /^saved$/i })).toBeDisabled();
    expect(screen.getByText(/is saved in Found hotels/)).toBeInTheDocument();
    expect(h.showToast).toHaveBeenCalledWith('Saved in Found hotels.', 'success');
    await userEvent.click(screen.getByRole('button', { name: 'Open it' }));
    expect(h.navigate).toHaveBeenCalledWith('/hotels/found/saved1');
    await userEvent.click(screen.getByRole('button', { name: 'See Found hotels' }));
    expect(h.navigate).toHaveBeenCalledWith('/hotels?tab=found');
  });

  it('a picture that cannot be copied is left out and mentioned; the rest are saved', async () => {
    hotelFinderService.create.mockImplementation(async (payload) => ({ success: true, data: { ...payload, _id: 's2' } }));
    fileFromUrl.mockImplementation(async (url) => { if (url.endsWith('t2')) throw new Error('blocked'); return new File(['x'], 'p.jpg', { type: 'image/jpeg' }); });
    await found();
    await userEvent.click(screen.getByRole('button', { name: 'None' }));
    await userEvent.click(screen.getByLabelText('Keep this picture: Picture 1'));
    await userEvent.click(screen.getByLabelText('Keep this picture: Picture 2'));
    await userEvent.click(screen.getByRole('button', { name: /save to the app/i }));
    await waitFor(() => expect(hotelFinderService.create).toHaveBeenCalled());
    expect(hotelFinderService.create.mock.calls[0][0].photos).toHaveLength(1);
    expect(h.showToast).toHaveBeenCalledWith('Saved in Found hotels. 1 picture could not be copied.', 'warning');
  });

  it('a refusal from the server (the same hotel is saved already) is shown and nothing is marked saved', async () => {
    hotelFinderService.create.mockResolvedValue({ success: false, message: '"Palm Grove Resort" in Candolim is already saved in Found hotels. Open it from the list instead of saving it again.' });
    await found();
    await userEvent.click(screen.getByRole('button', { name: /save to the app/i }));
    await waitFor(() => expect(h.showToast).toHaveBeenCalledWith(expect.stringMatching(/already saved in Found hotels/), 'error'));
    expect(screen.getByRole('button', { name: /save to the app/i })).toBeEnabled();
    expect(screen.queryByText(/is saved in Found hotels/)).toBeNull();
  });

  it('"Save to hotel list" saves the find first, then puts the hotel straight into the hotel list', async () => {
    hotelFinderService.create.mockImplementation(async (payload) => ({ success: true, data: { ...payload, _id: 'saved9' } }));
    h.addFound.mockResolvedValueOnce({ ok: true, hotel: { _id: 'hot1' }, marked: true });
    await found();
    await userEvent.click(screen.getByRole('button', { name: /save to hotel list/i }));
    await waitFor(() => expect(h.navigate).toHaveBeenCalledWith('/hotels/hot1/edit'));
    expect(hotelFinderService.create).toHaveBeenCalledTimes(1);
    expect(h.addFound).toHaveBeenCalledWith(expect.objectContaining({ _id: 'saved9' }));
  });

  it('"Save to hotel list" opens the hotel form when the find lacks what the hotel list requires', async () => {
    hotelFinderService.create.mockImplementation(async (payload) => ({ success: true, data: { ...payload, _id: 'saved8' } }));
    h.addFound.mockResolvedValueOnce({ ok: false, needsForm: true });
    await found();
    await userEvent.click(screen.getByRole('button', { name: /save to hotel list/i }));
    await waitFor(() => expect(h.navigate).toHaveBeenCalledWith('/hotels/new?fromFound=saved8'));
  });

  it('Word, PDF and CSV are made from the find, and a failure is said in words', async () => {
    await found();
    await userEvent.click(screen.getByRole('button', { name: /^word$/i }));
    await waitFor(() => expect(exportFoundDocx).toHaveBeenCalledTimes(1));
    expect(exportFoundDocx.mock.calls[0][0]).toMatchObject({ name: 'Palm Grove Resort', phones: ['+91 832 227 5599'] });
    await userEvent.click(screen.getByRole('button', { name: /^pdf$/i }));
    await waitFor(() => expect(exportFoundPdf).toHaveBeenCalledTimes(1));
    await userEvent.click(screen.getByRole('button', { name: /^csv$/i }));
    await waitFor(() => expect(exportFoundCsv).toHaveBeenCalledTimes(1));
    exportFoundPdf.mockRejectedValueOnce(new Error('The file could not be made.'));
    await userEvent.click(screen.getByRole('button', { name: /^pdf$/i }));
    await waitFor(() => expect(h.showToast).toHaveBeenCalledWith('The file could not be made.', 'error'));
  });
});
