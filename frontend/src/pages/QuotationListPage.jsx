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
import StatusBadge from '../components/StatusBadge';
import ConfirmDialog from '../components/ConfirmDialog';
import ExportButton from '../components/ExportButton';
import QuotationPreviewModal from '../components/QuotationPreviewModal';
import QuotationDocumentView from '../components/QuotationDocumentView';
import { generateQuotationPDF } from '../utils/quotationPdfGenerator';
import { formatDate } from '../utils/dateHelper';
import { QUOTATION_STATUS_TABS } from '../config';

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
      showToast('Error loading quotations: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQuotations();
  }, []);

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
      showToast('Failed to duplicate quotation: ' + err.message, 'error');
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
      showToast('Failed to update status: ' + err.message, 'error');
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
      showToast('Failed to delete quotation: ' + err.message, 'error');
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
      showToast('Failed to download PDF: ' + err.message, 'error');
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
      <div
        className="glass-panel-azure animate-fade-in"
        style={{
          borderRadius: '16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '16px'
        }}
      >
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>
            Quotations & Proposals
          </h1>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
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
              background: '#e0f2fe',
              border: '1px solid #bae6fd',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#00a6f4'
            }}
          >
            <FileText size={22} />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: '#64748B', textTransform: 'uppercase', fontWeight: 600 }}>
              Total Quotations
            </div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0F172A', marginTop: '2px', fontFamily: 'var(--font-headline)' }}>
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
              background: '#DCFCE7',
              border: '1px solid #BBF7D0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#15803D'
            }}
          >
            <CheckCircle2 size={22} />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: '#64748B', textTransform: 'uppercase', fontWeight: 600 }}>
              Confirmed Quotes
            </div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#15803D', marginTop: '2px', fontFamily: 'var(--font-headline)' }}>
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
              background: '#EFF6FF',
              border: '1px solid #BFDBFE',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#2563EB'
            }}
          >
            <DollarSign size={22} />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: '#64748B', textTransform: 'uppercase', fontWeight: 600 }}>
              Quoted Pipeline
            </div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#2563EB', marginTop: '2px', fontFamily: 'var(--font-headline)' }}>
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
              background: '#FEF3C7',
              border: '1px solid #FDE68A',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#D97706'
            }}
          >
            <Clock size={22} />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: '#64748B', textTransform: 'uppercase', fontWeight: 600 }}>
              Drafts / In-Flight
            </div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#D97706', marginTop: '2px', fontFamily: 'var(--font-headline)' }}>
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          {STATUS_TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setStatusFilter(tab)}
              style={{
                padding: '7px 14px',
                borderRadius: '8px',
                border: statusFilter === tab ? '1px solid #2563EB' : '1px solid #E2E8F0',
                fontSize: '0.8rem',
                fontWeight: statusFilter === tab ? 700 : 600,
                background: statusFilter === tab ? '#2563EB' : '#FFFFFF',
                color: statusFilter === tab ? '#FFFFFF' : '#475569',
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
        <div style={{ position: 'relative', minWidth: '260px', maxWidth: '380px', flex: 1 }}>
          <Search
            size={16}
            style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }}
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
      <div className="table-container animate-fade-in" style={{ width: '100%', overflowX: 'hidden' }}>
        <table className="luxury-table" style={{ width: '100%' }}>
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
                <td colSpan={8} style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
                  <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto 8px auto', color: '#0ea5e9' }} />
                  <div>Loading luxury quotations...</div>
                </td>
              </tr>
            ) : filteredQuotations.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
                  <FileText size={32} style={{ margin: '0 auto 10px auto', opacity: 0.4 }} />
                  <div style={{ fontSize: '1rem', fontWeight: 600, color: '#0f172a' }}>No quotations found</div>
                  <div style={{ fontSize: '0.825rem', marginTop: '4px', color: '#64748b' }}>
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
                    <td>
                      <div style={{ fontWeight: 700, color: '#0284c7', fontSize: '0.825rem', whiteSpace: 'nowrap' }}>
                        {q.quotationNo}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px', flexWrap: 'wrap' }}>
                        <span
                          style={{
                            fontSize: '0.65rem',
                            fontWeight: 700,
                            padding: '1px 5px',
                            borderRadius: '3px',
                            backgroundColor: q.quotationType === 'Only Hotel' ? '#ecfdf5' : (q.quotationType === 'Events / Corporate' ? '#fdf4ff' : '#e0f2fe'),
                            color: q.quotationType === 'Only Hotel' ? '#047857' : (q.quotationType === 'Events / Corporate' ? '#a21caf' : '#0369a1'),
                            border: '1px solid currentColor',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          {q.quotationType || 'Package'}
                        </span>
                        <span style={{ fontSize: '0.68rem', color: '#64748b', whiteSpace: 'nowrap' }}>
                          {new Date(q.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </td>

                    {/* Client & Pax */}
                    <td>
                      <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.825rem', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {q.clientName}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px', whiteSpace: 'nowrap' }}>
                        <Users size={11} style={{ flexShrink: 0 }} /> <span>{q.paxDetails || ''}</span>
                      </div>
                    </td>

                    {/* Destination & Duration */}
                    <td>
                      <div style={{ fontWeight: 700, color: '#00a6f4', fontSize: '0.825rem', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {q.destination}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '2px', whiteSpace: 'nowrap' }}>
                        {q.duration || ''}
                      </div>
                    </td>

                    {/* Travel Date */}
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: '#334155', whiteSpace: 'nowrap' }}>
                        <Calendar size={12} color="#00a6f4" style={{ flexShrink: 0 }} />
                        <span>{q.travelDate ? formatDate(q.travelDate) : 'Not specified'}</span>
                      </div>
                    </td>

                    {/* Pricing */}
                    <td>
                      <div style={{ fontWeight: 700, color: '#059669', fontSize: '0.825rem', whiteSpace: 'nowrap' }}>
                        ₹{(q.pricing?.totalCostPerPerson || 0).toLocaleString('en-IN')}
                      </div>
                      <div style={{ fontSize: '0.68rem', color: '#64748b', whiteSpace: 'nowrap' }}>
                        {q.pricing?.grandTotal ? `Total: ₹${q.pricing.grandTotal.toLocaleString('en-IN')}` : 'Incl. GST'}
                      </div>
                    </td>

                    {/* Assigned Team */}
                    <td>
                      <div style={{ fontSize: '0.75rem', color: '#0f172a', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        <span style={{ color: '#64748b' }}>Sales:</span> {q.sales || 'Unassigned'}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        <span style={{ color: '#64748b' }}>Ops:</span> {q.ops || 'Unassigned'}
                      </div>
                    </td>

                    {/* Status */}
                    <td>
                      <StatusBadge status={q.status || 'Draft'} />
                    </td>

                    {/* Actions */}
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px', flexWrap: 'nowrap' }}>
                        {/* 1. Follow-up Button */}
                        {canModify && (
                          <button
                            onClick={() => setFollowUpItem(q)}
                            className="btn btn-outline btn-sm btn-icon"
                            title="Mark for Follow up"
                            style={{ color: '#EA580C', borderColor: '#FED7AA', width: '26px', height: '26px', padding: 0, flexShrink: 0 }}
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

                        {/* 5. Edit Quotation */}
                        {canModify ? (
                          <button
                            onClick={() => navigate(`/quotations/${q._id}/edit`)}
                            className="btn btn-outline btn-sm btn-icon"
                            title="Edit Itinerary & Pricing"
                            style={{ width: '26px', height: '26px', padding: 0, flexShrink: 0 }}
                          >
                            <Edit size={13} />
                          </button>
                        ) : (
                          <span title="Locked for Assigned Staff" style={{ padding: '4px', color: '#DC2626', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '26px', height: '26px', flexShrink: 0 }}>
                            <Lock size={13} />
                          </span>
                        )}

                        {/* 6. Delete Quotation */}
                        {can('quotations', 'canDelete') && canModify && (
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
