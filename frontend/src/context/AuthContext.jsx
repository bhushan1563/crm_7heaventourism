import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../services/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem('7heaven_user');
      if (!saved || saved === 'undefined' || saved === 'null') return null;
      return JSON.parse(saved);
    } catch (e) {
      console.warn('Failed to parse 7heaven_user from localStorage:', e);
      localStorage.removeItem('7heaven_user');
      return null;
    }
  });
  const [rights, setRights] = useState(() => {
    try {
      const saved = localStorage.getItem('7heaven_rights');
      if (!saved || saved === 'undefined' || saved === 'null') return {};
      return JSON.parse(saved);
    } catch (e) {
      console.warn('Failed to parse 7heaven_rights from localStorage:', e);
      localStorage.removeItem('7heaven_rights');
      return {};
    }
  });
  const [token, setToken] = useState(() => localStorage.getItem('7heaven_token'));
  const [loading, setLoading] = useState(true);

  // Re-fetch current user session and live rights
  const refreshUser = useCallback(async () => {
    const storedToken = localStorage.getItem('7heaven_token');
    if (!storedToken) {
      setLoading(false);
      return;
    }

    try {
      const res = await api.get('/auth/me');
      if (res.data.success) {
        setUser(res.data.user);
        setRights(res.data.rights || {});
        localStorage.setItem('7heaven_user', JSON.stringify(res.data.user));
        localStorage.setItem('7heaven_rights', JSON.stringify(res.data.rights || {}));
      }
      else {
        console.warn('Session check failed:', res.data.message);
        logout();
      }
    } catch (err) {
      console.warn('Session check failed:', err.message);
      logout();
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const login = async (email, password) => {
    try {
      const res = await api.post('/auth/login', { email, password });
      if (!res.data.success) {
        console.warn('Login failed:', res.data.message);
        return { success: false, message: res.data.message || 'Login failed' };
      }

      const { token, user } = res.data;
      let sessionUser = user?._doc || user;
      localStorage.setItem('7heaven_token', token);
      localStorage.setItem('7heaven_user', JSON.stringify(sessionUser));
      setToken(token);
      setUser(sessionUser);

      // Login already succeeded. Still return success if rights cannot be loaded.
      try {
        const meRes = await api.get('/auth/me');
        if (meRes.data.success) {
          setRights(meRes.data.rights || {});
          localStorage.setItem('7heaven_rights', JSON.stringify(meRes.data.rights || {}));
          if (meRes.data.user) {
            sessionUser = meRes.data.user?._doc || meRes.data.user;
            setUser(sessionUser);
            localStorage.setItem('7heaven_user', JSON.stringify(sessionUser));
          }
        }
      } catch (meErr) {
        console.warn('Failed to load rights after login:', meErr.message);
      }

      return { success: true, user: sessionUser };
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Login failed';
      return { success: false, message: msg };
    }
  };

  const logout = () => {
    localStorage.removeItem('7heaven_token');
    localStorage.removeItem('7heaven_user');
    localStorage.removeItem('7heaven_rights');
    setToken(null);
    setUser(null);
    setRights({});
  };

  // Used by "My Profile": keep the session in step with the latest copy of the user (name, phone, photo).
  const updateUser = useCallback((nextUser) => {
    const sessionUser = nextUser?._doc || nextUser;
    setUser(sessionUser);
    try {
      localStorage.setItem('7heaven_user', JSON.stringify(sessionUser));
    } catch (e) {
      console.warn('Could not cache the profile locally:', e.message);
    }
  }, []);

  // After a password change the server issues a fresh token for this device (every other device is signed out).
  const replaceToken = useCallback((nextToken) => {
    localStorage.setItem('7heaven_token', nextToken);
    setToken(nextToken);
  }, []);

  /**
   * Check if current user has permission for an action in a module
   * @param {string} moduleName - 'guest_list' | 'supplier_list' | 'users' | 'rights' | 'scanner' | 'reports'
   * @param {string} action - 'canCreate' | 'canRead' | 'canUpdate' | 'canDelete' | 'canDownload' | 'canEditOthers'
   */
  const can = useCallback((moduleName, action) => {
    if (!user) return false;
    if (user.role === 'Admin' || user.role === 'SuperAdmin') return true; // Master Admin has full rights
    if (!rights || !rights[moduleName]) {
      // Default to canRead: true ("All data can be seen by any user")
      return action === 'canRead';
    }
    return Boolean(rights[moduleName][action]);
  }, [user, rights]);

  /**
   * Check if user can modify/delete a specific record
   * Respects: "Restrictions should there in access to change of data updated by other member"
   */
  const canEditRecord = useCallback((moduleName, record) => {
    if (!user) return false;
    if (user.role === 'Admin' || user.role === 'SuperAdmin') return true;

    // Check base update right first
    if (!can(moduleName, 'canUpdate')) return false;

    if (!record) return true;

    const userFullName = `${user.firstName} ${user.lastName}`.trim().toLowerCase();
    const isCreator = record.createdBy === user._id || record.createdBy === user.email || (record.createdByName && record.createdByName.toLowerCase() === userFullName);
    const isSales = record.salesId === user._id || (record.sales && record.sales.toLowerCase() === userFullName);
    const isOps = record.opsId === user._id || (record.ops && record.ops.toLowerCase() === userFullName);
    const isAssignedStaff = isCreator || isSales || isOps;

    // The confirmed-lock only applies to quotation records; for a Confirmation document,
    // 'Confirmed' is the normal active status (all active confirmations default to it), not a lock.
    const isConfirmedBooking = moduleName !== 'confirmations' &&
      (record.status === 'Confirmed' || record.status === 'Confirmed & Payment received' || record.isLocked === true);

    // If booking is Confirmed / Locked, restrict exclusively to assigned staff and Admin
    if (isConfirmedBooking) {
      return isAssignedStaff;
    }

    // If user has 'canEditOthers', they can edit other general records
    if (can(moduleName, 'canEditOthers')) return true;

    return isAssignedStaff;
  }, [user, can]);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        rights,
        loading,
        login,
        logout,
        refreshUser,
        updateUser,
        replaceToken,
        can,
        canEditRecord,
        isAuthenticated: Boolean(token && user)
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
