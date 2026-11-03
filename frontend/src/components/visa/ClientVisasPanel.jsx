import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Download, Edit2, Eye, FileText, Loader2, Lock, Plus, RefreshCw, Search, Send, Stamp } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import quotationService from '../../services/quotationService';
import { getErrorMessage } from '../../services/api';
import useQuotationFiles from '../../hooks/useQuotationFiles';
import QuotationPreviewModal from '../QuotationPreviewModal';
import ShareQuotationDialog from '../quotation/ShareQuotationDialog';
import StatusBadge from '../StatusBadge';
import { QUOTATION_STATUSES } from '../../config';
import { saveBlob } from '../../utils/download';
import { visaFeeTotal } from '../../utils/visa';
import { formatDate } from '../../utils/dateHelper';
import '../../pages/itineraries.css';
import '../confirmation/confirmation.css';
import './clientVisas.css';

const PAGE_SIZE = 20;

/** What the client pays: the fees of the quotation worked out for its applicants (the saved total when there are no fees to add up). */
export const priceOf = (q) => {
  const fees = visaFeeTotal(q.visaFees, q.visa?.applicants);
  return fees > 0 ? fees : Number(q.pricing?.grandTotal) || 0;
};

/**
 * The visa quotations of the company, found by destination (or country, client, number, phone). Each one can be opened to edit,
 * previewed, downloaded as a PDF or Word file, and sent to the client by WhatsApp or e-mail. Every visa quotation made in the
 * quotation builder appears here by itself: it is the same record, listed by type.
 */
