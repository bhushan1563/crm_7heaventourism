import api from './api';

export const quotationService = {
  getQuotations: async (params = {}) => {
    const res = await api.get('/quotations', { params });
    return res.data;
  },

  getQuotationById: async (id) => {
    const res = await api.get(`/quotations/${id}`);
    return res.data;
  },

  createQuotation: async (data) => {
    const res = await api.post('/quotations', data);
    return res.data;
  },

  updateQuotation: async (id, data) => {
    const res = await api.put(`/quotations/${id}`, data);
    return res.data;
  },

  deleteQuotation: async (id) => {
    const res = await api.delete(`/quotations/${id}`);
    return res.data;
  },

  duplicateQuotation: async (id) => {
    const res = await api.post(`/quotations/${id}/duplicate`);
    return res.data;
  },

  convertFromInquiry: async (guestId) => {
    const res = await api.post('/quotations/convert-inquiry', { guestId });
    return res.data;
  },

  getStats: async () => {
    const res = await api.get('/quotations/stats');
    return res.data;
  }
};

export default quotationService;
