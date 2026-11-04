import api from './api';

export const confirmationService = {
  /** params: search, status (all | Confirmed | Cancelled), page, limit */
  list: async (params = {}) => (await api.get('/confirmations', { params })).data,
  get: async (id) => (await api.get(`/confirmations/${id}`)).data,
  /** Confirms a quotation. `optionIndex` is needed when the quotation offers several hotel options. */
  confirm: async (quotationId, optionIndex, priceTableIndex) =>
    (await api.post('/confirmations', { quotationId, ...(optionIndex === undefined ? {} : { optionIndex }), ...(priceTableIndex === undefined ? {} : { priceTableIndex }) })).data,
  update: async (id, payload) => (await api.put(`/confirmations/${id}`, payload)).data,
  cancel: async (id, reason) => (await api.post(`/confirmations/${id}/cancel`, { reason })).data,
  delete: async (id) => (await api.delete(`/confirmations/${id}`)).data
};

export default confirmationService;