export const ClientVisasPanel = () => {
  const navigate = useNavigate();
  const { user, can, canEditRecord } = useAuth();
  const { showToast } = useToast();
  const files = useQuotationFiles();

  const [searchText, setSearchText] = useState('');
  const [filters, setFilters] = useState({ search: '', status: '' });
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(''); // "<id>:pdf" or "<id>:word"
  const [previewing, setPreviewing] = useState(null);
  const [sharing, setSharing] = useState(null);
  const latest = useRef(0);

  const load = useCallback(async () => {
    const request = ++latest.current;
    setLoading(true);
    setError('');
    try {
      const params = { quotationType: 'Visa' };
      if (filters.search) params.search = filters.search;
      if (filters.status) params.status = filters.status;
      const res = await quotationService.getQuotations(params);
      if (request !== latest.current) return; // a newer search is already on its way
      if (res.success) setRows(res.data || []);
      else setError(res.message || 'The visa quotations could not be loaded.');
    } catch (err) {
      if (request === latest.current) setError(getErrorMessage(err, 'The visa quotations could not be loaded.'));
    } finally {
      if (request === latest.current) setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    load();
  }, [load]);

  // Search as you type, but only ask the server once the typing pauses.
  useEffect(() => {
    const timer = setTimeout(() => setFilters((f) => (f.search === searchText.trim() ? f : { ...f, search: searchText.trim() })), 300);
    return () => clearTimeout(timer);
  }, [searchText]);

  // A different search or status starts again from the first page; waiting on a page changes nothing.
  useEffect(() => {
    setPage(1);
  }, [filters]);

  const hasFilters = Boolean(filters.search || filters.status);
  const clear = () => {
    setSearchText('');
    setFilters({ search: '', status: '' });
  };

  const canDownload = can('quotations', 'canDownload');
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const shown = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const makeFile = async (q, kind) => {
    setBusy(`${q._id}:${kind}`);
    try {
      if (kind === 'pdf') {
        await files.pdf(q, { save: true });
        showToast(`The PDF of ${q.quotationNo} was downloaded.`, 'success');
      } else {
        const made = await files.docx(q);
        saveBlob(made.blob, made.filename);
        showToast(`The Word file of ${q.quotationNo} was downloaded.`, 'success');
      }
    } catch (err) {
      showToast(err?.userMessage || `The ${kind === 'pdf' ? 'PDF' : 'Word file'} could not be prepared. Please try again.`, 'error');
    } finally {
      setBusy('');
    }
  };

  // A number or address kept from the share window is shown in the list at once, and the window knows it is saved.
  const contactSaved = (id, patch) => {
    setRows((list) => list.map((q) => (q._id === id ? { ...q, ...patch } : q)));
    setSharing((current) => (current && current._id === id ? { ...current, ...patch } : current));
  };

  return (
    <div className="cvp">
      <div className="glass-panel itin-filters">
        <div className="itin-search">
          <Search size={16} aria-hidden="true" />
          <input type="search" className="form-input" placeholder="Search destination, country, client, number or phone…" aria-label="Search visa quotations" value={searchText} onChange={(e) => setSearchText(e.target.value)} />
        </div>
        <select className="form-select" aria-label="Status" value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}>
          <option value="">All statuses</option>
          {QUOTATION_STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        {hasFilters && (
          <button type="button" className="btn btn-outline btn-sm" onClick={clear}>Reset filters</button>
        )}
        <span className="count-chip" style={{ marginLeft: 'auto' }}>{rows.length} {rows.length === 1 ? 'visa quotation' : 'visa quotations'}</span>
        <button type="button" className="btn-icon btn-outline" onClick={load} title="Refresh" aria-label="Refresh the list">
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
        </button>
        {can('quotations', 'canCreate') && (
          <button type="button" className="btn btn-primary" onClick={() => navigate('/quotations/new?type=Visa')}>
            <Plus size={16} /> <span>New visa quotation</span>
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
      ) : loading && rows.length === 0 ? (
        <div className="itin-state" aria-busy="true">
          <Loader2 size={26} className="animate-spin" aria-hidden="true" />
          <p>Loading the visa quotations…</p>
        </div>
      ) : rows.length === 0 ? (
        <div className="itin-state">
          <Stamp size={34} aria-hidden="true" />
          {hasFilters ? (
            <>
              <h3>No visa quotations match</h3>
              <p>Try the country or the client&apos;s name, or clear the filters.</p>
              <button type="button" className="btn btn-outline" onClick={clear}>Clear filters</button>
            </>
          ) : (
            <>
              <h3>No visa quotations yet</h3>
              <p>Every visa quotation you make is kept here, so you can find it by destination, change it and send it to the client.</p>
              {can('quotations', 'canCreate') && (
                <button type="button" className="btn btn-primary" onClick={() => navigate('/quotations/new?type=Visa')}>
                  <Plus size={16} /> Make the first visa quotation
                </button>
              )}
            </>
          )}
        </div>
      ) : (
        <div className={`table-container animate-fade-in${loading ? ' is-refreshing' : ''}`} style={{ width: '100%', opacity: loading ? 0.6 : 1 }}>
          <table className="luxury-table table-stack cf-table">
            <thead>
              <tr>
                <th style={{ width: '14%' }}>Quotation</th>
                <th style={{ width: '17%' }}>Client</th>
                <th style={{ width: '21%' }}>Visa</th>
                <th style={{ width: '20%' }}>Trip</th>
                <th style={{ width: '11%' }}>Fees</th>
                <th style={{ width: '17%', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((q) => {
                const locked = Boolean(q.confirmationId);
                const editable = canEditRecord('quotations', q) && !locked;
                const working = busy.startsWith(`${q._id}:`);
                const visaLine = [q.visa?.country, q.visa?.visaType, q.visa?.entryType].filter(Boolean).join(' · ');
                const trip = [q.duration, q.travelDate ? `Travel ${formatDate(q.travelDate)}` : ''].filter(Boolean);
                return (
                  <tr key={q._id} className="table-row-hover" aria-busy={working}>
                    <td data-label="Quotation">
                      <div className="cf-no">{q.quotationNo}</div>
                      <div style={{ marginTop: 4 }}><StatusBadge status={q.status || 'Draft'} /></div>
                      <div className="cf-sub">{formatDate(q.createdAt)}</div>
                    </td>
                    <td data-label="Client">
                      <div style={{ fontWeight: 600 }}>{q.clientName || 'No client name'}</div>
                      <div className="cf-sub">{q.clientPhone || 'No WhatsApp number yet'}</div>
                      {q.clientEmail && <div className="cf-sub">{q.clientEmail}</div>}
                    </td>
                    <td data-label="Visa">
                      <div style={{ fontWeight: 700, whiteSpace: 'normal' }}>{q.destination || visaLine || 'Visa'}</div>
                      <div className="cf-sub">{visaLine || 'Visa details not set'}</div>
                    </td>
                    <td data-label="Trip">
                      <div style={{ fontWeight: 600 }}>{trip.length ? trip.join(' · ') : '–'}</div>
                      <div className="cf-sub">{q.paxDetails || 'Guests not set'}</div>
                    </td>
                    <td data-label="Fees">
                      <div style={{ fontWeight: 700 }}>{priceOf(q) > 0 ? `Rs ${priceOf(q).toLocaleString('en-IN')}` : 'On request'}</div>
                      <div className="cf-sub">{Math.max(1, Number(q.visa?.applicants) || 1)} applicant{Math.max(1, Number(q.visa?.applicants) || 1) === 1 ? '' : 's'}</div>
                    </td>
                    <td data-label="">
                      <div className="cf-actions">
                        <button type="button" className="btn-icon btn-outline" onClick={() => setPreviewing(q)} title="Preview the quotation" aria-label={`Preview ${q.quotationNo}`}>
                          <Eye size={14} />
                        </button>
                        {canDownload && (
                          <>
                            <button type="button" className="btn-icon btn-outline" onClick={() => makeFile(q, 'pdf')} disabled={Boolean(busy) || files.working} title="Download as PDF" aria-label={`Download the PDF of ${q.quotationNo}`}>
                              {busy === `${q._id}:pdf` ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                            </button>
                            <button type="button" className="btn-icon btn-outline" onClick={() => makeFile(q, 'word')} disabled={Boolean(busy) || files.working} title="Download as a Word file you can edit" aria-label={`Download the Word file of ${q.quotationNo}`}>
                              {busy === `${q._id}:word` ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
                            </button>
                            <button type="button" className="btn btn-primary btn-sm" onClick={() => setSharing(q)} aria-label={`Send ${q.quotationNo} to the client`} title="Send to the client by WhatsApp or e-mail">
                              <Send size={13} /> Send
                            </button>
                          </>
                        )}
                        {locked ? (
                          <span className="cf-lock" title={`Confirmed as ${q.confirmationNo}: locked. Cancel the booking to change it.`} aria-label={`${q.quotationNo} is confirmed and locked`}>
                            <Lock size={14} />
                          </span>
                        ) : (
                          <button type="button" className="btn btn-outline btn-sm" onClick={() => navigate(`/quotations/${q._id}/edit`)} disabled={!editable} title={editable ? 'Open it to change it' : 'You can open it, but it is assigned to someone else'} aria-label={`${editable ? 'Edit' : 'Open'} ${q.quotationNo}`}>
                            <Edit2 size={13} /> {editable ? 'Edit' : 'Open'}
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
          <button type="button" className="btn btn-outline btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            <ChevronLeft size={14} /> Previous
          </button>
          <span>Page {page} of {pages}</span>
          <button type="button" className="btn btn-outline btn-sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
            Next <ChevronRight size={14} />
          </button>
        </nav>
      )}

      {previewing && <QuotationPreviewModal isOpen onClose={() => setPreviewing(null)} quotation={previewing} canDownload={canDownload} onShare={(q) => { setPreviewing(null); setSharing(q); }} />}
      {sharing && (
        <ShareQuotationDialog
          quotation={sharing}
          isOpen
          onClose={() => setSharing(null)}
          canEdit={canEditRecord('quotations', sharing) && !sharing.confirmationId}
          onContactSaved={(patch) => contactSaved(sharing._id, patch)}
          senderName={user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : ''}
        />
      )}
      {files.host}
    </div>
  );
};

export default ClientVisasPanel;
