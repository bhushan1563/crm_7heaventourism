import React from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const h = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../services/calendarService', () => ({ default: { get: (...a) => h.get(...a) } }));
vi.mock('../services/api', () => ({ getErrorMessage: (e, f) => e?.message || f, default: {} }));
import TravelCalendarPage from './TravelCalendarPage';

const event = (over) => ({ id: 'confirmation:c1', kind: 'confirmation', recordId: 'c1', title: 'Pujan', ref: '7H-CF-1', destination: 'Vietnam', status: 'Confirmed', start: '2026-11-10', end: '2026-11-13', nights: 3, pax: '6 Adults', sales: 'Bhushan', ops: 'Jigisha', link: '/confirmations/c1', ...over });
const EVENTS = [
  event(),
  event({ id: 'payment:c1', kind: 'payment', title: 'Pujan', start: '2026-11-03', end: '2026-11-03', nights: 0, amount: 'Rs 5,000', status: 'Payment due', travelStart: '2026-11-10' }),
  event({ id: 'quotation:q1', kind: 'quotation', title: 'Nihar', ref: '7H-QT-1', destination: 'Andaman', status: 'Draft', start: '2026-11-20', end: '2026-11-22', link: '/quotations/q1/edit' }),
  event({ id: 'guest:g1', kind: 'guest', title: 'Aarav', ref: 'G-1', destination: 'Goa', status: 'Under Process', start: '2026-11-25', end: '2026-11-25', nights: 0 })
];

const Where = () => <span data-testid="where">{useLocation().pathname + useLocation().search}</span>;
const show = (url = '/calendar?view=month&date=2026-11-04') =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/calendar" element={<><TravelCalendarPage /><Where /></>} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>
  );

const memory = () => {
  const data = new Map();
  return { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)), removeItem: (k) => data.delete(k), clear: () => data.clear() };
};

beforeEach(() => {
  Object.defineProperty(window, 'localStorage', { value: memory(), configurable: true });
  h.get.mockReset();
  h.get.mockResolvedValue({ success: true, data: EVENTS, sources: { guests: true, quotations: true, confirmations: true } });
});
afterEach(cleanup);

