import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, ChevronLeft, ChevronRight, Edit2, Eye, FileText, Loader2, Lock, RefreshCw, Search, Send, Trash2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import confirmationService from '../services/confirmationService';
import { getErrorMessage } from '../services/api';
import ConfirmationPreview from '../components/confirmation/ConfirmationPreview';
import ShareConfirmationDialog from '../components/confirmation/ShareConfirmationDialog';
import ConfirmDialog from '../components/ConfirmDialog';
import { formatDate } from '../utils/dateHelper';
import './itineraries.css';
import '../components/confirmation/confirmation.css';

const STATUS_TABS = [
  { value: 'all', label: 'All' },
  { value: 'Confirmed', label: 'Confirmed' },
  { value: 'Cancelled', label: 'Cancelled' }
];
const PAGE_SIZE = 20;
const NO_FILTERS = { search: '', status: 'all', page: 1 };
const money = (n) => `₹${(Number(n) || 0).toLocaleString('en-IN')}`;

export const ConfirmationListPage = () => {
  const navigate = useNavigate();
  const { user, can, canEditRecord } = useAuth();
  const { showToast } = useToast();

  const [filters, setFilters] = useState(NO_FILTERS);
  const [searchText, setSearchText] = useState('');
  const [result, setResult] = useState({ data: [], total: 0, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [previewing, setPreviewing] = useState(null); // the full record being previewed
  const [openingId, setOpeningId] = useState('');
  const [sharing, setSharing] = useState(null); // the booking being sent to the client
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const latestRequest = useRef(0);

  const load = useCallback(async () => {
    const request = ++latestRequest.current;
    setLoading(true);
    setError('');
    try {
      const params = { ...filters, limit: PAGE_SIZE };
      if (!params.search) delete params.search;
      const res = await confirmationService.list(params);
      if (request !== latestRequest.current) return; // a newer search is already on its way
      if (res.success) setResult(res);
      else setError(res.message || 'The confirmations could not be loaded.');
    } catch (err) {
      if (request === latestRequest.current) setError(getErrorMessage(err, 'The confirmations could not be loaded.'));
    } finally {
      if (request === latestRequest.current) setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    load();
  }, [load]);

  // Search as you type, but only ask the server once the typing pauses.
  useEffect(() => {
    const timer = setTimeout(() => setFilters((f) => (f.search === searchText.trim() ? f : { ...f, search: searchText.trim(), page: 1 })), 300);
    return () => clearTimeout(timer);
  }, [searchText]);

  const setFilter = (patch) => setFilters((f) => ({ ...f, ...patch, page: 1 }));
  const clearFilters = () => {
    setSearchText('');
    setFilters(NO_FILTERS);
  };
  const hasFilters = Boolean(filters.search || filters.status !== 'all');

  // The list carries only what it shows; the preview needs the whole record (the copy of the quotation).
  const openPreview = async (item) => {
    setOpeningId(item._id);
    try {
      const res = await confirmationService.get(item._id);
      if (res.success) setPreviewing(res.data);
      else showToast(res.message || 'The confirmation could not be opened.', 'error');
    } catch (err) {
      showToast(getErrorMessage(err, 'The confirmation could not be opened.'), 'error');
    } finally {
      setOpeningId('');
    }
  };

  // A number or address kept from the Send window is shown in the list at once, and the window holds the new version of the booking.
  const contactKept = (id, patch, updated) => {
    const merged = { ...patch, ...(updated?.updatedAt ? { updatedAt: updated.updatedAt } : {}) };
    setResult((r) => ({ ...r, data: r.data.map((x) => (x._id === id ? { ...x, ...merged } : x)) }));
    setSharing((current) => (current && current._id === id ? { ...current, ...merged } : current));
  };

  const confirmDelete = async () => {
    const item = toDelete;
    setDeleting(true);
    try {
      const res = await confirmationService.delete(item._id);
      if (res.success) {
        showToast(res.message || `${item.confirmationNo} was deleted.`, 'success');
        setToDelete(null);
        load();
      } else {
        showToast(res.message || 'The booking could not be deleted.', 'error');
      }
    } catch (err) {
      showToast(getErrorMessage(err, 'The booking could not be deleted.'), 'error');
    } finally {
      setDeleting(false);
    }
  };

  const { data, total, pages } = result;

  return (
    <div className="itin-page">
      <div className="page-header animate-fade-in">
        <div className="page-header-text">
          <div className="page-title-row">
            <h2 className="page-title">Confirmations</h2>
            <span className="count-chip">{total} {total === 1 ? 'booking' : 'bookings'}</span>
          </div>
          <p className="page-subtitle">Quotations the client accepted, kept as bookings with their travellers, payments and notes. To confirm one, use the tick on its row in Quotations.</p>
        </div>
        <div className="page-actions">
          {can('quotations', 'canRead') && (
            <button type="button" className="btn btn-outline" onClick={() => navigate('/quotations')}>
              <FileText size={15} /> <span>Go to quotations</span>
            </button>
          )}
          <button type="button" className="btn-icon btn-outline" onClick={load} title="Refresh" aria-label="Refresh the list">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="glass-panel itin-filters">
        <div className="itin-search">
          <Search size={16} aria-hidden="true" />
          <input type="search" className="form-input" placeholder="Search booking no., client, destination or traveller…" aria-label="Search confirmations" value={searchText} onChange={(e) => setSearchText(e.target.value)} />
        </div>
        <div className="itin-tabs" role="tablist" aria-label="Status">
          {STATUS_TABS.map((tab) => (
            <button key={tab.value} type="button" role="tab" aria-selected={filters.status === tab.value} className={filters.status === tab.value ? 'is-active' : ''} onClick={() => setFilter({ status: tab.value })}>
              {tab.label}
            </button>
          ))}
        </div>
        {hasFilters && (
          <button type="button" className="btn btn-outline btn-sm" onClick={clearFilters}>
            Reset filters
          </button>
        )}
      </div>

      {error ? (
        <div className="itin-state" role="alert">
          <p>{error}</p>
          <button type="button" className="btn btn-outline" onClick={load}>
            <RefreshCw size={14} /> Try again
          </button>
        </div>
      ) : loading && data.length === 0 ? (
        <div className="itin-state" aria-busy="true">
          <Loader2 size={26} className="animate-spin" aria-hidden="true" />
          <p>Loading the bookings…</p>
        </div>
      ) : data.length === 0 ? (
        <div className="itin-state">
          <CheckCircle2 size={34} aria-hidden="true" />
          {hasFilters ? (
            <>
              <h3>No bookings match</h3>
              <p>Try a different word, or clear the filters.</p>
              <button type="button" className="btn btn-outline" onClick={clearFilters}>
                Clear filters
              </button>
            </>
          ) : (
            <>
              <h3>No confirmed bookings yet</h3>
              <p>When a client accepts a quotation, open Quotations and press the tick on its row. It becomes a booking here, ready for travellers and payments.</p>
              {can('quotations', 'canRead') && (
                <button type="button" className="btn btn-primary" onClick={() => navigate('/quotations')}>
                  <FileText size={15} /> Go to quotations
                </button>
              )}
            </>
          )}
        </div>
      ) : (
        <div className="table-container animate-fade-in" style={{ width: '100%', opacity: loading ? 0.6 : 1 }}>
          <table className="luxury-table table-stack cf-table">
            <thead>
              <tr>
                <th style={{ width: '14%' }}>Booking</th>
                <th style={{ width: '17%' }}>Client &amp; guests</th>
                <th style={{ width: '19%' }}>Destination &amp; travel date</th>
                <th style={{ width: '16%' }}>Payment</th>
                <th style={{ width: '10%' }}>Status</th>
                <th style={{ width: '24%', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.map((item) => {
                const editable = canEditRecord('confirmations', item);
                const owing = item.balance > 0;
                return (
                  <tr key={item._id} className="table-row-hover">
                    <td data-label="Booking">
                      <div className="cf-no">{item.confirmationNo}</div>
                      <div className="cf-sub">From {item.quotationNo}{item.optionName ? ` · ${item.optionName}` : ''}</div>
                    </td>
                    <td data-label="Client">
                      <div style={{ fontWeight: 700 }}>{item.clientName}</div>
                      <div className="cf-sub">
                        {[item.paxDetails, item.travellers?.length ? `${item.travellers.length} named` : ''].filter(Boolean).join(' · ')}
                      </div>
                    </td>
                    <td data-label="Destination">
                      <div style={{ fontWeight: 600 }}>{item.destination}</div>
                      <div className="cf-sub">{[item.duration, item.travelDate ? formatDate(item.travelDate) : 'Travel date not set'].filter(Boolean).join(' · ')}</div>
                    </td>
                    <td data-label="Payment">
                      <div style={{ fontWeight: 700 }}>{money(item.payment?.totalAmount)}</div>
                      <div className={`cf-sub ${owing ? 'cf-owing' : 'cf-clear'}`}>
                        {item.status === 'Cancelled' ? `${money(item.payment?.received)} received` : owing ? `${money(item.balance)} to pay` : (item.payment?.totalAmount || 0) > 0 ? 'Fully paid' : 'No amount due'}
                      </div>
                    </td>
                    <td data-label="Status">
                      <span className={`cf-badge ${item.status === 'Cancelled' ? 'is-cancelled' : 'is-confirmed'}`}>{item.status}</span>
                    </td>
                    <td data-label="">
                      <div className="cf-actions">
                        <button type="button" className="btn btn-outline btn-sm" onClick={() => navigate(`/confirmations/${item._id}`)}>
                          {editable && item.status === 'Confirmed' ? <Edit2 size={13} /> : item.status === 'Confirmed' ? <Lock size={13} /> : <Eye size={13} />} {editable && item.status === 'Confirmed' ? 'Open' : 'View'}
                        </button>
                        <button type="button" className="btn btn-outline-azure btn-sm btn-icon" onClick={() => openPreview(item)} disabled={openingId === item._id} title="Preview and download the confirmation" aria-label={`Preview ${item.confirmationNo}`}>
                          {openingId === item._id ? <Loader2 size={13} className="animate-spin" /> : <Eye size={13} />}
                        </button>
                        {item.status === 'Confirmed' && can('confirmations', 'canDownload') && (
                          <button type="button" className="btn btn-primary btn-sm" onClick={() => setSharing(item)} title="Send the confirmation to the client by WhatsApp or e-mail" aria-label={`Send ${item.confirmationNo} to the client`}>
                            <Send size={13} /> Send
                          </button>
                        )}
                        {can('confirmations', 'canDelete') && (
                          <button type="button" className="btn-icon btn-outline itin-danger" onClick={() => setToDelete(item)} title="Delete this booking" aria-label={`Delete ${item.confirmationNo}`}>
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <nav className="itin-pager" aria-label="Pages">
          <button type="button" className="btn btn-outline btn-sm" disabled={filters.page <= 1 || loading} onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}>
            <ChevronLeft size={14} /> Previous
          </button>
          <span>Page {filters.page} of {pages}</span>
          <button type="button" className="btn btn-outline btn-sm" disabled={filters.page >= pages || loading} onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}>
            Next <ChevronRight size={14} />
          </button>
        </nav>
      )}

      <ConfirmationPreview confirmation={previewing} isOpen={Boolean(previewing)} onClose={() => setPreviewing(null)} />
      <ConfirmDialog isOpen={Boolean(toDelete)} onClose={() => setToDelete(null)} onConfirm={confirmDelete} isDanger isLoading={deleting} title="Delete this booking?" message={`"${toDelete?.confirmationNo || ''}" will be permanently deleted. The linked quotation will be unlocked and can be edited again.`} confirmText="Delete" />
      {sharing && (
        <ShareConfirmationDialog
          confirmation={sharing}
          isOpen
          onClose={() => setSharing(null)}
          canEdit={canEditRecord('confirmations', sharing) && can('confirmations', 'canUpdate')}
          onContactSaved={(patch, updated) => contactKept(sharing._id, patch, updated)}
          senderName={user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : ''}
          senderNumber={user?.senderNumber || ''}
        />
      )}
    </div>
  );
};

export default ConfirmationListPage;
