import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Archive, ArchiveRestore, ChevronLeft, ChevronRight, Edit2, Eye, FileText, Loader2, Lock, Plus, RefreshCw, Search, Stamp, Trash2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import visaService from '../services/visaService';
import { getErrorMessage } from '../services/api';
import ConfirmDialog from '../components/ConfirmDialog';
import { feeSummary } from '../utils/visaList';
import { formatDate } from '../utils/dateHelper';
import './itineraries.css';
import '../components/confirmation/confirmation.css';

const STATUS_TABS = [
  { value: 'Active', label: 'Active' },
  { value: 'Archived', label: 'Archived' },
  { value: 'all', label: 'All' }
];
const PAGE_SIZE = 20;
const NO_FILTERS = { search: '', status: 'Active', page: 1 };

export const VisaListPage = () => {
  const navigate = useNavigate();
  const { can, canEditRecord } = useAuth();
  const { showToast } = useToast();

  const [filters, setFilters] = useState(NO_FILTERS);
  const [searchText, setSearchText] = useState('');
  const [result, setResult] = useState({ data: [], total: 0, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [toDelete, setToDelete] = useState(null);
  const latestRequest = useRef(0);

  const load = useCallback(async () => {
    const request = ++latestRequest.current;
    setLoading(true);
    setError('');
    try {
      const params = { ...filters, limit: PAGE_SIZE };
      if (!params.search) delete params.search;
      const res = await visaService.list(params);
      if (request !== latestRequest.current) return; // a newer search is already on its way
      if (res.success) setResult(res);
      else setError(res.message || 'The visa list could not be loaded.');
    } catch (err) {
      if (request === latestRequest.current) setError(getErrorMessage(err, 'The visa list could not be loaded.'));
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
  const hasFilters = Boolean(filters.search || filters.status !== 'Active');
  const label = (v) => [v.country, v.visaType].filter(Boolean).join(' · ');

  const run = async (item, action, success, failure) => {
    try {
      setBusyId(item._id);
      const res = await action();
      if (res.success) {
        showToast(success, 'success');
        await load();
        return res;
      }
      showToast(res.message || failure, 'error');
    } catch (err) {
      showToast(getErrorMessage(err, failure), 'error');
    } finally {
      setBusyId('');
    }
    return null;
  };

  const toggleArchive = (item) =>
    run(item, () => visaService.update(item._id, { status: item.status === 'Archived' ? 'Active' : 'Archived' }), item.status === 'Archived' ? `${label(item)} is active again.` : `${label(item)} was archived. It stays saved and can be restored.`, 'The visa could not be updated.');
  const confirmDelete = async () => {
    const item = toDelete;
    await run(item, () => visaService.remove(item._id), `${label(item)} was deleted.`, 'The visa could not be deleted.');
    setToDelete(null);
  };

  const { data, total, pages } = result;

  return (
    <div className="itin-page">
      <div className="page-header animate-fade-in">
        <div className="page-header-text">
          <div className="page-title-row">
            <h2 className="page-title">Visa List</h2>
            <span className="count-chip">{total} {total === 1 ? 'visa' : 'visas'}</span>
          </div>
          <p className="page-subtitle">Every visa you handle, saved once with its documents checklist and usual fees, and ready to use in visa quotations.</p>
        </div>
        <div className="page-actions">
          {can('visas', 'canCreate') ? (
            <button type="button" className="btn btn-primary" onClick={() => navigate('/visas/new')}>
              <Plus size={16} /> <span>Add visa</span>
            </button>
          ) : (
            <button type="button" className="btn btn-outline" disabled title="You do not have permission to add visas">
              <Lock size={14} /> <span>Adding locked</span>
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
          <input type="search" className="form-input" placeholder="Search country, visa type or entry…" aria-label="Search visas" value={searchText} onChange={(e) => setSearchText(e.target.value)} />
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
          <p>Loading the visa list…</p>
        </div>
      ) : data.length === 0 ? (
        <div className="itin-state">
          <Stamp size={34} aria-hidden="true" />
          {hasFilters ? (
            <>
              <h3>No visas match</h3>
              <p>Try a different word, or clear the filters.</p>
              <button type="button" className="btn btn-outline" onClick={clearFilters}>
                Clear filters
              </button>
            </>
          ) : (
            <>
              <h3>No visas yet</h3>
              <p>Add a visa once, with its documents checklist and usual fees, and pick it in any visa quotation instead of typing it again.</p>
              {can('visas', 'canCreate') && (
                <button type="button" className="btn btn-primary" onClick={() => navigate('/visas/new')}>
                  <Plus size={16} /> Add the first visa
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
                <th style={{ width: '24%' }}>Visa</th>
                <th style={{ width: '24%' }}>Details</th>
                <th style={{ width: '20%' }}>Usual fees</th>
                <th style={{ width: '10%' }}>Checklist</th>
                <th style={{ width: '22%', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.map((item) => {
                const editable = canEditRecord('visas', item);
                const busy = busyId === item._id;
                return (
                  <tr key={item._id} className="table-row-hover" aria-busy={busy}>
                    <td data-label="Visa">
                      <div className="cf-no" style={{ whiteSpace: 'normal' }}>{item.country}</div>
                      <div className="cf-sub">{[item.visaType, item.entryType].filter(Boolean).join(' · ') || 'Type not set'}</div>
                      {item.status === 'Archived' && <span className="cf-badge is-cancelled" style={{ marginTop: 4 }}>Archived</span>}
                    </td>
                    <td data-label="Details">
                      <div style={{ fontWeight: 600 }}>{[item.mode, item.processingTime].filter(Boolean).join(' · ') || '–'}</div>
                      <div className="cf-sub">{[item.validity && `Valid ${item.validity}`, item.stay && `Stay ${item.stay}`].filter(Boolean).join(' · ') || 'Validity not set'}</div>
                    </td>
                    <td data-label="Usual fees">
                      <div style={{ fontWeight: 700 }}>{feeSummary(item.fees)}</div>
                      <div className="cf-sub">Updated {formatDate(item.updatedAt)}{item.updatedByName ? ` by ${item.updatedByName}` : ''}</div>
                    </td>
                    <td data-label="Checklist">{item.documentCount} {item.documentCount === 1 ? 'document' : 'documents'}</td>
                    <td data-label="">
                      <div className="cf-actions">
                        <button type="button" className="btn btn-outline btn-sm" onClick={() => navigate(`/visas/${item._id}/edit`)}>
                          {editable ? <Edit2 size={13} /> : <Eye size={13} />} {editable ? 'Edit' : 'View'}
                        </button>
                        {item.status === 'Active' && can('quotations', 'canCreate') && (
                          <button type="button" className="btn-icon btn-outline" onClick={() => navigate(`/quotations/new?visaId=${item._id}`)} title="Create a visa quotation from this visa" aria-label={`Create quotation for ${label(item)}`}>
                            <FileText size={14} />
                          </button>
                        )}
                        {editable && (
                          <button type="button" className="btn-icon btn-outline" onClick={() => toggleArchive(item)} disabled={busy} title={item.status === 'Archived' ? 'Restore' : 'Archive'} aria-label={`${item.status === 'Archived' ? 'Restore' : 'Archive'} ${label(item)}`}>
                            {item.status === 'Archived' ? <ArchiveRestore size={14} /> : <Archive size={14} />}
                          </button>
                        )}
                        {can('visas', 'canDelete') && editable && (
                          <button type="button" className="btn-icon btn-outline itin-danger" onClick={() => setToDelete(item)} disabled={busy} title="Delete" aria-label={`Delete ${label(item)}`}>
                            <Trash2 size={14} />
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

      <ConfirmDialog
        isOpen={Boolean(toDelete)}
        onClose={() => setToDelete(null)}
        onConfirm={confirmDelete}
        isDanger
        isLoading={Boolean(busyId)}
        title="Delete this visa?"
        message={`"${toDelete ? label(toDelete) : ''}" will disappear from the visa list. Quotations that already used it keep their own copy. If you only want it out of the way, archive it instead.`}
        confirmText="Delete visa"
      />
    </div>
  );
};

export default VisaListPage;
