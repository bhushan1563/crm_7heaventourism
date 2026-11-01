import api from './api';

export const hotelService = {
  /** params: search, city, star, status (Active | Archived | all), sort (updated | name | city), page, limit */
  list: async (params = {}) => (await api.get('/hotels', { params })).data,
  cities: async () => (await api.get('/hotels/cities')).data,
  get: async (id) => (await api.get(`/hotels/${id}`)).data,
  create: async (payload) => (await api.post('/hotels', payload)).data,
  update: async (id, payload) => (await api.put(`/hotels/${id}`, payload)).data,
  remove: async (id) => (await api.delete(`/hotels/${id}`)).data
};

export default hotelService;
