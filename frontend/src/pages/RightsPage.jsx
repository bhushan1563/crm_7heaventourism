import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Lock,
  Save,
  CheckCircle2,
  AlertTriangle,
  Info,
  Download,
  Edit3,
  Eye,
  PlusCircle,
  Trash2,
  UserCheck
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import rightsService from '../services/rightsService';
import userService from '../services/userService';
import { USER_ROLES, RIGHTS_MODULES } from '../config';

const emptyPermissions = () => {
  const permissions = {};
  RIGHTS_MODULES.forEach((mod) => {
    permissions[mod.value] = {
      canCreate: false,
      canRead: false,
      canUpdate: false,
      canDelete: false,
      canDownload: false,
      canEditOthers: false
    };
  });
  return permissions;
};

const withModuleDefaults = (loaded = {}) => {
  const permissions = emptyPermissions();
  RIGHTS_MODULES.forEach((mod) => {
    if (loaded[mod.value]) permissions[mod.value] = { ...permissions[mod.value], ...loaded[mod.value] };
  });
  return permissions;
};

export const RightsPage = () => {
  const { user: currentUser } = useAuth();
  const { showToast } = useToast();

  const [users, setUsers] = useState([]);
  const [scope, setScope] = useState('user');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedUser, setSelectedUser] = useState(null);
  const [selectedRole, setSelectedRole] = useState('Sales');
  const [permissions, setPermissions] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const res = await userService.getUsers();
      if (res.success) {
        setUsers(res.data);
        if (res.data.length > 0) {
          const defaultUser = res.data.find(u => u.role !== 'Admin') || res.data[0];
          setSelectedUserId(defaultUser._id);
          setSelectedUser(defaultUser);
          loadUserPermissions(defaultUser._id);
        }
      }
      else {
        showToast(res.message, 'error');
      }
    } catch (err) {
      showToast('Failed to load user staff list: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadUserPermissions = async (userId) => {
    try {
      const res = await rightsService.getUserRights(userId);
      if (res.success) {
        setPermissions(withModuleDefaults(res.data));
      }
      else {
        showToast(res.message, 'error');
      }
    } catch (err) {
      showToast('Error loading user permissions: ' + err.message, 'error');
    }
  };

  const loadRolePermissions = async (role) => {
    try {
      const res = await rightsService.getRoleRights(role);
      if (res.success) {
        setPermissions(withModuleDefaults(res.data));
      }
      else {
        showToast(res.message, 'error');
      }
    } catch (err) {
      showToast('Error loading role permissions: ' + err.message, 'error');
    }
  };

  const handleScopeChange = (nextScope) => {
    setScope(nextScope);
    if (nextScope === 'role') {
      loadRolePermissions(selectedRole);
      return;
    }
    if (selectedUserId) loadUserPermissions(selectedUserId);
  };

  const handleUserChange = (userId) => {
    setSelectedUserId(userId);
    const u = users.find((item) => item._id === userId);
    setSelectedUser(u);
    loadUserPermissions(userId);
  };

  const handleRoleChange = (role) => {
    setSelectedRole(role);
    loadRolePermissions(role);
  };

  const isAdminLocked = scope === 'user' ? (selectedUser?.role === 'Admin' || selectedUser?.role === 'SuperAdmin') : (selectedRole === 'Admin' || selectedRole === 'SuperAdmin');

  const handleTogglePermission = (moduleName, action) => {
    if (isAdminLocked) {
      showToast('Administrators automatically have unrestricted master permissions.', 'info');
      return;
    }

    setPermissions((prev) => {
      const currentModulePerms = prev[moduleName] || {
        canCreate: false,
        canRead: true,
        canUpdate: false,
        canDelete: false,
        canDownload: false,
        canEditOthers: false
      };

      return {
        ...prev,
        [moduleName]: {
          ...currentModulePerms,
          [action]: !currentModulePerms[action]
        }
      };
    });
  };

  const handleSaveRights = async () => {
    if (scope === 'role' && !selectedRole) return;
    if (scope === 'user' && !selectedUserId) return;
    try {
      setSaving(true);
      const res = scope === 'role'
        ? await rightsService.updateRoleRights(selectedRole, permissions)
        : await rightsService.updateUserRights(selectedUserId, permissions);
      if (res.success) {
        if (scope === 'role') {
          showToast(res.message || `Role rights saved for ${selectedRole}.`, 'success');
        } else {
          showToast(`Access rights successfully saved for ${selectedUser.firstName} ${selectedUser.lastName}!`, 'success');
        }
      } else {
        showToast(res.message || 'Failed to save security rights.', 'error');
      }
    } catch (err) {
      showToast('Failed to save security rights: ' + (err.response?.data?.message || err.message), 'error');
    } finally {
      setSaving(false);
    }
  };

  if (currentUser?.role !== 'Admin' && currentUser?.role !== 'SuperAdmin') {
    return (
      <div className="glass-panel" style={{ padding: '60px 30px', textAlign: 'center', margin: '40px auto', maxWidth: '520px' }}>
        <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: '#FEE2E2', color: '#DC2626', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px auto' }}>
          <Lock size={32} />
        </div>
        <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0F172A', marginBottom: '8px', fontFamily: 'var(--font-headline)' }}>
          Administrator Access Only
        </h2>
        <p style={{ color: '#64748B', fontSize: '0.875rem', marginBottom: '24px', lineHeight: 1.6 }}>
          The Rights & Security policy matrix is restricted to Administrator accounts. Your current role is <strong>{currentUser?.role}</strong>.
        </p>
        <button onClick={() => window.location.href = '/dashboard'} className="btn btn-primary">
          Return to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header & Controls */}
      <div
        className="glass-panel"
        style={{
          padding: '20px 24px',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px'
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0F172A', fontFamily: 'var(--font-headline)' }}>
              Rights & Security Matrix
            </h2>
            <span
              style={{
                fontSize: '0.75rem',
                fontWeight: 700,
                padding: '3px 8px',
                borderRadius: '9999px',
                background: '#DCFCE7',
                color: '#15803D',
                border: '1px solid #BBF7D0'
              }}
            >
              Enterprise RBAC Active
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={handleSaveRights}
            className="btn btn-primary"
            disabled={saving || isAdminLocked}
          >
            <Save size={16} />
            <span>{saving ? 'Saving...' : 'Save Permissions'}</span>
          </button>
        </div>
      </div>

      {/* User Selector & Role Presets */}
      <div
        className="glass-panel"
        style={{
          padding: '18px 24px',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap', flex: 1 }}>
          <div>
            <label className="form-label" style={{ marginBottom: '6px' }}>
              Apply rights to
            </label>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                type="button"
                onClick={() => handleScopeChange('user')}
                className={scope === 'user' ? 'btn btn-primary btn-sm' : 'btn btn-outline btn-sm'}
              >
                One user
              </button>
              <button
                type="button"
                onClick={() => handleScopeChange('role')}
                className={scope === 'role' ? 'btn btn-primary btn-sm' : 'btn btn-outline btn-sm'}
              >
                Whole role
              </button>
            </div>
          </div>

          {scope === 'user' ? (
            <>
              <div>
                <label className="form-label" style={{ marginBottom: '4px' }}>
                  User Reference (Select Member)
                </label>
                <select
                  className="form-select"
                  style={{ minWidth: '280px' }}
                  value={selectedUserId}
                  onChange={(e) => handleUserChange(e.target.value)}
                >
                  {users.map((u) => (
                    <option key={u._id} value={u._id}>
                      {u.firstName} {u.lastName} ({u.email}) - {u.role}
                    </option>
                  ))}
                </select>
              </div>

              {selectedUser && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 14px',
                    borderRadius: '10px',
                    background: '#F8FAFC',
                    border: '1px solid #E2E8F0',
                    marginTop: '16px'
                  }}
                >
                  <div
                    style={{
                      width: '10px',
                      height: '10px',
                      borderRadius: '50%',
                      background: selectedUser.active ? '#10B981' : '#EF4444'
                    }}
                  />
                  <span style={{ fontSize: '0.8rem', color: '#475569' }}>
                    Department: <strong style={{ color: '#2563EB' }}>{selectedUser.role}</strong>
                  </span>
                </div>
              )}
            </>
          ) : (
            <div>
              <label className="form-label" style={{ marginBottom: '4px' }}>
                Role
              </label>
              <select
                className="form-select"
                style={{ minWidth: '220px' }}
                value={selectedRole}
                onChange={(e) => handleRoleChange(e.target.value)}
              >
                {USER_ROLES.map((role) => (
                  <option key={role.value} value={role.value}>{role.label}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Security Info Callout */}
      <div
        className="glass-panel"
        style={{
          padding: '14px 20px',
          background: '#EFF6FF',
          border: '1px solid #BFDBFE',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}
      >
        <Info size={20} color="#2563EB" style={{ flexShrink: 0 }} />
        <div style={{ fontSize: '0.8rem', color: '#1E40AF', lineHeight: 1.4 }}>
          <strong>Configured Policies:</strong> "All data can be seen by any user" (Read enabled by default). Saving <strong>One user</strong> changes only that member. Saving <strong>Whole role</strong> updates the role and every member in Sales, Ops, or Viewer. Admin stays unrestricted.
        </div>
      </div>

      {/* Rights Matrix Table */}
      <div className="table-container">
        <table className="luxury-table">
          <thead>
            <tr>
              <th style={{ width: '260px' }}>Module</th>
              <th style={{ textAlign: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                  <PlusCircle size={13} color="#10B981" />
                  <span>Create</span>
                </div>
              </th>
              <th style={{ textAlign: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                  <Eye size={13} color="#2563EB" />
                  <span>Read (View All)</span>
                </div>
              </th>
              <th style={{ textAlign: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                  <Edit3 size={13} color="#F59E0B" />
                  <span>Update (Edit Own)</span>
                </div>
              </th>
              <th style={{ textAlign: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                  <Trash2 size={13} color="#EF4444" />
                  <span>Delete</span>
                </div>
              </th>
              <th style={{ textAlign: 'center', background: '#EFF6FF' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', color: '#2563EB' }}>
                  <Download size={13} />
                  <span>Data Download / Export</span>
                </div>
              </th>
              <th style={{ textAlign: 'center', background: '#FEF2F2' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', color: '#DC2626' }}>
                  <Lock size={13} />
                  <span>Edit Others' Data</span>
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {RIGHTS_MODULES.map((mod) => {
              const p = permissions[mod.value] || {};
              const isAdmin = isAdminLocked;

              return (
                <tr key={mod.value}>
                  <td>
                    <div style={{ fontWeight: 700, color: '#0F172A', fontSize: '0.9rem' }}>
                      {mod.label}
                    </div>
                  </td>

                  {/* Create */}
                  <td style={{ textAlign: 'center' }}>
                    <label className="switch">
                      <input
                        type="checkbox"
                        checked={Boolean(p.canCreate)}
                        onChange={() => handleTogglePermission(mod.value, 'canCreate')}
                        disabled={isAdmin}
                      />
                      <span className="slider"></span>
                    </label>
                  </td>

                  {/* Read (View All Data) */}
                  <td style={{ textAlign: 'center' }}>
                    <label className="switch">
                      <input
                        type="checkbox"
                        checked={Boolean(p.canRead)}
                        onChange={() => handleTogglePermission(mod.value, 'canRead')}
                        disabled={isAdmin}
                      />
                      <span className="slider"></span>
                    </label>
                  </td>

                  {/* Update */}
                  <td style={{ textAlign: 'center' }}>
                    <label className="switch">
                      <input
                        type="checkbox"
                        checked={Boolean(p.canUpdate)}
                        onChange={() => handleTogglePermission(mod.value, 'canUpdate')}
                        disabled={isAdmin}
                      />
                      <span className="slider"></span>
                    </label>
                  </td>

                  {/* Delete */}
                  <td style={{ textAlign: 'center' }}>
                    <label className="switch">
                      <input
                        type="checkbox"
                        checked={Boolean(p.canDelete)}
                        onChange={() => handleTogglePermission(mod.value, 'canDelete')}
                        disabled={isAdmin}
                      />
                      <span className="slider"></span>
                    </label>
                  </td>

                  {/* Special: Data Download Restriction */}
                  <td style={{ textAlign: 'center', background: '#F8FAFC' }}>
                    <label className="switch">
                      <input
                        type="checkbox"
                        checked={Boolean(p.canDownload)}
                        onChange={() => handleTogglePermission(mod.value, 'canDownload')}
                        disabled={isAdmin}
                      />
                      <span className="slider"></span>
                    </label>
                  </td>

                  {/* Special: Edit Others' Data Restriction */}
                  <td style={{ textAlign: 'center', background: '#FEF2F2' }}>
                    <label className="switch">
                      <input
                        type="checkbox"
                        checked={Boolean(p.canEditOthers)}
                        onChange={() => handleTogglePermission(mod.value, 'canEditOthers')}
                        disabled={isAdmin}
                      />
                      <span className="slider"></span>
                    </label>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default RightsPage;
