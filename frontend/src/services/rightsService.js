import api from './api';

export const rightsService = {
  getRights: async (params = {}) => {
    const res = await api.get('/rights', { params });
    return res.data;
  },

  getRightsMatrix: async () => {
    const res = await api.get('/rights/matrix');
    return res.data;
  },

  // What the person really has (their own rights, else their role's, else the default): never just the rows someone happened to save.
  getUserRights: async (userId) => (await api.get('/rights/effective', { params: { userId } })).data,

  getRoleRights: async (userRole) => (await api.get('/rights/effective', { params: { userRole } })).data,

  updateRight: async (rightData) => {
    const res = await api.post('/rights', rightData);
    return res.data;
  },

  updateUserRights: async (userId, permissions) => {
    const res = await api.post('/rights/bulk', { userId, permissions });
    return res.data;
  },

  updateRoleRights: async (userRole, permissions) => {
    const res = await api.post('/rights/bulk', { userRole, permissions });
    return res.data;
  },

  bulkUpdateUserRights: async (userId, permissions) => {
    const res = await api.post('/rights/bulk', { userId, permissions });
    return res.data;
  }
};

export default rightsService;

