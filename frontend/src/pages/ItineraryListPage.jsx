import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Archive, ArchiveRestore, ChevronLeft, ChevronRight, Copy, Edit2, Eye, ImageOff, Images, Lock, MapPin, Moon, Plus, RefreshCw, Search, Trash2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import itineraryService from '../services/itineraryService';
import { mediaUrl } from '../services/mediaService';
import { getErrorMessage } from '../services/api';
import ConfirmDialog from '../components/ConfirmDialog';
import ItineraryExportButtons from '../components/itinerary/ItineraryExportButtons';
import { formatDuration } from '../utils/itinerary';
import { formatDate } from '../utils/dateHelper';
import './itineraries.css';

const STATUS_TABS = [
  { value: 'Active', label: 'Active' },
  { value: 'Archived', label: 'Archived' },
  { value: 'all', label: 'All' }
];
const SORTS = [
  { value: 'updated', label: 'Recently updated' },
  { value: 'title', label: 'Title A–Z' },
  { value: 'destination', label: 'Destination A–Z' }
];
const PAGE_SIZE = 12;

export const ItineraryListPage = () => {
  const navigate = useNavigate();
  const { can, canEditRecord } = useAuth();
  const { showToast } = useToast();

  const [filters, setFilters] = useState({ search: '', destination: '', status: 'Active', sort: 'updated', page: 1 });
  const [searchText, setSearchText] = useState('');
  const [result, setResult] = useState({ data: [], total: 0, pages: 1 });
  const [destinations, setDestinations] = useState([]);
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
      if (!params.destination) delete params.destination;
      const res = await itineraryService.list(params);
      if (request !== latestRequest.current) return; // a newer search is already on its way
      if (res.success) setResult(res);
      else setError(res.message || 'The itineraries could not be loaded.');
    } catch (err) {
      if (request === latestRequest.current) setError(getErrorMessage(err, 'The itineraries could not be loaded.'));
    } finally {
      if (request === latestRequest.current) setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    itineraryService.destinations().then((res) => res.success && setDestinations(res.data)).catch(() => {});
  }, []);

  // Search as you type, but only ask the server once the typing pauses.
  useEffect(() => {
    const timer = setTimeout(() => setFilters((f) => (f.search === searchText.trim() ? f : { ...f, search: searchText.trim(), page: 1 })), 300);
    return () => clearTimeout(timer);
  }, [searchText]);

  const setFilter = (patch) => setFilters((f) => ({ ...f, ...patch, page: 1 }));
  const clearFilters = () => {
    setSearchText('');
    setFilters({ search: '', destination: '', status: 'Active', sort: 'updated', page: 1 });
  };
  const hasFilters = Boolean(filters.search || filters.destination || filters.status !== 'Active');

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

  // The list only carries a summary; a download needs the whole itinerary.
  const loadForExport = async (id) => {
    const res = await itineraryService.get(id);
    if (!res.success) throw new Error(res.message || 'The itinerary could not be loaded.');
    return res.data;
  };
  const duplicate = (item) => run(item, () => itineraryService.duplicate(item._id), 'A copy was created. You can find it at the top of the list.', 'The itinerary could not be copied.');
  const toggleArchive = (item) =>
    run(
      item,
      () => itineraryService.update(item._id, { status: item.status === 'Archived' ? 'Active' : 'Archived' }),
      item.status === 'Archived' ? 'The itinerary is active again.' : 'The itinerary was archived. It stays saved and can be restored.',
      'The itinerary could not be updated.'
    );
  const confirmDelete = async () => {
    const item = toDelete;
    await run(item, () => itineraryService.remove(item._id), 'The itinerary was deleted.', 'The itinerary could not be deleted.');
    setToDelete(null);
  };

  const { data, total, pages } = result;

  return (
    <div className="itin-page">
      <div className="page-header animate-fade-in">
        <div className="page-header-text">
          <div className="page-title-row">
            <h2 className="page-title">Itinerary Library</h2>
            <span className="count-chip">{total} {total === 1 ? 'itinerary' : 'itineraries'}</span>
          </div>
          <p className="page-subtitle">Day-by-day plans with photos, saved once and reused in quotations. Download any of them as Word or PDF.</p>
        </div>
        <div className="page-actions">
          {can('itineraries', 'canCreate') ? (
            <button type="button" className="btn btn-primary" onClick={() => navigate('/itineraries/new')}>
              <Plus size={16} /> <span>New itinerary</span>
            </button>
          ) : (
            <button type="button" className="btn btn-outline" disabled title="You do not have permission to create itineraries">
              <Lock size={14} /> <span>Creation locked</span>
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
          <input
            type="search"
            className="form-input"
            placeholder="Search by title, destination, country or tag…"
            aria-label="Search itineraries"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
        </div>
        <select className="form-select" aria-label="Filter by destination" value={filters.destination} onChange={(e) => setFilter({ destination: e.target.value })}>
          <option value="">All destinations</option>
          {destinations.map((d) => (
            <option key={d.destination} value={d.destination}>
              {d.destination} ({d.count})
            </option>
          ))}
        </select>
        <select className="form-select" aria-label="Sort" value={filters.sort} onChange={(e) => setFilter({ sort: e.target.value })}>
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
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
        <div className="itin-grid" aria-busy="true" aria-label="Loading itineraries">
          {Array.from({ length: 6 }, (_, i) => (
            <div className="itin-card itin-skeleton" key={i} />
          ))}
        </div>
      ) : data.length === 0 ? (
        <div className="itin-state">
          <MapPin size={34} aria-hidden="true" />
          {hasFilters ? (
            <>
              <h3>No itineraries match</h3>
              <p>Try a different word, or clear the filters.</p>
              <button type="button" className="btn btn-outline" onClick={clearFilters}>
                Clear filters
              </button>
            </>
          ) : (
            <>
              <h3>No itineraries yet</h3>
              <p>Build an itinerary once, with photos for each day, and reuse it in every quotation for that destination.</p>
              {can('itineraries', 'canCreate') && (
                <button type="button" className="btn btn-primary" onClick={() => navigate('/itineraries/new')}>
                  <Plus size={16} /> Create the first itinerary
                </button>
              )}
            </>
          )}
        </div>
      ) : (
        <div className={`itin-grid${loading ? ' is-refreshing' : ''}`}>
          {data.map((item) => {
            const editable = canEditRecord('itineraries', item);
            const busy = busyId === item._id;
            return (
              <article className={`itin-card${item.status === 'Archived' ? ' is-archived' : ''}`} key={item._id} aria-busy={busy}>
                <button type="button" className="itin-cover" onClick={() => navigate(`/itineraries/${item._id}/edit`)} aria-label={`Open ${item.title}`}>
                  {item.cover ? <img src={mediaUrl(item.cover.token, 'thumb')} alt="" loading="lazy" /> : <span className="itin-cover-empty"><ImageOff size={26} aria-hidden="true" /><small>No photo yet</small></span>}
                  {item.status === 'Archived' && <span className="itin-badge">Archived</span>}
                </button>
                <div className="itin-body">
                  <h3 className="itin-title" title={item.title}>{item.title}</h3>
                  <p className="itin-where"><MapPin size={13} aria-hidden="true" /> {item.destination}{item.country ? `, ${item.country}` : ''}</p>
                  <p className="itin-meta">
                    <span><Moon size={13} aria-hidden="true" /> {formatDuration(item.nights)}</span>
                    <span><Images size={13} aria-hidden="true" /> {item.photoCount} {item.photoCount === 1 ? 'photo' : 'photos'}</span>
                  </p>
                  {item.tags?.length > 0 && (
                    <p className="itin-tags">
                      {item.tags.slice(0, 4).map((t) => (
                        <span key={t}>{t}</span>
                      ))}
                    </p>
                  )}
                  <p className="itin-updated">Updated {formatDate(item.updatedAt)}{item.updatedByName ? ` by ${item.updatedByName}` : ''}</p>
                </div>
                <div className="itin-actions">
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => navigate(`/itineraries/${item._id}/edit`)}>
                    {editable ? <Edit2 size={13} /> : <Eye size={13} />} {editable ? 'Edit' : 'View'}
                  </button>
                  <ItineraryExportButtons variant="icon" disabled={busy} getItinerary={() => loadForExport(item._id)} />
                  {can('itineraries', 'canCreate') && (
                    <button type="button" className="btn-icon btn-outline" onClick={() => duplicate(item)} disabled={busy} title="Make a copy" aria-label={`Copy ${item.title}`}>
                      <Copy size={14} />
                    </button>
                  )}
                  {editable && (
                    <button type="button" className="btn-icon btn-outline" onClick={() => toggleArchive(item)} disabled={busy} title={item.status === 'Archived' ? 'Restore' : 'Archive'} aria-label={`${item.status === 'Archived' ? 'Restore' : 'Archive'} ${item.title}`}>
                      {item.status === 'Archived' ? <ArchiveRestore size={14} /> : <Archive size={14} />}
                    </button>
                  )}
                  {can('itineraries', 'canDelete') && editable && (
                    <button type="button" className="btn-icon btn-outline itin-danger" onClick={() => setToDelete(item)} disabled={busy} title="Delete" aria-label={`Delete ${item.title}`}>
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </article>
            );
          })}
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
        title="Delete this itinerary?"
        message={`"${toDelete?.title || ''}" will be removed from the library. Quotations that already use a copy of it are not affected. If you only want it out of the way, archive it instead.`}
        confirmText="Delete itinerary"
      />
    </div>
  );
};

export default ItineraryListPage;
