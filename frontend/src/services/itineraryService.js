import api from './api';

export const itineraryService = {
  /** params: search, destination, status (Active | Archived | all), sort (updated | title | destination), page, limit */
  list: async (params = {}) => (await api.get('/itineraries', { params })).data,
  destinations: async () => (await api.get('/itineraries/destinations')).data,
  get: async (id) => (await api.get(`/itineraries/${id}`)).data,
  create: async (payload) => (await api.post('/itineraries', payload)).data,
  update: async (id, payload) => (await api.put(`/itineraries/${id}`, payload)).data,
  duplicate: async (id) => (await api.post(`/itineraries/${id}/duplicate`)).data,
  remove: async (id) => (await api.delete(`/itineraries/${id}`)).data
};

export default itineraryService;