describe('the travel calendar', () => {
  it('shows the month of the date, asks for exactly the days of its grid, and names each trip by its guest', async () => {
    show();
    expect(await screen.findByRole('heading', { name: 'November 2026' })).toBeInTheDocument();
    await waitFor(() => expect(h.get).toHaveBeenCalledWith('2026-10-26', '2026-12-06'));
    const month = await screen.findByLabelText('Calendar of November 2026');
    expect(within(month).getByRole('button', { name: /^Pujan · Vietnam/ })).toBeInTheDocument();
    expect(within(month).getByRole('button', { name: /^Nihar · Andaman/ })).toBeInTheDocument();
    expect(within(month).getByRole('button', { name: /^Aarav · Goa/ })).toBeInTheDocument();
  });

  it('shows travel in green and a payment deadline in yellow, with what is owed', async () => {
    show();
    const month = await screen.findByLabelText('Calendar of November 2026');
    const travel = within(month).getByRole('button', { name: /^Pujan · Vietnam/ });
    const pay = within(month).getByRole('button', { name: /Pujan · pay Rs 5,000/ });
    expect(travel.style.getPropertyValue('--cal')).toBe('#12B76A');
    expect(pay.style.getPropertyValue('--cal')).toBe('#FACC15');
    expect(pay.style.getPropertyValue('--cal-ink')).toBe('#422006'); // dark writing on yellow
    expect(screen.getByText('Payment deadlines')).toBeInTheDocument();
    expect(screen.getByText('Travel (bookings)')).toBeInTheDocument();
  });

  it('hides a kind when it is switched off, and the choice is remembered', async () => {
    show();
    const month = await screen.findByLabelText('Calendar of November 2026');
    await userEvent.click(screen.getByRole('checkbox', { name: /Payment deadlines/ }));
    expect(within(month).queryByRole('button', { name: /pay Rs 5,000/ })).toBeNull();
    expect(within(month).getByRole('button', { name: /^Pujan · Vietnam/ })).toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem('crm.calendar')).kinds).not.toContain('payment');
    cleanup();
    show();
    await screen.findByLabelText('Calendar of November 2026');
    expect(screen.getByRole('checkbox', { name: /Payment deadlines/ })).not.toBeChecked();
  });

  it('searches by guest, place or reference', async () => {
    show();
    const month = await screen.findByLabelText('Calendar of November 2026');
    await userEvent.type(screen.getByLabelText('Search the calendar'), 'andaman');
    expect(within(month).queryByRole('button', { name: /^Pujan/ })).toBeNull();
    expect(within(month).getByRole('button', { name: /^Nihar/ })).toBeInTheDocument();
    expect(screen.getByText('1 trip shown')).toBeInTheDocument();
  });

  it('moves with Next and Today, and asks for the new month', async () => {
    show();
    await screen.findByLabelText('Calendar of November 2026');
    await userEvent.click(screen.getByRole('button', { name: 'Next month' }));
    expect(await screen.findByRole('heading', { name: 'December 2026' })).toBeInTheDocument();
    await waitFor(() => expect(h.get).toHaveBeenLastCalledWith('2026-11-30', '2027-01-03'));
    expect(screen.getByTestId('where')).toHaveTextContent('date=2026-12-04');
  });

  it('switches to the week, day and agenda views', async () => {
    show();
    await screen.findByLabelText('Calendar of November 2026');
    await userEvent.click(screen.getByRole('tab', { name: 'Week' }));
    expect(await screen.findByRole('heading', { name: '2 – 8 Nov 2026' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /Tuesday, 3 November 2026/ })).toHaveTextContent('Pujan · pay Rs 5,000');
    await userEvent.click(screen.getByRole('tab', { name: 'Agenda' }));
    const agenda = await screen.findByRole('region', { name: /Tuesday, 10 November 2026/ });
    expect(within(agenda).getByText('Pujan')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /Wednesday, 11 November 2026/ })).toHaveTextContent('day 2');
    await userEvent.click(screen.getByRole('tab', { name: 'Day' }));
    expect(await screen.findByRole('heading', { name: /Wednesday, 4 November 2026/ })).toBeInTheDocument();
    expect(screen.getByText(/Nothing travels on/)).toBeInTheDocument();
  });

  it('opens a trip: its details, the way to its record, Google Calendar and an .ics file', async () => {
    show();
    const month = await screen.findByLabelText('Calendar of November 2026');
    await userEvent.click(within(month).getByRole('button', { name: /^Pujan · Vietnam/ }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('7H-CF-1');
    expect(within(dialog).getByText('Jigisha')).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: /Add to Google Calendar/ }).getAttribute('href')).toContain('dates=20261110%2F20261114');
    expect(within(dialog).getByRole('button', { name: /Download .ics/ })).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: /Open booking/ }));
    expect(screen.getByTestId('where')).toHaveTextContent('/confirmations/c1');
  });

  it('keyboard shortcuts change the view and move the date', async () => {
    show();
    await screen.findByLabelText('Calendar of November 2026');
    await userEvent.keyboard('w');
    expect(await screen.findByRole('heading', { name: '2 – 8 Nov 2026' })).toBeInTheDocument();
    await userEvent.keyboard('{ArrowRight}');
    expect(await screen.findByRole('heading', { name: '9 – 15 Nov 2026' })).toBeInTheDocument();
    await userEvent.keyboard('m');
    expect(await screen.findByLabelText('Calendar of November 2026')).toBeInTheDocument();
  });

  it('says in words when the calendar cannot load, and when a source is not allowed', async () => {
    h.get.mockResolvedValueOnce({ success: false, message: 'The calendar is resting.' });
    show();
    expect(await screen.findByRole('alert')).toHaveTextContent('The calendar is resting.');
    h.get.mockResolvedValue({ success: true, data: [EVENTS[2]], sources: { guests: false, quotations: true, confirmations: false } });
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(await screen.findByText(/Inquiries, Bookings are not shown: you do not have access/)).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Inquiries/ })).toBeDisabled();
  });
});
