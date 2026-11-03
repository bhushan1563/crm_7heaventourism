import api from './api';

export const masterTextService = {
  /** The saved standard notes and policies, or `data: null` when the built-in text is in use. */
  get: async () => (await api.get('/master-text')).data,
  /** `payload` holds all five lists; `updatedAt` (from the last read) stops one Admin overwriting another's changes. */
  save: async (payload) => (await api.put('/master-text', payload)).data,
  /** Back to the built-in text. */
  reset: async () => (await api.post('/master-text/reset')).data
};

export default masterTextService;
