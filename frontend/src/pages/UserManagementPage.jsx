import React, { useState, useEffect, useMemo } from 'react';
import {
  UserCog,
  Plus,
  Search,
  Mail,
  Lock,
  Phone,
  Edit2,
  Trash2,
  CheckCircle2,
  XCircle,
  Shield,
  RefreshCw,
  Key
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import userService from '../services/userService';
import { USER_ROLES, USER_ROLE_FILTERS } from '../config';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import ExportButton from '../components/ExportButton';

export const UserManagementPage = () => {
  const { user: currentUser, can } = useAuth();
  const { showToast } = useToast();

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [deleteUserItem, setDeleteUserItem] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    firstName: '',
    lastName: '',
    role: 'Sales',
    phone: '',
    active: true
  });

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const res = await userService.getUsers();
      if (res.success) {
        setUsers(res.data);
      }
      else {
        showToast(res.message, 'error');
      }
    } catch (err) {
      showToast('Error loading users: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const matchesRole = roleFilter === 'ALL' || u.role === roleFilter;
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        !searchQuery ||
        u.email.toLowerCase().includes(q) ||
        u.firstName.toLowerCase().includes(q) ||
        u.lastName.toLowerCase().includes(q) ||
        u.role.toLowerCase().includes(q) ||
        (u.phone && u.phone.includes(q));
      return matchesRole && matchesSearch;
    });
  }, [users, roleFilter, searchQuery]);

  const handleToggleActive = async (targetUser) => {
    if (!can('users', 'canUpdate')) {
      showToast('You do not have permission to modify user activation state.', 'warning');
      return;
    }

    try {
      const res = await userService.toggleActive(targetUser._id);
      if (res.success) {
        showToast(`User ${targetUser.email} is now ${res.data.active ? 'Active' : 'Inactive'}`, 'success');
        setUsers((prev) =>
          prev.map((u) => (u._id === targetUser._id ? { ...u, active: res.data.active } : u))
        );
      }
      else {
        showToast(res.message, 'error');
      }
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to toggle status', 'error');
    }
  };

  const handleOpenAdd = () => {
    setFormData({
      email: '',
      password: '',
      firstName: '',
      lastName: '',
      role: 'Sales',
      phone: '',
      active: true
    });
    setIsAddModalOpen(true);
  };

  const handleOpenEdit = (u) => {
    setSelectedUser(u);
    setFormData({
      email: u.email || '',
      password: '',
      firstName: u.firstName || '',
      lastName: u.lastName || '',
      role: u.role || '',
      phone: u.phone || '',
      active: u.active !== undefined ? u.active : true
    });
    setIsEditModalOpen(true);
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    if (!formData.email || !formData.password || !formData.firstName || !formData.lastName) {
      showToast('Please fill in all mandatory fields (Email, Password, First Name, Last Name).', 'warning');
      return;
    }

    try {
      setSubmitting(true);
      const res = await userService.createUser(formData);
      if (res.success) {
        showToast(`User ${res.data.email} registered with role ${res.data.role}!`, 'success');
        setIsAddModalOpen(false);
        fetchUsers();
      }
      else {
        showToast(res.message, 'error');
      }
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to create user', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      const payload = { ...formData };
      if (!payload.password) delete payload.password; // Do not overwrite if blank

      const res = await userService.updateUser(selectedUser._id, payload);
      if (res.success) {
        showToast(`User profile updated for ${res.data.email}!`, 'success');
        setIsEditModalOpen(false);
        fetchUsers();
      }
      else {
        showToast(res.message, 'error');
      }
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to update user', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteUserItem) return;
    try {
      setSubmitting(true);
      const res = await userService.deleteUser(deleteUserItem._id);
      if (res.success) {
        showToast(`User account ${deleteUserItem.email} deleted`, 'success');
        setDeleteUserItem(null);
        fetchUsers();
      }
      else {
        showToast(res.message, 'error');
      }
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to delete user', 'error');
    } finally {
      setSubmitting(false);
    }
  };

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
          gap: '16px',
          position: 'relative',
          zIndex: 20
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h2 style={{ fontSize: '1.35rem', fontWeight: 700 }}>
              User Management
            </h2>
            <span
              style={{
                fontSize: '0.75rem',
                fontWeight: 700,
                padding: '3px 8px',
                borderRadius: '9999px',
                background: 'rgba(212, 175, 55, 0.15)',
                color: '#f5df88'
              }}
            >
              {filteredUsers.length} Unlimited Users Active
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <ExportButton
            moduleName="users"
            data={filteredUsers.map(u => ({
              'First Name': u.firstName,
              'Last Name': u.lastName,
              'Email': u.email,
              'Role': u.role,
              'Phone': u.phone || '',
              'Status': u.active ? 'Active' : 'Inactive'
            }))}
            excelFilename="7Heaven_Users.xlsx"
            csvFilename="7Heaven_Users.csv"
          />

          {can('users', 'canCreate') ? (
            <button onClick={handleOpenAdd} className="btn btn-gold">
              <Plus size={16} />
              <span>Create New User</span>
            </button>
          ) : (
            <button className="btn btn-outline" disabled title="No Create Right">
              <Lock size={14} color="#f59e0b" />
              <span>User Creation Locked</span>
            </button>
          )}

          <button onClick={fetchUsers} className="btn-icon btn-outline" title="Refresh">
            <RefreshCw size={15} />
          </button>
        </div>
      </div>

      {/* Filter and Search */}
      <div
        className="glass-panel"
        style={{
          padding: '12px 20px',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px'
        }}
      >
        <div style={{ position: 'relative', minWidth: '280px', flex: 1 }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
          <input
            type="text"
            className="form-input"
            style={{ paddingLeft: '38px', height: '38px', fontSize: '0.825rem' }}
            placeholder="Search users by name, email, phone, role..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {USER_ROLE_FILTERS.map((r) => (
            <button
              key={r}
              onClick={() => setRoleFilter(r)}
              className={`btn btn-sm ${roleFilter === r ? 'btn-gold' : 'btn-outline'}`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Users Table */}
      <div className="table-container">
        <table className="luxury-table">
          <thead>
            <tr>
              <th>User Details</th>
              <th>Email Address</th>
              <th>First Name</th>
              <th>Last Name</th>
              <th>Role / Department</th>
              <th>Active Status (Toggle)</th>
              <th style={{ textAlign: 'right', width: '90px' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="7" style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
                  Loading user directory...
                </td>
              </tr>
            ) : filteredUsers.length === 0 ? (
              <tr>
                <td colSpan="7" style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
                  No users found.
                </td>
              </tr>
            ) : (
              filteredUsers.map((u) => (
                  <tr key={u._id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div
                          style={{
                            width: '34px',
                            height: '34px',
                            borderRadius: '50%',
                            background: u.role === 'Admin' ? 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)' : '#EFF6FF',
                            color: u.role === 'Admin' ? '#FFFFFF' : '#2563EB',
                            fontWeight: 700,
                            fontSize: '0.85rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                        >
                          {u.firstName ? u.firstName[0] : 'U'}
                        </div>
                        <div>
                          <div style={{ fontWeight: 700, color: '#0F172A', fontSize: '0.875rem' }}>
                            {u.firstName} {u.lastName}
                          </div>
                          {u.phone && (
                            <div style={{ fontSize: '0.725rem', color: '#64748B' }}>
                              {u.phone}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>

                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.825rem', color: '#475569' }}>
                        <Mail size={13} color="#2563EB" />
                        <span>{u.email}</span>
                      </div>
                    </td>

                    <td style={{ color: '#0F172A', fontWeight: 600 }}>
                      {u.firstName}
                    </td>

                    <td style={{ color: '#0F172A', fontWeight: 600 }}>
                      {u.lastName}
                    </td>

                    <td>
                      <span
                        style={{
                          fontSize: '0.725rem',
                          fontWeight: 700,
                          padding: '3px 8px',
                          borderRadius: '6px',
                          background:
                            u.role === 'Admin' ? '#EFF6FF' :
                              u.role === 'Sales' ? '#E0F7FA' :
                                u.role === 'Ops' ? '#DCFCE7' : '#F1F5F9',
                          color:
                            u.role === 'Admin' ? '#2563EB' :
                              u.role === 'Sales' ? '#00838F' :
                                u.role === 'Ops' ? '#15803D' : '#475569',
                          border:
                            u.role === 'Admin' ? '1px solid #BFDBFE' :
                              u.role === 'Sales' ? '1px solid #B2EBF2' :
                                u.role === 'Ops' ? '1px solid #BBF7D0' : '1px solid #E2E8F0'
                        }}
                      >
                        {u.role}
                      </span>
                    </td>

                    {/* C. Active Status Toggle */}
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <label className="switch">
                          <input
                            type="checkbox"
                            checked={Boolean(u.active)}
                            onChange={() => handleToggleActive(u)}
                            disabled={!can('users', 'canUpdate')}
                          />
                          <span className="slider"></span>
                        </label>
                        <span
                          style={{
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            color: u.active ? '#34d399' : '#94a3b8'
                          }}
                        >
                          {u.active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                    </td>

                    {/* Actions */}
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                        {can('users', 'canUpdate') && (
                          <button
                            onClick={() => handleOpenEdit(u)}
                            className="btn-icon btn-outline btn-sm"
                            title="Edit User Details"
                          >
                            <Edit2 size={13} color="#38bdf8" />
                          </button>
                        )}

                        {can('users', 'canDelete') && u.role !== 'Admin' && (
                          <button
                            onClick={() => setDeleteUserItem(u)}
                            className="btn-icon btn-danger btn-sm"
                            title="Delete User"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add User Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Register New User Account"
      >
        <form onSubmit={handleCreateSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div className="form-group">
              <label className="form-label">First Name *</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. Ananya"
                value={formData.firstName}
                onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Last Name *</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. Sharma"
                value={formData.lastName}
                onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                required
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '14px' }}>
            <div className="form-group">
              <label className="form-label">Email Address *</label>
              <input
                type="email"
                className="form-input"
                placeholder="user@7heaven.com"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Role / Department *</label>
              <select
                className="form-select"
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
              >
                {USER_ROLES.map((role) => (
                  <option key={role.value} value={role.value}>{role.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div className="form-group">
              <label className="form-label">Password *</label>
              <input
                type="password"
                className="form-input"
                placeholder="••••••••"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Phone Number</label>
              <input
                type="text"
                className="form-input"
                placeholder="+91 98200 11223"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '14px 0' }}>
            <label className="switch">
              <input
                type="checkbox"
                checked={formData.active}
                onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
              />
              <span className="slider"></span>
            </label>
            <span style={{ fontSize: '0.85rem', color: '#cbd5e1', fontWeight: 600 }}>
              User is Active & Granted Access
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px' }}>
            <button
              type="button"
              onClick={() => setIsAddModalOpen(false)}
              className="btn btn-outline"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-gold"
              disabled={submitting}
            >
              {submitting ? 'Creating...' : 'Create User Account'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit User Modal */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title={`Edit User: ${selectedUser?.email}`}
      >
        <form onSubmit={handleEditSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div className="form-group">
              <label className="form-label">First Name *</label>
              <input
                type="text"
                className="form-input"
                value={formData.firstName}
                onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Last Name *</label>
              <input
                type="text"
                className="form-input"
                value={formData.lastName}
                onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                required
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '14px' }}>
            <div className="form-group">
              <label className="form-label">Email Address *</label>
              <input
                type="email"
                className="form-input"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Role</label>
              <select
                className="form-select"
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
              >
                {USER_ROLES.map((role) => (
                  <option key={role.value} value={role.value}>{role.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div className="form-group">
              <label className="form-label">New Password (Leave blank to keep current)</label>
              <input
                type="password"
                className="form-input"
                placeholder="••••••••"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Phone Number</label>
              <input
                type="text"
                className="form-input"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '14px 0' }}>
            <label className="switch">
              <input
                type="checkbox"
                checked={formData.active}
                onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
              />
              <span className="slider"></span>
            </label>
            <span style={{ fontSize: '0.85rem', color: '#cbd5e1', fontWeight: 600 }}>
              User Account Active
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px' }}>
            <button
              type="button"
              onClick={() => setIsEditModalOpen(false)}
              className="btn btn-outline"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-gold"
              disabled={submitting}
            >
              {submitting ? 'Updating...' : 'Save Profile Changes'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={Boolean(deleteUserItem)}
        onClose={() => setDeleteUserItem(null)}
        onConfirm={handleDeleteConfirm}
        title="Delete User Account"
        message={`Are you sure you want to permanently delete user account "${deleteUserItem?.email}"?`}
        confirmText="Delete User"
        isDanger={true}
        isLoading={submitting}
      />
    </div>
  );
};

export default UserManagementPage;
