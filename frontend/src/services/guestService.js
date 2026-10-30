import api from './api';

export const guestService = {
  getGuests: async (params = {}) => {
    const res = await api.get('/guests', { params });
    return res.data;
  },

  getGuestById: async (id) => {
    const res = await api.get(`/guests/${id}`);
    return res.data;
  },

  createGuest: async (guestData) => {
    const res = await api.post('/guests', guestData);
    return res.data;
  },

  updateGuest: async (id, guestData) => {
    const res = await api.put(`/guests/${id}`, guestData);
    return res.data;
  },

  updateStatus: async (id, status) => {
    const res = await api.patch(`/guests/${id}/status`, { status });
    return res.data;
  },

  deleteGuest: async (id) => {
    const res = await api.delete(`/guests/${id}`);
    return res.data;
  },

  addFollowUp: async (id, payload) => {
    const res = await api.post(`/guests/${id}/follow-up`, payload);
    return res.data;
  },

  getStats: async () => {
    const res = await api.get('/guests/stats');
    return res.data;
  }
};

export default guestService;
