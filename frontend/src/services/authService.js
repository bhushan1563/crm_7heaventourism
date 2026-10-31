import api from './api';

// "My profile": the signed-in user's own details, password and photo.
export const authService = {
  updateProfile: async ({ firstName, lastName, phone }) => (await api.put('/auth/profile', { firstName, lastName, phone })).data,

  changePassword: async ({ currentPassword, newPassword }) => (await api.put('/auth/password', { currentPassword, newPassword })).data,

  setAvatar: async (image) => (await api.put('/auth/avatar', { image })).data,

  removeAvatar: async () => (await api.delete('/auth/avatar')).data
};

export default authService;
