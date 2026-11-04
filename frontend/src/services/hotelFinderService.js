import api from './api';

// The hotel finder and the saved finds ("Found hotels"). Every call answers { success, ... }; a failure carries `message` (in words),
// and a failed find also `code` and `canPaste` (whether reading pasted text could help).
export const hotelFinderService = {
  /** Reads a hotel's website. The read can take up to about half a minute, so this call waits longer than the others. */
  find: async (url, { fresh = false } = {}) => (await api.post('/hotel-finder/find', { url, fresh }, { timeout: 60000 })).data,
  findText: async (text, url = '') => (await api.post('/hotel-finder/find-text', { text, url }, { timeout: 30000 })).data,
  /** params: search, status (Saved | Added), sort (updated | name | found), page, limit */
  list: async (params = {}) => (await api.get('/hotel-finder/saved', { params })).data,
  get: async (id) => (await api.get(`/hotel-finder/saved/${id}`)).data,
  create: async (payload) => (await api.post('/hotel-finder/saved', payload)).data,
  update: async (id, payload) => (await api.put(`/hotel-finder/saved/${id}`, payload)).data,
  remove: async (id) => (await api.delete(`/hotel-finder/saved/${id}`)).data,
  markAdded: async (id, hotelId) => (await api.post(`/hotel-finder/saved/${id}/added`, { hotelId })).data
};

export default hotelFinderService;
