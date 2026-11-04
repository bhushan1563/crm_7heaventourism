import api from './api';

export const calendarService = {
  /** The trips between two dates ("YYYY-MM-DD"), from the guests, quotations and bookings the person may read. Answers { success, data, sources }. */
  get: async (from, to) => (await api.get('/calendar', { params: { from, to } })).data
};

export default calendarService;
