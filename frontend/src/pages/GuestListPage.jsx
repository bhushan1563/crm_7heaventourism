import React, { useState, useEffect, useMemo } from 'react';
import {
  Users,
  Plus,
  Search,
  Filter,
  Calendar,
  MapPin,
  Mail,
  Phone,
  Edit2,
  Trash2,
  Lock,
  Sparkles,
  CheckCircle2,
  Clock,
  Send,
  Plane,
  RefreshCw,
  MessageSquare,
  PhoneForwarded,
  PhoneCall,
  X,
  ChevronDown
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import guestService from '../services/guestService';
import userService from '../services/userService';
import StatusBadge from '../components/StatusBadge';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import ExportButton from '../components/ExportButton';
import GuestFollowUpModal from '../components/GuestFollowUpModal';
import { formatDate, toInputDate } from '../utils/dateHelper';
import { GUEST_STATUSES } from '../config';
import { getErrorMessage } from '../services/api';

const STATUS_OPTIONS = GUEST_STATUSES;

const getStatusStyle = (status) => {
  // Same palette as the status chips (StatusBadge) so a status looks identical everywhere.
  switch (status) {
    case 'Follow up':
      return { bg: 'var(--bg-FFF4ED)', color: 'var(--fg-B93815)', border: 'var(--bd-F9DBAF)' };
    case 'Quoted':
      return { bg: 'var(--bg-EFF8FF)', color: 'var(--fg-175CD3)', border: 'var(--bd-B2DDFF)' };
    case 'Confirmed':
      return { bg: 'var(--bg-F4F3FF)', color: 'var(--fg-5925DC)', border: 'var(--bd-D9D6FE)' };
    case 'Confirmed & Payment received':
      return { bg: 'var(--bg-ECFDF3)', color: 'var(--fg-027A48)', border: 'var(--bd-ABEFC6)' };
    case 'Travelled':
      return { bg: 'var(--bg-F0FDF9)', color: 'var(--fg-107569)', border: 'var(--bd-99F6E0)' };
    case 'Cancelled':
      return { bg: 'var(--bg-FEF3F2)', color: 'var(--fg-B42318)', border: 'var(--bd-FECDCA)' };
    case 'Under Process':
    default:
      return { bg: 'var(--bg-FFFAEB)', color: 'var(--fg-B54708)', border: 'var(--bd-FEDF89)' };
  }
};

export const GuestListPage = () => {
  const { user, can, canEditRecord } = useAuth();
  const { showToast } = useToast();

  const [guests, setGuests] = useState([]);
  const [usersList, setUsersList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedGuest, setSelectedGuest] = useState(null);
  const [deleteGuestItem, setDeleteGuestItem] = useState(null);
  const [followUpGuest, setFollowUpGuest] = useState(null);
  const [statusChangeData, setStatusChangeData] = useState(null);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    inquiryDate: new Date().toISOString().split('T')[0],
    guestNames: '',
    email: '',
    contactNumber: '',
    destination: '',
    travelDate: '',
    status: 'Under Process',
    sales: user ? `${user.firstName} ${user.lastName}` : '',
    salesId: user ? user._id : '',
    ops: '',
    opsId: '',
    paxCount: 2,
    budget: '',
    notes: ''
  });

  const fetchGuests = async () => {
    try {
      setLoading(true);
      const res = await guestService.getGuests();
      if (res.success) {
        setGuests(res.data);
      }
      else {
        showToast(res.message, 'error');
      }
    } catch (err) {
      showToast('Error loading guests: ' + getErrorMessage(err), 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const res = await userService.getUsers();
      if (res.success) {
        setUsersList(res.data);
      }
      else {
        showToast(res.message, 'error');
      }
    } catch (err) {
      console.warn('Could not load users list');
    }
  };

  useEffect(() => {
    fetchGuests();
    fetchUsers();
  }, []);

  // Filtered Guests list
  const filteredGuests = useMemo(() => {
    return guests.filter((g) => {
      const matchesStatus = statusFilter === 'ALL' || g.status === statusFilter;
      const s = searchQuery.trim().toLowerCase();
      if (!s) return matchesStatus;

      const srNo = (g.srNo || '').toLowerCase();
      const guestNames = (g.guestNames || '').toLowerCase();
      const email = (g.email || '').toLowerCase();
      const contactNumber = (g.contactNumber || '').toLowerCase();
      const destination = (g.destination || '').toLowerCase();
      const sales = (g.sales || '').toLowerCase();
      const ops = (g.ops || '').toLowerCase();
      const notes = (g.notes || '').toLowerCase();
      const budget = (g.budget || '').toLowerCase();
      const inquiryDate = g.inquiryDate ? formatDate(g.inquiryDate).toLowerCase() : '';
      const travelDate = g.travelDate ? formatDate(g.travelDate).toLowerCase() : '';

      // Support multi-term and specific guest name search
      const searchTerms = s.split(/\s+/).filter(Boolean);
      const matchesSearch = searchTerms.every(term =>
        guestNames.includes(term) ||
        srNo.includes(term) ||
        contactNumber.includes(term) ||
        destination.includes(term) ||
        email.includes(term) ||
        sales.includes(term) ||
        ops.includes(term) ||
        notes.includes(term) ||
        budget.includes(term) ||
        inquiryDate.includes(term) ||
        travelDate.includes(term)
      );

      return matchesStatus && matchesSearch;
    });
  }, [guests, statusFilter, searchQuery]);

  // Handle Quick Status Change Request
  const handleRequestStatusChange = (guest, newStatus) => {
    if (guest.status === newStatus) return;

    if (!canEditRecord('guest_list', guest)) {
      showToast('Security Restriction: You do not have permission to modify data updated/created by other members.', 'warning');
      return;
    }

    setStatusChangeData({ guest, newStatus });
  };

  // Confirm Status Change
  const handleConfirmStatusChange = async () => {
    if (!statusChangeData) return;
    const { guest, newStatus } = statusChangeData;

    try {
      setIsUpdatingStatus(true);
      const res = await guestService.updateStatus(guest._id, newStatus);
      if (res.success) {
        showToast(`Status updated to "${newStatus}" for ${guest.srNo}`, 'success');

        if (newStatus === 'Confirmed & Payment received') {
          confetti({
            particleCount: 80,
            spread: 60,
            origin: { y: 0.6 }
          });
        }

        setGuests((prev) =>
          prev.map((item) => (item._id === guest._id ? { ...item, status: newStatus } : item))
        );
        setStatusChangeData(null);
      }
      else {
        showToast(res.message, 'error');
      }
    } catch (err) {
      showToast(getErrorMessage(err, 'Failed to update status'), 'error');
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  // Group users for Sales dropdown
  const salesOptions = useMemo(() => {
    const activeUsers = usersList.filter((u) => u.active !== false);
    const pool = activeUsers.length > 0 ? activeUsers : usersList;
    const salesGroup = pool.filter((u) => u.role === 'Sales');
    return salesGroup;
  }, [usersList]);

  // Group users for Ops dropdown
  const opsOptions = useMemo(() => {
    const activeUsers = usersList.filter((u) => u.active !== false);
    const pool = activeUsers.length > 0 ? activeUsers : usersList;
    const opsGroup = pool.filter((u) => u.role === 'Ops');
    return opsGroup;
  }, [usersList]);

  const getSalesSelectedValue = () => {
    if (formData.salesId) return formData.salesId;
    const match = usersList.find((u) => `${u.firstName} ${u.lastName}`.toLowerCase() === (formData.sales || '').toLowerCase());
    return match ? match._id : (formData.sales || '');
  };

  const getOpsSelectedValue = () => {
    if (formData.opsId) return formData.opsId;
    const match = usersList.find((u) => `${u.firstName} ${u.lastName}`.toLowerCase() === (formData.ops || '').toLowerCase());
    return match ? match._id : (formData.ops || '');
  };

  const handleSalesChange = (e) => {
    const selectedVal = e.target.value;
    const matched = usersList.find((u) => u._id === selectedVal || `${u.firstName} ${u.lastName}` === selectedVal);
    if (matched) {
      setFormData((prev) => ({
        ...prev,
        sales: `${matched.firstName} ${matched.lastName}`,
        salesId: matched._id
      }));
    } else {
      setFormData((prev) => ({
        ...prev,
        sales: selectedVal,
        salesId: ''
      }));
    }
  };

  const handleOpsChange = (e) => {
    const selectedVal = e.target.value;
    const matched = usersList.find((u) => u._id === selectedVal || `${u.firstName} ${u.lastName}` === selectedVal);
    if (matched) {
      setFormData((prev) => ({
        ...prev,
        ops: `${matched.firstName} ${matched.lastName}`,
        opsId: matched._id
      }));
    } else {
      setFormData((prev) => ({
        ...prev,
        ops: selectedVal,
        opsId: ''
      }));
    }
  };

  const handleOpenAdd = () => {
    const defaultSalesUser = (user && (user.role === 'Sales' || user.role === 'Admin'))
      ? user
      : usersList.find((u) => u.role === 'Sales' && u.active !== false) || user;

    const defaultOpsUser = usersList.find((u) => u.role === 'Ops' && u.active !== false);

    setFormData({
      inquiryDate: new Date().toISOString().split('T')[0],
      guestNames: '',
      email: '',
      contactNumber: '',
      destination: '',
      travelDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      status: 'Under Process',
      sales: defaultSalesUser ? `${defaultSalesUser.firstName} ${defaultSalesUser.lastName}` : (user ? `${user.firstName} ${user.lastName}` : ''),
      salesId: defaultSalesUser ? defaultSalesUser._id : (user ? user._id : ''),
      ops: defaultOpsUser ? `${defaultOpsUser.firstName} ${defaultOpsUser.lastName}` : '',
      opsId: defaultOpsUser ? defaultOpsUser._id : '',
      paxCount: 2,
      budget: '',
      notes: ''
    });
    setIsAddModalOpen(true);
  };

  const handleOpenEdit = (guest) => {
    if (!canEditRecord('guest_list', guest)) {
      showToast('Access Restricted: You are not authorized to edit records created by other members without permission.', 'warning');
      return;
    }
    const matchedSales = usersList.find(
      (u) => u._id === guest.salesId || `${u.firstName} ${u.lastName}`.toLowerCase() === (guest.sales || '').toLowerCase()
    );
    const matchedOps = usersList.find(
      (u) => u._id === guest.opsId || `${u.firstName} ${u.lastName}`.toLowerCase() === (guest.ops || '').toLowerCase()
    );

    setSelectedGuest(guest);
    setFormData({
      inquiryDate: toInputDate(guest.inquiryDate),
      guestNames: guest.guestNames || '',
      email: guest.email || '',
      contactNumber: guest.contactNumber || '',
      destination: guest.destination || '',
      travelDate: toInputDate(guest.travelDate),
      status: guest.status || 'Under Process',
      sales: guest.sales || (matchedSales ? `${matchedSales.firstName} ${matchedSales.lastName}` : ''),
      salesId: guest.salesId || (matchedSales ? matchedSales._id : ''),
      ops: guest.ops || (matchedOps ? `${matchedOps.firstName} ${matchedOps.lastName}` : ''),
      opsId: guest.opsId || (matchedOps ? matchedOps._id : ''),
      paxCount: guest.paxCount || 2,
      budget: guest.budget || '',
      notes: guest.notes || ''
    });
    setIsEditModalOpen(true);
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    if (!formData.guestNames || !formData.contactNumber || !formData.destination || !formData.travelDate) {
      showToast('Please fill all mandatory fields', 'warning');
      return;
    }

    try {
      setSubmitting(true);
      const res = await guestService.createGuest(formData);
      if (res.success) {
        showToast(`Guest inquiry ${res.data.srNo} registered successfully!`, 'success');
        setIsAddModalOpen(false);
        fetchGuests();
      }
      else {
        showToast(res.message, 'error');
      }
    } catch (err) {
      showToast(getErrorMessage(err, 'Error creating guest inquiry'), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      const res = await guestService.updateGuest(selectedGuest._id, formData);
      if (res.success) {
        showToast(`Guest inquiry ${selectedGuest.srNo} updated!`, 'success');
        setIsEditModalOpen(false);
        fetchGuests();
      }
      else {
        showToast(res.message, 'error');
      }
    } catch (err) {
      showToast(getErrorMessage(err, 'Error updating inquiry'), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteGuestItem) return;
    try {
      setSubmitting(true);
      const res = await guestService.deleteGuest(deleteGuestItem._id);
      if (res.success) {
        showToast(`Inquiry ${deleteGuestItem.srNo} deleted successfully`, 'success');
        setDeleteGuestItem(null);
        fetchGuests();
      }
      else {
        showToast(res.message, 'error');
      }
    } catch (err) {
      showToast(getErrorMessage(err, 'Failed to delete inquiry'), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleFollowUpLogged = async (guestId, payload) => {
    try {
      const res = await guestService.addFollowUp(guestId, payload);
      if (res.success) {
        showToast('Follow-up interaction recorded successfully!', 'success');
        fetchGuests();
      }
      else {
        showToast(res.message, 'error');
      }
    } catch (err) {
      showToast(getErrorMessage(err, 'Failed to record follow-up'), 'error');
    }
  };

  // PDF Export Data Preparation
  const pdfHeaders = ['Sr No', 'Inquiry Date', 'Guest Names', 'Contact', 'Destination', 'Travel Date', 'Status', 'Sales', 'Ops'];
  const pdfRows = filteredGuests.map(g => [
    g.srNo,
    formatDate(g.inquiryDate),
    g.guestNames,
    `${g.contactNumber} ${g.email || ''}`,
    g.destination,
    formatDate(g.travelDate),
    g.status,
    g.sales,
    g.ops
  ]);

  const exportData = useMemo(() => {
    return filteredGuests.map(g => ({
      'Sr No': g.srNo,
      'Inquiry Date': formatDate(g.inquiryDate),
      'Guest Names': g.guestNames,
      'Contact Number': g.contactNumber,
      'Email': g.email || '',
      'Destination': g.destination,
      'Travel Date': formatDate(g.travelDate),
      'Status': g.status,
      'Sales Person': g.sales,
      'Ops Person': g.ops,
      'Pax Count': g.paxCount || 2,
      'Estimated Budget': g.budget || '',
      'Notes': g.notes || ''
    }));
  }, [filteredGuests]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* Header & Controls Bar */}
      <div className="page-header animate-fade-in" style={{ position: 'relative', zIndex: 20 }}>
        <div className="page-header-text">
          <div className="page-title-row">
            <h2 className="page-title">Guest Inquiries</h2>
            <span className="count-chip">{filteredGuests.length} {filteredGuests.length === 1 ? 'inquiry' : 'inquiries'}</span>
          </div>
          <p className="page-subtitle">Track every lead from first inquiry to travel.</p>
        </div>

        <div className="page-actions">
          {/* Export Dropdown with permission enforcement */}
          <ExportButton
            moduleName="guest_list"
            data={exportData}
            excelFilename="7Heaven_Guest_Inquiries.xlsx"
            csvFilename="7Heaven_Guest_Inquiries.csv"
            pdfTitle="7Heaven Guest Inquiries Report"
            pdfHeaders={pdfHeaders}
            pdfRows={pdfRows}
          />

          {/* Add Guest Button */}
          {can('guest_list', 'canCreate') ? (
            <button onClick={handleOpenAdd} className="btn btn-gold">
              <Plus size={16} />
              <span>Generate Inquiry</span>
            </button>
          ) : (
            <button className="btn btn-outline" disabled title="No Create Permission">
              <Lock size={14} color="#f59e0b" />
              <span>Inquiry Creation Locked</span>
            </button>
          )}

          <button onClick={fetchGuests} className="btn-icon btn-outline" title="Refresh">
            <RefreshCw size={15} />
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div
        className="glass-panel"
        style={{
          padding: '10px 16px',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '10px'
        }}
      >
        {/* Search */}
        <div className="filter-search" style={{ position: 'relative', minWidth: '280px', flex: 1 }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--fg-64748B)' }} />
          <input
            type="text"
            className="form-input"
            style={{ paddingLeft: '38px', paddingRight: searchQuery ? '36px' : '12px', height: '36px', fontSize: '0.825rem' }}
            placeholder="Search Guest Name, Contact, Destination, Sr No, Sales..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              type="button"
              style={{
                position: 'absolute',
                right: '10px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--fg-94A3B8)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '2px',
                borderRadius: '50%'
              }}
              title="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Status Filter Tabs */}
        <div className="filter-pills">
          <button
            onClick={() => setStatusFilter('ALL')}
            className={`btn btn-sm ${statusFilter === 'ALL' ? 'btn-gold' : 'btn-outline'}`}
          >
            All ({guests.length})
          </button>
          {STATUS_OPTIONS.map((st) => {
            const count = guests.filter((g) => g.status === st).length;
            const isSelected = statusFilter === st;
            return (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`btn btn-sm ${isSelected ? 'btn-gold' : 'btn-outline'}`}
              >
                {st} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* Guest Table */}
      <div className="table-container" style={{ width: '100%' }}>
        <table className="luxury-table table-stack" style={{ width: '100%' }}>
          <thead>
            <tr>
              <th style={{ width: '82px' }}>Sr No</th>
              <th style={{ width: '85px' }}>Inquiry Date</th>
              <th>Guest Names</th>
              <th>Mail & Contact</th>
              <th>Destination</th>
              <th style={{ width: '85px' }}>Travel Date</th>
              <th style={{ width: '135px' }}>Status</th>
              <th style={{ width: '105px' }}>Sales</th>
              <th style={{ width: '105px' }}>Ops</th>
              <th style={{ textAlign: 'right', width: '70px' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="10" style={{ textAlign: 'center', padding: '40px', color: 'var(--fg-94A3B8)' }}>
                  Loading 7Heaven inquiries...
                </td>
              </tr>
            ) : filteredGuests.length === 0 ? (
              <tr>
                <td colSpan="10" style={{ textAlign: 'center', padding: '40px', color: 'var(--fg-94A3B8)' }}>
                  No guest inquiries found matching your criteria.
                </td>
              </tr>
            ) : (
              filteredGuests.map((guest) => {
                const isEditable = canEditRecord('guest_list', guest);
                const canDelete = can('guest_list', 'canDelete') && isEditable;

                return (
                  <tr key={guest._id || guest.srNo}>
                    {/* A. Sr No */}
                    <td data-label="Sr No">
                      <span
                        style={{
                          fontWeight: 700,
                          color: 'var(--fg-2563EB)',
                          fontSize: '0.75rem',
                          fontFamily: 'monospace',
                          background: 'var(--bg-EFF6FF)',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          border: '1px solid var(--bd-BFDBFE)'
                        }}
                      >
                        {guest.srNo}
                      </span>
                    </td>

                    {/* B. Date of Inquiry Generate */}
                    <td data-label="Inquiry Date" style={{ color: 'var(--fg-64748B)', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
                      {formatDate(guest.inquiryDate)}
                    </td>

                    {/* C. Guest Names */}
                    <td data-label="Guest">
                      <div style={{ fontWeight: 700, color: 'var(--fg-0F172A)', fontSize: '0.825rem' }}>
                        {guest.guestNames}
                      </div>
                      {guest.paxCount && (
                        <div style={{ fontSize: '0.7rem', color: 'var(--fg-64748B)' }}>
                          {guest.paxCount} Pax • {guest.budget || 'Custom'}
                        </div>
                      )}
                    </td>

                    {/* D. Mail Id & Contact number */}
                    <td data-label="Contact">
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: 'var(--fg-0F172A)' }}>
                          <Phone size={11} color="#10B981" />
                          <span>{guest.contactNumber}</span>
                        </div>
                        {guest.email && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', color: 'var(--fg-2563EB)', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            <Mail size={11} color="#2563EB" />
                            <span>{guest.email}</span>
                          </div>
                        )}
                      </div>
                    </td>

                    {/* E. Destination */}
                    <td data-label="Destination">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600, color: 'var(--fg-0F172A)', fontSize: '0.775rem' }}>
                        <MapPin size={12} color="#2563EB" style={{ flexShrink: 0 }} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{guest.destination}</span>
                      </div>
                    </td>

                    {/* F. Travel Date */}
                    <td data-label="Travel Date">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--fg-475569)', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
                        <Calendar size={12} color="#0288D1" />
                        <span>{formatDate(guest.travelDate)}</span>
                      </div>
                    </td>

                    {/* G. Status (Quick Switcher Dropdown) */}
                    <td data-label="Status">
                      {(() => {
                        const stStyle = getStatusStyle(guest.status);
                        return (
                          <div style={{ position: 'relative', display: 'inline-block', width: '100%', maxWidth: '135px' }}>
                            <select
                              value={guest.status}
                              onChange={(e) => handleRequestStatusChange(guest, e.target.value)}
                              disabled={!isEditable}
                              style={{
                                width: '100%',
                                padding: '4px 22px 4px 6px',
                                borderRadius: '6px',
                                fontSize: '0.725rem',
                                fontWeight: 700,
                                fontFamily: 'var(--font-headline)',
                                backgroundColor: stStyle.bg,
                                color: stStyle.color,
                                border: `1px solid ${stStyle.border}`,
                                cursor: isEditable ? 'pointer' : 'not-allowed',
                                appearance: 'none',
                                WebkitAppearance: 'none',
                                MozAppearance: 'none',
                                outline: 'none',
                                transition: 'all 0.15s ease',
                                boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)'
                              }}
                              title={isEditable ? `Quick switch status for ${guest.srNo}` : 'Permission required to update status'}
                            >
                              {STATUS_OPTIONS.map((st) => (
                                <option
                                  key={st}
                                  value={st}
                                  style={{
                                    backgroundColor: 'var(--bg-FFFFFF)',
                                    color: 'var(--fg-0F172A)',
                                    fontWeight: 600,
                                    padding: '6px 8px'
                                  }}
                                >
                                  {st === 'Under Process' && 'Under Process'}
                                  {st === 'Follow up' && 'Follow up'}
                                  {st === 'Quoted' && 'Quoted'}
                                  {st === 'Confirmed' && 'Confirmed'}
                                  {st === 'Confirmed & Payment received' && 'Paid'}
                                  {st === 'Travelled' && 'Travelled'}
                                  {st === 'Cancelled' && 'Cancelled'}
                                </option>
                              ))}
                            </select>
                            <ChevronDown
                              size={12}
                              style={{
                                position: 'absolute',
                                right: '6px',
                                top: '50%',
                                transform: 'translateY(-50%)',
                                color: stStyle.color,
                                pointerEvents: 'none',
                                opacity: 0.85
                              }}
                            />
                          </div>
                        );
                      })()}
                    </td>

                    {/* H. Sales */}
                    <td data-label="Sales">
                      <span style={{ fontSize: '0.75rem', color: 'var(--fg-2563EB)', fontWeight: 700, whiteSpace: 'nowrap' }}>
                        {guest.sales}
                      </span>
                    </td>

                    {/* I. Ops */}
                    <td data-label="Ops">
                      <span style={{ fontSize: '0.75rem', color: 'var(--fg-0D9488)', fontWeight: 700, whiteSpace: 'nowrap' }}>
                        {guest.ops}
                      </span>
                    </td>

                    {/* Actions */}
                    <td data-label="" style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '3px' }}>
                        {/* Notify & Follow-up Button */}
                        <button
                          onClick={() => setFollowUpGuest(guest)}
                          className="btn-icon btn-outline btn-sm"
                          title="Notify & Follow-up with Guest"
                          style={{ borderColor: 'var(--bd-BFDBFE)', color: 'var(--fg-2563EB)', padding: '3px' }}
                        >
                          <MessageSquare size={12} color="#2563EB" />
                        </button>

                        {isEditable ? (
                          <button
                            onClick={() => handleOpenEdit(guest)}
                            className="btn-icon btn-outline btn-sm"
                            title="Edit Inquiry"
                            style={{ padding: '3px' }}
                          >
                            <Edit2 size={12} color="#2563EB" />
                          </button>
                        ) : (
                          <span title="Locked for Assigned Staff" style={{ padding: '3px', color: 'var(--fg-DC2626)' }}>
                            <Lock size={12} />
                          </span>
                        )}

                        {canDelete && (
                          <button
                            onClick={() => setDeleteGuestItem(guest)}
                            className="btn-icon btn-danger btn-sm"
                            title="Delete Inquiry"
                            style={{ padding: '3px' }}
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Add Guest Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Generate New Guest Inquiry"
      >
        <form onSubmit={handleCreateSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div className="form-group">
              <label className="form-label">Date of Inquiry *</label>
              <input
                type="date"
                className="form-input"
                value={formData.inquiryDate}
                onChange={(e) => setFormData({ ...formData, inquiryDate: e.target.value })}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Initial Status</label>
              <select
                className="form-select"
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Guest Names *</label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. Dr. Rajesh Sharma & Family"
              value={formData.guestNames}
              onChange={(e) => setFormData({ ...formData, guestNames: e.target.value })}
              required
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div className="form-group">
              <label className="form-label">Contact Number *</label>
              <input
                type="text"
                className="form-input"
                placeholder="+91 98200 12345"
                value={formData.contactNumber}
                onChange={(e) => setFormData({ ...formData, contactNumber: e.target.value })}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Email ID</label>
              <input
                type="email"
                className="form-input"
                placeholder="guest@example.com"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '14px' }}>
            <div className="form-group">
              <label className="form-label">Destination *</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. Switzerland & Paris Grand Tour"
                value={formData.destination}
                onChange={(e) => setFormData({ ...formData, destination: e.target.value })}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Travel Date *</label>
              <input
                type="date"
                className="form-input"
                value={formData.travelDate}
                onChange={(e) => setFormData({ ...formData, travelDate: e.target.value })}
                required
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div className="form-group">
              <label className="form-label">Assigned Sales Person *</label>
              <select
                className="form-select"
                value={getSalesSelectedValue()}
                onChange={handleSalesChange}
                required
              >
                <option value="">-- Select Sales Person --</option>
                {usersList.length > 0 ? (
                  <>
                    {salesOptions.length > 0 && (
                      <>
                        {salesOptions.map((u) => (
                          <option key={u._id} value={u._id}>
                            {u.firstName} {u.lastName} (Sales)
                          </option>
                        ))}
                      </>
                    )}
                  </>
                ) : (
                  <></>
                )}
                {formData.sales && !usersList.some((u) => u._id === formData.salesId || `${u.firstName} ${u.lastName}`.toLowerCase() === formData.sales.toLowerCase()) && (
                  <option value={formData.sales}>{formData.sales} (Assigned)</option>
                )}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Assigned Ops Person *</label>
              <select
                className="form-select"
                value={getOpsSelectedValue()}
                onChange={handleOpsChange}
                required
              >
                <option value="">-- Select Ops Person --</option>
                {usersList.length > 0 ? (
                  <>
                    {opsOptions.length > 0 && (
                      <>
                        {opsOptions.map((u) => (
                          <option key={u._id} value={u._id}>
                            {u.firstName} {u.lastName} (Ops)
                          </option>
                        ))}
                      </>
                    )}
                  </>
                ) : (
                  <></>
                )}
                {formData.ops && !usersList.some((u) => u._id === formData.opsId || `${u.firstName} ${u.lastName}`.toLowerCase() === formData.ops.toLowerCase()) && (
                  <option value={formData.ops}>{formData.ops} (Assigned)</option>
                )}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div className="form-group">
              <label className="form-label">Pax Count</label>
              <input
                type="number"
                min="1"
                className="form-input"
                value={formData.paxCount}
                onChange={(e) => setFormData({ ...formData, paxCount: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Estimated Budget</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. ₹5,50,000"
                value={formData.budget}
                onChange={(e) => setFormData({ ...formData, budget: e.target.value })}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Notes & Special Requirements</label>
            <textarea
              className="form-textarea"
              rows="3"
              placeholder="e.g. 5-star hotel requirements, vegetarian food preferences..."
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            />
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
              {submitting ? 'Creating...' : 'Save & Generate Sr No'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit Guest Modal */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title={`Edit Inquiry: ${selectedGuest?.srNo}`}
      >
        <form onSubmit={handleEditSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div className="form-group">
              <label className="form-label">Date of Inquiry</label>
              <input
                type="date"
                className="form-input"
                value={formData.inquiryDate}
                onChange={(e) => setFormData({ ...formData, inquiryDate: e.target.value })}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Status</label>
              <select
                className="form-select"
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Guest Names *</label>
            <input
              type="text"
              className="form-input"
              value={formData.guestNames}
              onChange={(e) => setFormData({ ...formData, guestNames: e.target.value })}
              required
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div className="form-group">
              <label className="form-label">Contact Number *</label>
              <input
                type="text"
                className="form-input"
                value={formData.contactNumber}
                onChange={(e) => setFormData({ ...formData, contactNumber: e.target.value })}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Email ID</label>
              <input
                type="email"
                className="form-input"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '14px' }}>
            <div className="form-group">
              <label className="form-label">Destination *</label>
              <input
                type="text"
                className="form-input"
                value={formData.destination}
                onChange={(e) => setFormData({ ...formData, destination: e.target.value })}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Travel Date *</label>
              <input
                type="date"
                className="form-input"
                value={formData.travelDate}
                onChange={(e) => setFormData({ ...formData, travelDate: e.target.value })}
                required
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div className="form-group">
              <label className="form-label">Assigned Sales Person *</label>
              <select
                className="form-select"
                value={getSalesSelectedValue()}
                onChange={handleSalesChange}
                required
              >
                <option value="">-- Select Sales Person --</option>
                {usersList.length > 0 ? (
                  <>
                    {salesOptions.length > 0 && (
                      <>
                        {salesOptions.map((u) => (
                          <option key={u._id} value={u._id}>
                            {u.firstName} {u.lastName} (Sales)
                          </option>
                        ))}
                      </>
                    )}
                  </>
                ) : (
                  <></>
                )}
                {formData.sales && !usersList.some((u) => u._id === formData.salesId || `${u.firstName} ${u.lastName}`.toLowerCase() === formData.sales.toLowerCase()) && (
                  <option value={formData.sales}>{formData.sales} (Assigned)</option>
                )}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Assigned Ops Person *</label>
              <select
                className="form-select"
                value={getOpsSelectedValue()}
                onChange={handleOpsChange}
                required
              >
                <option value="">-- Select Ops Person --</option>
                {usersList.length > 0 ? (
                  <>
                    {opsOptions.length > 0 && (
                      <>
                        {opsOptions.map((u) => (
                          <option key={u._id} value={u._id}>
                            {u.firstName} {u.lastName} (Ops)
                          </option>
                        ))}
                      </>
                    )}
                  </>
                ) : (
                  <></>
                )}
                {formData.ops && !usersList.some((u) => u._id === formData.opsId || `${u.firstName} ${u.lastName}`.toLowerCase() === formData.ops.toLowerCase()) && (
                  <option value={formData.ops}>{formData.ops} (Assigned)</option>
                )}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Notes & Special Requirements</label>
            <textarea
              className="form-textarea"
              rows="3"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            />
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
              {submitting ? 'Updating...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={Boolean(deleteGuestItem)}
        onClose={() => setDeleteGuestItem(null)}
        onConfirm={handleDeleteConfirm}
        title="Delete Guest Inquiry"
        message={`Are you sure you want to permanently remove inquiry "${deleteGuestItem?.srNo}" (${deleteGuestItem?.guestNames})?`}
        confirmText="Delete Record"
        isDanger={true}
        isLoading={submitting}
      />

      {/* Status Change Confirmation Dialog */}
      <ConfirmDialog
        isOpen={Boolean(statusChangeData)}
        onClose={() => {
          if (!isUpdatingStatus) setStatusChangeData(null);
        }}
        onConfirm={handleConfirmStatusChange}
        title="Change Inquiry Status"
        message={`Are you sure you want to change status for inquiry "${statusChangeData?.guest?.srNo}" (${statusChangeData?.guest?.guestNames}) from "${statusChangeData?.guest?.status}" to "${statusChangeData?.newStatus}"?`}
        confirmText="Change Status"
        isDanger={false}
        isLoading={isUpdatingStatus}
      />

      {/* Guest Follow-Up & Notification Modal */}
      {followUpGuest && (
        <GuestFollowUpModal
          isOpen={Boolean(followUpGuest)}
          onClose={() => setFollowUpGuest(null)}
          guest={followUpGuest}
          currentUser={user}
          onFollowUpLogged={handleFollowUpLogged}
        />
      )}
    </div>
  );
};

export default GuestListPage;
