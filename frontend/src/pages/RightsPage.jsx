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
  UserCheck,
  Phone
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import rightsService from '../services/rightsService';
import userService from '../services/userService';
import { USER_ROLES, RIGHTS_MODULES } from '../config';
import { getErrorMessage } from '../services/api';
import { whatsappNumber } from '../utils/shareContact';

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
  const [senderInput, setSenderInput] = useState(''); // the sender number of the selected person, as typed
  const [senderError, setSenderError] = useState('');
  const [savingSender, setSavingSender] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, []);

  // The box shows the saved sender number of whoever is selected.
  useEffect(() => {
    setSenderInput(selectedUser?.senderNumber || '');
    setSenderError('');
  }, [selectedUser?._id, selectedUser?.senderNumber]);

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
      showToast('Failed to load user staff list: ' + getErrorMessage(err), 'error');
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
      showToast('Error loading user permissions: ' + getErrorMessage(err), 'error');
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
      showToast('Error loading role permissions: ' + getErrorMessage(err), 'error');
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
      showToast('Failed to save security rights: ' + getErrorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  // The sender number is what the messages this person sends to clients carry. Checked here in plain words, and again by the server.
  const handleSaveSenderNumber = async () => {
    if (!selectedUser) return;
    const typed = senderInput.trim();
    if (typed) {
      const checked = whatsappNumber(typed);
      if (!checked.ok) {
        setSenderError(checked.message);
        return;
      }
    }
    try {
      setSavingSender(true);
      setSenderError('');
      const res = await rightsService.setSenderNumber(selectedUser._id, typed);
      if (res.success) {
        const saved = res.data?.senderNumber || '';
        setUsers((list) => list.map((u) => (u._id === selectedUser._id ? { ...u, senderNumber: saved } : u)));
        setSelectedUser((u) => ({ ...u, senderNumber: saved }));
        setSenderInput(saved); // the box shows the number as it was stored, even when it is the one that was already there
        showToast(res.message || 'The sender number was saved.', 'success');
      } else {
        setSenderError(res.message || 'The sender number could not be saved.');
      }
    } catch (err) {
      setSenderError(getErrorMessage(err, 'The sender number could not be saved. Please try again.'));
    } finally {
      setSavingSender(false);
    }
  };

  if (currentUser?.role !== 'Admin' && currentUser?.role !== 'SuperAdmin') {
    return (
      <div className="glass-panel" style={{ padding: '60px 30px', textAlign: 'center', margin: '40px auto', maxWidth: '520px' }}>
        <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'var(--bg-FEE2E2)', color: 'var(--fg-DC2626)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px auto' }}>
          <Lock size={32} />
        </div>
        <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--fg-0F172A)', marginBottom: '8px', fontFamily: 'var(--font-headline)' }}>
          Administrator Access Only
        </h2>
        <p style={{ color: 'var(--fg-64748B)', fontSize: '0.875rem', marginBottom: '24px', lineHeight: 1.6 }}>
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
      <div className="page-header animate-fade-in" style={{ position: 'relative', zIndex: 20 }}>
        <div className="page-header-text">
          <div className="page-title-row">
            <h2 className="page-title">Rights &amp; Security Matrix</h2>
            <span className="count-chip" style={{ background: 'var(--bg-ECFDF3)', color: 'var(--fg-027A48)', borderColor: 'var(--bd-ABEFC6)' }}>Enterprise RBAC active</span>
          </div>
          <p className="page-subtitle">Control exactly what each person and role can see, change and download.</p>
        </div>

        <div className="page-actions">
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
                <label className="form-label" htmlFor="rights-user" style={{ marginBottom: '4px' }}>
                  User Reference (Select Member)
                </label>
                <select
                  id="rights-user"
                  className="form-select"
                  style={{ minWidth: 'min(280px, 100%)' }}
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
                    background: 'var(--bg-F8FAFC)',
                    border: '1px solid var(--bd-E2E8F0)',
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
                  <span style={{ fontSize: '0.8rem', color: 'var(--fg-475569)' }}>
                    Department: <strong style={{ color: 'var(--fg-2563EB)' }}>{selectedUser.role}</strong>
                  </span>
                </div>
              )}
            </>
          ) : (
            <div>
              <label className="form-label" htmlFor="rights-role" style={{ marginBottom: '4px' }}>
                Role
              </label>
              <select
                id="rights-role"
                className="form-select"
                style={{ minWidth: 'min(220px, 100%)' }}
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

      {/* Sender number: the number the messages this person sends to clients carry */}
      {scope === 'user' && selectedUser && (
        <div className="glass-panel" style={{ padding: '16px 24px', display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: '16px' }}>
          <div style={{ flex: '1 1 300px', minWidth: 0 }}>
            <label className="form-label" htmlFor="sender-number" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Phone size={14} aria-hidden="true" /> Sender number of {selectedUser.firstName} {selectedUser.lastName}
            </label>
            <input
              id="sender-number"
              type="tel"
              inputMode="tel"
              autoComplete="off"
              className="form-input"
              placeholder="e.g. 98765 43210 or +971 50 123 4567"
              value={senderInput}
              maxLength={40}
              aria-invalid={Boolean(senderError)}
              aria-describedby={senderError ? 'sender-number-error' : 'sender-number-hint'}
              onChange={(e) => {
                setSenderInput(e.target.value);
                setSenderError('');
              }}
            />
            {senderError ? (
              <p className="field-error" id="sender-number-error" role="alert">{senderError}</p>
            ) : (
              <p className="edit-hint" id="sender-number-hint" style={{ margin: '6px 0 0' }}>
                The number this person&apos;s messages to clients carry (it closes the message in the Send windows). WhatsApp itself sends from the account signed in on their device. Leave it empty to use the company number.
              </p>
            )}
          </div>
          <button type="button" className="btn btn-primary" style={{ marginTop: '22px' }} onClick={handleSaveSenderNumber} disabled={savingSender || senderInput.trim() === (selectedUser.senderNumber || '')}>
            <Save size={15} /> <span>{savingSender ? 'Saving...' : 'Save sender number'}</span>
          </button>
        </div>
      )}

      {/* Security Info Callout */}
      <div
        className="glass-panel"
        style={{
          padding: '14px 20px',
          background: 'var(--bg-EFF6FF)',
          border: '1px solid var(--bd-BFDBFE)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}
      >
        <Info size={20} color="#2563EB" style={{ flexShrink: 0 }} />
        <div style={{ fontSize: '0.8rem', color: 'var(--fg-1E40AF)', lineHeight: 1.4 }}>
          <strong>Configured Policies:</strong> "All data can be seen by any user" (Read enabled by default). Saving <strong>One user</strong> changes only that member. Saving <strong>Whole role</strong> updates the role and every member in Sales, Ops, or Viewer. Admin stays unrestricted.
        </div>
      </div>

      {/* Rights Matrix Table */}
      <div className="table-container">
        <table className="luxury-table table-sticky-first">
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
              <th style={{ textAlign: 'center', background: 'var(--bg-EFF6FF)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', color: 'var(--fg-2563EB)' }}>
                  <Download size={13} />
                  <span>Data Download / Export</span>
                </div>
              </th>
              <th style={{ textAlign: 'center', background: 'var(--bg-FEF2F2)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', color: 'var(--fg-DC2626)' }}>
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
                    <div style={{ fontWeight: 700, color: 'var(--fg-0F172A)', fontSize: '0.9rem' }}>
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
                  <td style={{ textAlign: 'center', background: 'var(--bg-F8FAFC)' }}>
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
                  <td style={{ textAlign: 'center', background: 'var(--bg-FEF2F2)' }}>
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
