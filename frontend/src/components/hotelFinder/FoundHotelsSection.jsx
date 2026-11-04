import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Edit2, Eye, Hotel, ImageOff, Images, MapPin, Plus, RefreshCw, Search, Sparkles, Trash2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import hotelFinderService from '../../services/hotelFinderService';
import { mediaUrl } from '../../services/mediaService';
import { getErrorMessage } from '../../services/api';
import ConfirmDialog from '../ConfirmDialog';
import { starLabel } from '../../utils/hotel';
import { statusLabel } from '../../utils/hotelFinder';
import { formatDate } from '../../utils/dateHelper';
import '../../pages/itineraries.css';
import './hotelFinder.css';

const PAGE_SIZE = 12;
const STATUS_TABS = [{ value: '', label: 'All' }, { value: 'Saved', label: 'Not added yet' }, { value: 'Added', label: 'In the hotel list' }];
const SORTS = [{ value: 'updated', label: 'Recently updated' }, { value: 'found', label: 'Recently found' }, { value: 'name', label: 'Name A–Z' }];

/** The second section of the Hotel List: the hotels found with the hotel finder and saved, before they are added to the hotel list. */
export const FoundHotelsSection = ({ onCount }) => {
  const navigate = useNavigate();
  const { can } = useAuth();
  const { showToast } = useToast();
  const [filters, setFilters] = useState({ search: '', status: '', sort: 'updated', page: 1 });
  const [searchText, setSearchText] = useState('');
  const [result, setResult] = useState({ data: [], total: 0, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toDelete, setToDelete] = useState(null);
  const [busy, setBusy] = useState(false);
  const latest = useRef(0);

  const load = useCallback(async () => {
    const request = ++latest.current;
    setLoading(true);
    setError('');
    try {
      const params = { ...filters, limit: PAGE_SIZE };
      for (const key of ['search', 'status']) if (!params[key]) delete params[key];
      const res = await hotelFinderService.list(params);
      if (request !== latest.current) return;
      if (res.success) {
        setResult(res);
        onCount?.(res.total);
      } else setError(res.message || 'The found hotels could not be loaded.');
    } catch (err) {
      if (request === latest.current) setError(getErrorMessage(err, 'The found hotels could not be loaded.'));
    } finally {
      if (request === latest.current) setLoading(false);
    }
  }, [filters, onCount]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const timer = setTimeout(() => setFilters((f) => (f.search === searchText.trim() ? f : { ...f, search: searchText.trim(), page: 1 })), 300);
    return () => clearTimeout(timer);
  }, [searchText]);

  const setFilter = (patch) => setFilters((f) => ({ ...f, ...patch, page: 1 }));
  const confirmDelete = async () => {
    const item = toDelete;
    setBusy(true);
    try {
      const res = await hotelFinderService.remove(item._id);
      if (res.success) {
        showToast(`${item.name} was removed from Found hotels.`, 'success');
        await load();
      } else showToast(res.message || 'It could not be removed.', 'error');
    } catch (err) {
      showToast(getErrorMessage(err, 'It could not be removed.'), 'error');
    } finally {
      setBusy(false);
      setToDelete(null);
    }
  };

  const { data, pages, total } = result;
  const hasFilters = Boolean(filters.search || filters.status);

  return (
    <div>
      <div className="glass-panel itin-filters">
        <div className="itin-search">
          <Search size={16} aria-hidden="true" />
          <input type="search" className="form-input" placeholder="Search name, city, website or amenity…" aria-label="Search found hotels" value={searchText} onChange={(e) => setSearchText(e.target.value)} />
        </div>
        <select className="form-select" aria-label="Sort found hotels" value={filters.sort} onChange={(e) => setFilter({ sort: e.target.value })}>
          {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <div className="itin-tabs" role="tablist" aria-label="Status of found hotels">
          {STATUS_TABS.map((tab) => (
            <button key={tab.value || 'all'} type="button" role="tab" aria-selected={filters.status === tab.value} className={filters.status === tab.value ? 'is-active' : ''} onClick={() => setFilter({ status: tab.value })}>{tab.label}</button>
          ))}
        </div>
        {hasFilters && <button type="button" className="btn btn-outline btn-sm" onClick={() => { setSearchText(''); setFilters({ search: '', status: '', sort: 'updated', page: 1 }); }}>Reset filters</button>}
      </div>

      {error ? (
        <div className="itin-state" role="alert"><p>{error}</p><button type="button" className="btn btn-outline" onClick={load}><RefreshCw size={14} /> Try again</button></div>
      ) : loading && data.length === 0 ? (
        <div className="itin-grid" aria-busy="true" aria-label="Loading found hotels">{Array.from({ length: 6 }, (_, i) => <div className="itin-card itin-skeleton" key={i} />)}</div>
      ) : data.length === 0 ? (
        <div className="itin-state">
          <Sparkles size={34} aria-hidden="true" />
          {hasFilters ? (
            <><h3>No found hotels match</h3><p>Try a different word, or clear the filters.</p></>
          ) : (
            <>
              <h3>No found hotels yet</h3>
              <p>Paste a hotel's website address in "Find hotel info" and save what it finds. The saved hotels wait here until you add them to the hotel list.</p>
              {can('hotels', 'canCreate') && <button type="button" className="btn btn-primary" onClick={() => navigate('/hotels/find')}><Plus size={16} /> Find hotel info</button>}
            </>
          )}
        </div>
      ) : (
        <div className={`itin-grid${loading ? ' is-refreshing' : ''}`} aria-label={`${total} found hotels`}>
          {data.map((item) => (
            <article className="itin-card" key={item._id}>
              <button type="button" className="itin-cover" onClick={() => navigate(`/hotels/found/${item._id}`)} aria-label={`Open ${item.name}`}>
                {item.cover ? <img src={mediaUrl(item.cover.token, 'thumb')} alt="" loading="lazy" /> : <span className="itin-cover-empty"><ImageOff size={26} aria-hidden="true" /><small>No picture</small></span>}
                <span className="itin-badge">{statusLabel(item.status)}</span>
              </button>
              <div className="itin-body">
                <h3 className="itin-title" title={item.name}>{item.name}</h3>
                <p className="itin-where hotel-stars">{item.starRating && item.starRating !== 'Unrated' ? starLabel(item.starRating) : item.propertyType || 'Not rated'}</p>
                <p className="itin-where"><MapPin size={13} aria-hidden="true" /> {[item.address?.locality, item.address?.country].filter(Boolean).join(', ') || 'Location not found'}</p>
                <p className="itin-meta">
                  <span><Images size={13} aria-hidden="true" /> {item.photoCount} {item.photoCount === 1 ? 'picture' : 'pictures'}</span>
                  {item.completeness?.score !== undefined && <span>{item.completeness.score}/100 complete</span>}
                </p>
                {item.sourceSite && <p className="itin-tags"><span>{item.source === 'pasted' ? 'pasted from ' : ''}{item.sourceSite}</span></p>}
                <p className="itin-updated">Found {formatDate(item.foundAt || item.createdAt)}{item.createdByName ? ` by ${item.createdByName}` : ''}</p>
              </div>
              <div className="itin-actions">
                <button type="button" className="btn btn-outline btn-sm" onClick={() => navigate(`/hotels/found/${item._id}`)}><Edit2 size={13} /> Open</button>
                {item.status === 'Saved' && can('hotels', 'canCreate') && (
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => navigate(`/hotels/new?fromFound=${item._id}`)} title="Add this hotel to the hotel list"><Hotel size={13} /> Add to list</button>
                )}
                {item.status === 'Added' && item.hotelId && <button type="button" className="btn btn-outline btn-sm" onClick={() => navigate(`/hotels/${item.hotelId}/edit`)}><Eye size={13} /> Hotel</button>}
                {can('hotels', 'canDelete') && <button type="button" className="btn-icon btn-outline itin-danger" onClick={() => setToDelete(item)} title="Remove" aria-label={`Remove ${item.name}`}><Trash2 size={14} /></button>}
              </div>
            </article>
          ))}
        </div>
      )}

      {pages > 1 && (
        <nav className="itin-pager" aria-label="Pages of found hotels">
          <button type="button" className="btn btn-outline btn-sm" disabled={filters.page <= 1 || loading} onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}><ChevronLeft size={14} /> Previous</button>
          <span>Page {filters.page} of {pages}</span>
          <button type="button" className="btn btn-outline btn-sm" disabled={filters.page >= pages || loading} onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}>Next <ChevronRight size={14} /></button>
        </nav>
      )}

      <ConfirmDialog isOpen={Boolean(toDelete)} onClose={() => setToDelete(null)} onConfirm={confirmDelete} isDanger isLoading={busy} title="Remove this found hotel?" message={`"${toDelete?.name || ''}" will disappear from Found hotels. A hotel already added to the hotel list is not affected.`} confirmText="Remove" />
    </div>
  );
};

export default FoundHotelsSection;
