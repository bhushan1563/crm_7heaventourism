import api from './api';

export const userService = {
  getUsers: async () => {
    const res = await api.get('/users');
    return res.data;
  },

  getUserById: async (id) => {
    const res = await api.get(`/users/${id}`);
    return res.data;
  },

  createUser: async (userData) => {
    const res = await api.post('/users', userData);
    return res.data;
  },

  updateUser: async (id, userData) => {
    const res = await api.put(`/users/${id}`, userData);
    return res.data;
  },

  toggleActive: async (id) => {
    const res = await api.patch(`/users/${id}/toggle-active`);
    return res.data;
  },

  deleteUser: async (id) => {
    const res = await api.delete(`/users/${id}`);
    return res.data;
  }
};

export default userService;
