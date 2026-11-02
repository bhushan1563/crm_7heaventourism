import api from './api';

export const visaService = {
  /** params: search, status (Active | Archived | all), sort (country | updated), page, limit */
  list: async (params = {}) => (await api.get('/visas', { params })).data,
  get: async (id) => (await api.get(`/visas/${id}`)).data,
  create: async (payload) => (await api.post('/visas', payload)).data,
  update: async (id, payload) => (await api.put(`/visas/${id}`, payload)).data,
  remove: async (id) => (await api.delete(`/visas/${id}`)).data
};

export default visaService;
