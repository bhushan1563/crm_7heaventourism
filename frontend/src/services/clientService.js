import api from './api';

export const clientService = {
  /** Everyone who has an inquiry or a booking, one entry per person. Answers { success, data, sources }. */
  getCurrent: async () => (await api.get('/clients/current')).data,

  /** The future clients kept by hand. Answers { success, data }. */
  getFuture: async () => (await api.get('/clients/future')).data,

  createFuture: async (body) => (await api.post('/clients/future', body)).data,

  updateFuture: async (id, body) => (await api.put(`/clients/future/${id}`, body)).data,

  deleteFuture: async (id) => (await api.delete(`/clients/future/${id}`)).data
};

export default clientService;
