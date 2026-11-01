import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText,
  Plus,
  Search,
  Filter,
  Eye,
  Download,
  Copy,
  Edit,
  Trash2,
  Calendar,
  DollarSign,
  CheckCircle2,
  Clock,
  Send,
  Plane,
  Sparkles,
  MapPin,
  Users,
  Loader2,
  PhoneForwarded,
  Lock
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import quotationService from '../services/quotationService';
import confirmationService from '../services/confirmationService';
import ConfirmBookingDialog from '../components/confirmation/ConfirmBookingDialog';
import { confirmBlockedReason } from '../utils/confirmation';
import StatusBadge from '../components/StatusBadge';
import ConfirmDialog from '../components/ConfirmDialog';
import ExportButton from '../components/ExportButton';
import QuotationPreviewModal from '../components/QuotationPreviewModal';
import QuotationDocumentView from '../components/QuotationDocumentView';
import { generateQuotationPDF } from '../utils/quotationPdfGenerator';
import { formatDate } from '../utils/dateHelper';
import { QUOTATION_STATUS_TABS } from '../config';
import { getErrorMessage } from '../services/api';

const STATUS_TABS = QUOTATION_STATUS_TABS;

export const QuotationListPage = () => {
  const { user, can, canEditRecord } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [quotations, setQuotations] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Preview Modal
  const [previewQuotation, setPreviewQuotation] = useState(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  // Delete Dialog
  const [deleteItem, setDeleteItem] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Follow-up Confirmation Dialog
  const [followUpItem, setFollowUpItem] = useState(null);
  const [isUpdatingFollowUp, setIsUpdatingFollowUp] = useState(false);

  // Confirm booking dialog: turns a quotation into a booking confirmation
  const [confirmItem, setConfirmItem] = useState(null);
  const [isConfirming, setIsConfirming] = useState(false);

  // Direct downloading state per item id
  const [downloadingId, setDownloadingId] = useState(null);
  const [directDownloadQuote, setDirectDownloadQuote] = useState(null);

  const fetchQuotations = async () => {
    try {
      setLoading(true);
      const [quotesRes, statsRes] = await Promise.all([
        quotationService.getQuotations(),
        quotationService.getStats()
      ]);

      if (quotesRes.success) {
        setQuotations(quotesRes.data);
      }
      else {
        showToast(quotesRes.message, 'error');
      }
      if (statsRes.success) {
        setStats(statsRes.data);
      }
      else {
        showToast(statsRes.message, 'error');
      }
    } catch (err) {
      showToast('Error loading quotations: ' + getErrorMessage(err), 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQuotations();
  }, []);

  const handleConfirmBooking = async (optionIndex) => {
    setIsConfirming(true);
    try {
      const res = await confirmationService.confirm(confirmItem._id, optionIndex);
      if (res.success) {
        showToast(res.message || 'Booking confirmed.', 'success');
        setConfirmItem(null);
        navigate(`/confirmations/${res.data._id}`);
      } else {
        showToast(res.message || 'The booking could not be confirmed.', 'error');
        fetchQuotations(); // someone else may have changed it: show what it is now
        setConfirmItem(null);
      }
    } catch (err) {
      showToast(getErrorMessage(err, 'The booking could not be confirmed.'), 'error');
    } finally {
      setIsConfirming(false);
    }
  };

  // Filtered quotations
  const filteredQuotations = useMemo(() => {
    return quotations.filter((q) => {
      const matchesStatus = statusFilter === 'ALL' || q.status === statusFilter;
      const s = searchQuery.toLowerCase();
      const matchesSearch =
        !searchQuery ||
        (q.quotationNo && q.quotationNo.toLowerCase().includes(s)) ||
        (q.clientName && q.clientName.toLowerCase().includes(s)) ||
        (q.destination && q.destination.toLowerCase().includes(s)) ||
        (q.clientEmail && q.clientEmail.toLowerCase().includes(s)) ||
        (q.clientPhone && q.clientPhone.includes(s)) ||
        (q.sales && q.sales.toLowerCase().includes(s)) ||
        (q.ops && q.ops.toLowerCase().includes(s));

      return matchesStatus && matchesSearch;
    });
  }, [quotations, statusFilter, searchQuery]);

  const handleDuplicate = async (id) => {
    try {
      const res = await quotationService.duplicateQuotation(id);
      if (res.success) {
        showToast(`Quotation duplicated successfully as ${res.data.quotationNo}!`, 'success');
        fetchQuotations();
      }
      else {
        showToast(res.message, 'error');
      }
    } catch (err) {
      showToast('Failed to duplicate quotation: ' + getErrorMessage(err), 'error');
    }
  };

  const handleFollowUpConfirm = async () => {
    if (!followUpItem) return;
    try {
      setIsUpdatingFollowUp(true);
      const res = await quotationService.updateQuotation(followUpItem._id, { status: 'Follow up' });
      if (res.success) {
        showToast(`Quotation ${followUpItem.quotationNo} marked for Follow up!`, 'success');
        setFollowUpItem(null);
        fetchQuotations();
      }
      else {
        showToast(res.message, 'error');
      }
    } catch (err) {
      showToast('Failed to update status: ' + getErrorMessage(err), 'error');
    } finally {
      setIsUpdatingFollowUp(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteItem) return;
    try {
      setIsDeleting(true);
      const res = await quotationService.deleteQuotation(deleteItem._id);
      if (res.success) {
        showToast('Quotation deleted successfully.', 'info');
        setDeleteItem(null);
        fetchQuotations();
      }
      else {
        showToast(res.message, 'error');
      }
    } catch (err) {
      showToast('Failed to delete quotation: ' + getErrorMessage(err), 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDirectDownload = async (quote) => {
    try {
      setDownloadingId(quote._id);
      setDirectDownloadQuote(quote);

      // Wait a tick for hidden DOM to render
      await new Promise(r => setTimeout(r, 150));

      const cleanDest = (quote.destination || '7Heaven').replace(/[^a-zA-Z0-9]/g, '_');
      const filename = `7Heaven_Quotation_${cleanDest}_${quote.quotationNo || 'Doc'}.pdf`;

      await generateQuotationPDF('direct-download-render-container', filename);
      showToast(`Quotation ${quote.quotationNo} PDF downloaded successfully!`, 'success');
    } catch (err) {
      console.error('Direct download error:', err);
      showToast('Failed to download PDF: ' + getErrorMessage(err), 'error');
    } finally {
      setDownloadingId(null);
      setDirectDownloadQuote(null);
    }
  };

  const hasCreateRight = can('quotations', 'canCreate');
  const hasDownloadRight = can('quotations', 'canDownload');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Top Header Banner */}
      <div className="page-header animate-fade-in" style={{ position: 'relative', zIndex: 20 }}>
        <div className="page-header-text">
          <div className="page-title-row">
            <h2 className="page-title">Quotations &amp; Proposals</h2>
            <span className="count-chip">{filteredQuotations.length} {filteredQuotations.length === 1 ? 'quotation' : 'quotations'}</span>
          </div>
          <p className="page-subtitle">Build, send and track itineraries and pricing.</p>
        </div>

        <div className="page-actions">
          {/* Export Button */}
          <ExportButton
            moduleName="quotations"
            data={filteredQuotations.map(q => ({
              'Quotation No': q.quotationNo,
              'Type': q.quotationType || 'Package',
              'Client Name': q.clientName,
              'Destination': q.destination,
              'Duration': q.duration,
              'Pax': q.paxDetails,
              'Travel Date': q.travelDate ? formatDate(q.travelDate) : '',
              'Status': q.status,
              'Cost Per Person': q.pricing?.totalCostPerPerson || 0,
              'Grand Total': q.pricing?.grandTotal || 0,
              'Sales Agent': q.sales,
              'Ops Agent': q.ops
            }))}
            excelFilename="7Heaven_Quotations.xlsx"
            csvFilename="7Heaven_Quotations.csv"
          />

          {/* New Quotation Button */}
          {hasCreateRight && (
            <button
              onClick={() => navigate('/quotations/new')}
              className="btn btn-primary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
            >
              <Plus size={16} />
              <span>Create New Quotation</span>
            </button>
          )}
        </div>
      </div>

      {/* KPI Stat Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
        {/* Total Quotes */}
        <div className="glass-panel" style={{ padding: '18px 20px', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '12px',
              background: 'var(--bg-E0F2FE)',
              border: '1px solid var(--bd-BAE6FD)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--fg-00A6F4)'
            }}
          >
            <FileText size={22} />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--fg-64748B)', textTransform: 'uppercase', fontWeight: 600 }}>
              Total Quotations
            </div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--fg-0F172A)', marginTop: '2px', fontFamily: 'var(--font-headline)' }}>
              {stats?.total || quotations.length}
            </div>
          </div>
        </div>

        {/* Confirmed Quotes */}
        <div className="glass-panel" style={{ padding: '18px 20px', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '12px',
              background: 'var(--bg-DCFCE7)',
              border: '1px solid var(--bd-BBF7D0)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--fg-15803D)'
            }}
          >
            <CheckCircle2 size={22} />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--fg-64748B)', textTransform: 'uppercase', fontWeight: 600 }}>
              Confirmed Quotes
            </div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--fg-15803D)', marginTop: '2px', fontFamily: 'var(--font-headline)' }}>
              {stats?.confirmed || quotations.filter(q => q.status === 'Confirmed').length}
            </div>
          </div>
        </div>

        {/* Total Pipeline Quoted Value */}
        <div className="glass-panel" style={{ padding: '18px 20px', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '12px',
              background: 'var(--bg-EFF6FF)',
              border: '1px solid var(--bd-BFDBFE)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--fg-2563EB)'
            }}
          >
            <DollarSign size={22} />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--fg-64748B)', textTransform: 'uppercase', fontWeight: 600 }}>
              Quoted Pipeline
            </div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--fg-2563EB)', marginTop: '2px', fontFamily: 'var(--font-headline)' }}>
              ₹{(stats?.totalQuotedValue || 0).toLocaleString('en-IN')}
            </div>
          </div>
        </div>

        {/* Conversion Rate */}
        <div className="glass-panel" style={{ padding: '18px 20px', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '12px',
              background: 'var(--bg-FEF3C7)',
              border: '1px solid var(--bd-FDE68A)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--fg-D97706)'
            }}
          >
            <Clock size={22} />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--fg-64748B)', textTransform: 'uppercase', fontWeight: 600 }}>
              Drafts / In-Flight
            </div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--fg-D97706)', marginTop: '2px', fontFamily: 'var(--font-headline)' }}>
              {(stats?.drafts || 0) + (stats?.sent || 0)}
            </div>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div
        className="glass-panel"
        style={{
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px'
        }}
      >
        {/* Status Tabs */}
        <div className="filter-pills">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setStatusFilter(tab)}
              style={{
                padding: '7px 14px',
                borderRadius: '8px',
                border: statusFilter === tab ? '1px solid #2563EB' : '1px solid var(--bd-E2E8F0)',
                fontSize: '0.8rem',
                fontWeight: statusFilter === tab ? 700 : 600,
                background: statusFilter === tab ? '#2563EB' : 'var(--bg-FFFFFF)',
                color: statusFilter === tab ? '#FFFFFF' : 'var(--fg-475569)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                boxShadow: statusFilter === tab ? '0 2px 8px rgba(37, 99, 235, 0.25)' : 'none',
                fontFamily: 'var(--font-headline)'
              }}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Search Input */}
        <div className="filter-search" style={{ position: 'relative', minWidth: '260px', maxWidth: '380px', flex: 1 }}>
          <Search
            size={16}
            style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--fg-64748B)' }}
          />
          <input
            type="text"
            className="form-input"
            placeholder="Search quotes, clients, destinations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ paddingLeft: '36px', height: '38px', fontSize: '0.825rem' }}
          />
        </div>
      </div>

      {/* Quotations List Table */}
      <div className="table-container animate-fade-in" style={{ width: '100%' }}>
        <table className="luxury-table table-stack" style={{ width: '100%' }}>
          <thead>
            <tr>
              <th style={{ width: '13%' }}>Quotation #</th>
              <th style={{ width: '15%' }}>Client & Pax</th>
              <th style={{ width: '15%' }}>Destination & Duration</th>
              <th style={{ width: '11%' }}>Travel Date</th>
              <th style={{ width: '12%' }}>Pricing</th>
              <th style={{ width: '13%' }}>Assigned Team</th>
              <th style={{ width: '9%' }}>Status</th>
              <th style={{ textAlign: 'center', width: '12%', minWidth: '165px' }}>PDF & Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: '40px', color: 'var(--fg-94A3B8)' }}>
                  <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto 8px auto', color: 'var(--fg-0EA5E9)' }} />
                  <div>Loading luxury quotations...</div>
                </td>
              </tr>
            ) : filteredQuotations.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: '40px', color: 'var(--fg-94A3B8)' }}>
                  <FileText size={32} style={{ margin: '0 auto 10px auto', opacity: 0.4 }} />
                  <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--fg-0F172A)' }}>No quotations found</div>
                  <div style={{ fontSize: '0.825rem', marginTop: '4px', color: 'var(--fg-64748B)' }}>
                    {searchQuery || statusFilter !== 'ALL'
                      ? 'Try adjusting your filters or search terms.'
                      : 'Click "+ Create New Quotation" to generate your first itinerary PDF.'}
                  </div>
                </td>
              </tr>
            ) : (
              filteredQuotations.map((q) => {
                const canModify = canEditRecord('quotations', q);
                const isDownloading = downloadingId === q._id;

                return (
                  <tr key={q._id} className="table-row-hover">
                    {/* Quotation No & Type */}
                    <td data-label="Quotation">
                      <div style={{ fontWeight: 700, color: 'var(--fg-0284C7)', fontSize: '0.825rem', whiteSpace: 'nowrap' }}>
                        {q.quotationNo}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px', flexWrap: 'wrap' }}>
                        <span
                          style={{
                            fontSize: '0.65rem',
                            fontWeight: 700,
                            padding: '1px 5px',
                            borderRadius: '3px',
                            backgroundColor: q.quotationType === 'Only Hotel' ? 'var(--bg-ECFDF5)' : (q.quotationType === 'Events / Corporate' ? 'var(--bg-FDF4FF)' : 'var(--bg-E0F2FE)'),
                            color: q.quotationType === 'Only Hotel' ? 'var(--fg-047857)' : (q.quotationType === 'Events / Corporate' ? 'var(--fg-A21CAF)' : 'var(--fg-0369A1)'),
                            border: '1px solid currentColor',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          {q.quotationType || 'Package'}
                        </span>
                        <span style={{ fontSize: '0.68rem', color: 'var(--fg-64748B)', whiteSpace: 'nowrap' }}>
                          {new Date(q.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </td>

                    {/* Client & Pax */}
                    <td data-label="Client">
                      <div style={{ fontWeight: 700, color: 'var(--fg-0F172A)', fontSize: '0.825rem', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {q.clientName}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--fg-64748B)', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px', whiteSpace: 'nowrap' }}>
                        <Users size={11} style={{ flexShrink: 0 }} /> <span>{q.paxDetails || ''}</span>
                      </div>
                    </td>

                    {/* Destination & Duration */}
                    <td data-label="Destination">
                      <div style={{ fontWeight: 700, color: 'var(--fg-00A6F4)', fontSize: '0.825rem', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {q.destination}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--fg-64748B)', marginTop: '2px', whiteSpace: 'nowrap' }}>
                        {q.duration || ''}
                      </div>
                    </td>

                    {/* Travel Date */}
                    <td data-label="Travel Date">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: 'var(--fg-334155)', whiteSpace: 'nowrap' }}>
                        <Calendar size={12} color="#00a6f4" style={{ flexShrink: 0 }} />
                        <span>{q.travelDate ? formatDate(q.travelDate) : 'Not specified'}</span>
                      </div>
                    </td>

                    {/* Pricing */}
                    <td data-label="Pricing">
                      <div style={{ fontWeight: 700, color: 'var(--fg-059669)', fontSize: '0.825rem', whiteSpace: 'nowrap' }}>
                        {/* A land service is priced for the whole trip (its vehicles) and a visa for all its applicants (its fees), not per person. */}
                        ₹{((q.quotationType === 'Land Service' || q.quotationType === 'Visa' ? q.pricing?.grandTotal : q.pricing?.totalCostPerPerson) || 0).toLocaleString('en-IN')}
                      </div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--fg-64748B)', whiteSpace: 'nowrap' }}>
                        {q.quotationType === 'Land Service' ? 'For the whole trip' : q.quotationType === 'Visa' ? 'For all applicants' : q.pricing?.grandTotal ? `Total: ₹${q.pricing.grandTotal.toLocaleString('en-IN')}` : 'Incl. GST'}
                      </div>
                    </td>

                    {/* Assigned Team */}
                    <td data-label="Team">
                      <div style={{ fontSize: '0.75rem', color: 'var(--fg-0F172A)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        <span style={{ color: 'var(--fg-64748B)' }}>Sales:</span> {q.sales || 'Unassigned'}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--fg-64748B)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        <span style={{ color: 'var(--fg-64748B)' }}>Ops:</span> {q.ops || 'Unassigned'}
                      </div>
                    </td>

                    {/* Status */}
                    <td data-label="Status">
                      <StatusBadge status={q.status || 'Draft'} />
                    </td>

                    {/* Actions */}
                    <td data-label="">
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px', flexWrap: 'nowrap' }}>
                        {/* 1. Follow-up Button */}
                        {canModify && (
                          <button
                            onClick={() => setFollowUpItem(q)}
                            className="btn btn-outline btn-sm btn-icon"
                            title="Mark for Follow up"
                            style={{ color: 'var(--fg-EA580C)', borderColor: 'var(--bd-FED7AA)', width: '26px', height: '26px', padding: 0, flexShrink: 0 }}
                          >
                            <PhoneForwarded size={13} color="#EA580C" />
                          </button>
                        )}

                        {/* 2. Preview PDF Modal */}
                        <button
                          onClick={() => {
                            setPreviewQuotation(q);
                            setIsPreviewOpen(true);
                          }}
                          className="btn btn-outline-azure btn-sm btn-icon"
                          title="Interactive PDF Preview (3 Pages)"
                          style={{ width: '26px', height: '26px', padding: 0, flexShrink: 0 }}
                        >
                          <Eye size={13} />
                        </button>

                        {/* 3. Direct PDF Download */}
                        {hasDownloadRight && (
                          <button
                            onClick={() => handleDirectDownload(q)}
                            className="btn btn-primary btn-sm btn-icon"
                            disabled={isDownloading}
                            title="Direct Download Branded PDF"
                            style={{ width: '26px', height: '26px', padding: 0, flexShrink: 0 }}
                          >
                            {isDownloading ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                          </button>
                        )}

                        {/* 4. Duplicate Quotation */}
                        {hasCreateRight && (
                          <button
                            onClick={() => handleDuplicate(q._id)}
                            className="btn btn-outline btn-sm btn-icon"
                            title="Duplicate as New Draft"
                            style={{ width: '26px', height: '26px', padding: 0, flexShrink: 0 }}
                          >
                            <Copy size={13} />
                          </button>
                        )}

                        {/* 4b. Confirm the booking (the client accepted), or open the booking it already became */}
                        {q.confirmationId ? (
                          can('confirmations', 'canRead') && (
                            <button
                              onClick={() => navigate(`/confirmations/${q.confirmationId}`)}
                              className="btn btn-outline btn-sm btn-icon"
                              title={`Open booking ${q.confirmationNo}`}
                              aria-label={`Open booking ${q.confirmationNo}`}
                              style={{ color: 'var(--fg-059669)', borderColor: 'var(--bd-A7F3D0)', width: '26px', height: '26px', padding: 0, flexShrink: 0 }}
                            >
                              <CheckCircle2 size={13} color="#059669" />
                            </button>
                          )
                        ) : (
                          canModify && can('confirmations', 'canCreate') && !confirmBlockedReason(q) && (
                            <button
                              onClick={() => setConfirmItem(q)}
                              className="btn btn-outline btn-sm btn-icon"
                              title="Confirm booking (the client accepted this quotation)"
                              aria-label={`Confirm booking for ${q.quotationNo}`}
                              style={{ color: 'var(--fg-059669)', borderColor: 'var(--bd-A7F3D0)', width: '26px', height: '26px', padding: 0, flexShrink: 0 }}
                            >
                              <CheckCircle2 size={13} />
                            </button>
                          )
                        )}

                        {/* 5. Edit Quotation */}
                        {q.confirmationId ? (
                          <span title={`Confirmed as ${q.confirmationNo}: locked. Cancel the booking to change it.`} style={{ padding: '4px', color: 'var(--fg-059669)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '26px', height: '26px', flexShrink: 0 }}>
                            <Lock size={13} />
                          </span>
                        ) : canModify ? (
                          <button
                            onClick={() => navigate(`/quotations/${q._id}/edit`)}
                            className="btn btn-outline btn-sm btn-icon"
                            title="Edit Itinerary & Pricing"
                            style={{ width: '26px', height: '26px', padding: 0, flexShrink: 0 }}
                          >
                            <Edit size={13} />
                          </button>
                        ) : (
                          <span title="Locked for Assigned Staff" style={{ padding: '4px', color: 'var(--fg-DC2626)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '26px', height: '26px', flexShrink: 0 }}>
                            <Lock size={13} />
                          </span>
                        )}

                        {/* 6. Delete Quotation */}
                        {can('quotations', 'canDelete') && canModify && !q.confirmationId && (
                          <button
                            onClick={() => setDeleteItem(q)}
                            className="btn btn-danger btn-sm btn-icon"
                            title="Delete Quotation"
                            style={{ width: '26px', height: '26px', padding: 0, flexShrink: 0 }}
                          >
                            <Trash2 size={13} />
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

      {/* Interactive quotation preview modal */}
      {previewQuotation && (
        <QuotationPreviewModal
          isOpen={isPreviewOpen}
          onClose={() => {
            setIsPreviewOpen(false);
            setPreviewQuotation(null);
          }}
          quotation={previewQuotation}
        />
      )}

      {/* Hidden container for 1-click Direct PDF Download */}
      {directDownloadQuote && (
        <div style={{ position: 'fixed', left: '-9999px', top: '-9999px', width: '794px' }}>
          <QuotationDocumentView
            quotation={directDownloadQuote}
            pageNumber={null}
            id="direct-download-render-container"
          />
        </div>
      )}

      {/* Confirm booking dialog */}
      <ConfirmBookingDialog quotation={confirmItem} isOpen={Boolean(confirmItem)} onClose={() => setConfirmItem(null)} onConfirm={handleConfirmBooking} busy={isConfirming} />

      {/* Mark for Follow-up Confirmation Dialog */}
      <ConfirmDialog
        isOpen={Boolean(followUpItem)}
        onClose={() => setFollowUpItem(null)}
        onConfirm={handleFollowUpConfirm}
        title="Mark Quotation for Follow Up"
        message={`Are you sure you want to mark quotation ${followUpItem?.quotationNo} (${followUpItem?.clientName} - ${followUpItem?.destination}) for Follow up?`}
        confirmText={isUpdatingFollowUp ? "Updating..." : "Yes, Mark for Follow up"}
        cancelText="Cancel"
        isDanger={false}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={Boolean(deleteItem)}
        onClose={() => setDeleteItem(null)}
        onConfirm={handleDeleteConfirm}
        title="Delete Quotation"
        message={`Are you sure you want to permanently delete quotation ${deleteItem?.quotationNo} for "${deleteItem?.destination}"?`}
        confirmText="Yes, Delete Quotation"
        cancelText="Cancel"
        isDanger={true}
      />
    </div>
  );
};

export default QuotationListPage;
