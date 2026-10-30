import api from './api';

export const supplierService = {
  getSuppliers: async (params = {}) => {
    const res = await api.get('/suppliers', { params });
    return res.data;
  },

  getSupplierById: async (id) => {
    const res = await api.get(`/suppliers/${id}`);
    return res.data;
  },

  createSupplier: async (supplierData) => {
    const res = await api.post('/suppliers', supplierData);
    return res.data;
  },

  updateSupplier: async (id, supplierData) => {
    const res = await api.put(`/suppliers/${id}`, supplierData);
    return res.data;
  },

  deleteSupplier: async (id) => {
    const res = await api.delete(`/suppliers/${id}`);
    return res.data;
  },

  getStats: async () => {
    const res = await api.get('/suppliers/stats');
    return res.data;
  }
};

export default supplierService;
