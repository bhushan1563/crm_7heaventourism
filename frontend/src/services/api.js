import axios from 'axios';

// Empty / unset = same origin (the API and the web app are served together). Set REACT_APP_APIURL at build time to
// point at an API hosted elsewhere.
export const API_ORIGIN = String(process.env?.REACT_APP_APIURL ?? '').replace(/\/+$/, '');
const API_BASE_URL = `${API_ORIGIN}/api`;

export const SESSION_KEYS = ['7heaven_token', '7heaven_user', '7heaven_rights'];

const api = axios.create({
  baseURL: API_BASE_URL,
  // Fails instead of spinning forever on a bad connection. Business-card OCR is the slowest call, so keep this generous.
  timeout: 60000,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Attach Authorization Bearer token to all outgoing requests
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('7heaven_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// The API answers 401 when the session is missing, expired, or the account was deactivated / removed.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      SESSION_KEYS.forEach((key) => localStorage.removeItem(key));
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

/** Best human-readable message for a failed request (server message, then a plain-language fallback). */
export const getErrorMessage = (error, fallback = 'Something went wrong. Please try again.') => {
  if (error?.response?.data?.message) return error.response.data.message;
  if (error?.code === 'ECONNABORTED') return 'The request timed out. Please check your connection and try again.';
  if (error?.request && !error?.response) return 'Cannot reach the server. Please check your connection.';
  return fallback;
};

export default api;
