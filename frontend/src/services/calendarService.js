import api from './api';

export const calendarService = {
  /** The trips between two dates ("YYYY-MM-DD"), from the guests, quotations, bookings and manual entries the person may read. */
  get: async (from, to) => (await api.get('/calendar', { params: { from, to } })).data,

  /** Save a manually-entered calendar event. `body` = { title, kind, start, end, destination, amount, notes }. */
  createManual: async (body) => (await api.post('/calendar/manual', body)).data,

  /** Delete a manually-entered calendar event by its DB id. */
  deleteManual: async (id) => (await api.delete(`/calendar/manual/${id}`)).data
};

export default calendarService;
