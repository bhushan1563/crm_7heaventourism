import api from './api';

const mapRightsResponse = (payload) => {
  if (payload?.success && Array.isArray(payload?.data)) {
    const permissions = {};
    payload.data.forEach((r) => {
      if (r.module) {
        permissions[r.module] = {
          canCreate: !!r.canCreate,
          canRead: r.canRead !== undefined ? !!r.canRead : true,
          canUpdate: !!r.canUpdate,
          canDelete: !!r.canDelete,
          canDownload: !!r.canDownload,
          canEditOthers: !!r.canEditOthers
        };
      }
    });
    return { success: true, data: permissions };
  }
  return payload;
};

export const rightsService = {
  getRights: async (params = {}) => {
    const res = await api.get('/rights', { params });
    return res.data;
  },

  getRightsMatrix: async () => {
    const res = await api.get('/rights/matrix');
    return res.data;
  },

  getUserRights: async (userId) => {
    const res = await api.get('/rights', { params: { userId } });
    return mapRightsResponse(res.data);
  },

  getRoleRights: async (userRole) => {
    const res = await api.get('/rights', { params: { userRole } });
    return mapRightsResponse(res.data);
  },

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

