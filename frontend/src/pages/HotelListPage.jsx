import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Archive, ArchiveRestore, ChevronLeft, ChevronRight, Edit2, Eye, FileText, Hotel, ImageOff, Images, Lock, MapPin, Phone, Plus, RefreshCw, Search, Sparkles, Star, Trash2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import hotelService from '../services/hotelService';
import hotelFinderService from '../services/hotelFinderService';
import { mediaUrl } from '../services/mediaService';
import { getErrorMessage } from '../services/api';
import ConfirmDialog from '../components/ConfirmDialog';
import { STAR_OPTIONS, starLabel } from '../utils/hotel';
import { formatDate } from '../utils/dateHelper';
import FoundHotelsSection from '../components/hotelFinder/FoundHotelsSection';
// The hotel screens share the look of the itinerary library (cards, filters, editor sections), so they use its stylesheet.
import './itineraries.css';
import './hotels.css';

const STATUS_TABS = [
  { value: 'Active', label: 'Active' },
  { value: 'Archived', label: 'Archived' },
  { value: 'all', label: 'All' }
];
const SORTS = [
  { value: 'updated', label: 'Recently updated' },
  { value: 'name', label: 'Name A–Z' },
  { value: 'city', label: 'City A–Z' }
];
const PAGE_SIZE = 12;
const NO_FILTERS = { search: '', city: '', star: '', status: 'Active', sort: 'updated', page: 1 };

export const HotelListPage = () => {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { can, canEditRecord } = useAuth();
  const { showToast } = useToast();
  // Two sections on one page: the hotel list, and the hotels found with the hotel finder that are saved but not (yet) in the list.
  const tab = params.get('tab') === 'found' ? 'found' : 'hotels';
  const [foundCount, setFoundCount] = useState(null);
  const showTab = (next) => setParams(next === 'found' ? { tab: 'found' } : {}, { replace: true });

  const [filters, setFilters] = useState(NO_FILTERS);
  const [searchText, setSearchText] = useState('');
  const [result, setResult] = useState({ data: [], total: 0, pages: 1 });
  const [cities, setCities] = useState([]);
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
      for (const key of ['search', 'city', 'star']) if (!params[key]) delete params[key];
      const res = await hotelService.list(params);
      if (request !== latestRequest.current) return; // a newer search is already on its way
      if (res.success) setResult(res);
      else setError(res.message || 'The hotels could not be loaded.');
    } catch (err) {
      if (request === latestRequest.current) setError(getErrorMessage(err, 'The hotels could not be loaded.'));
    } finally {
      if (request === latestRequest.current) setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    if (tab === 'hotels') load(); // the found hotels have their own list; the hotel list is read only when it is the one shown
  }, [load, tab]);

  useEffect(() => {
    hotelService.cities().then((res) => res.success && setCities(res.data)).catch(() => {});
  }, []);
  // How many found hotels there are, for the tab (a failure just leaves the number out).
  useEffect(() => {
    hotelFinderService.list({ limit: 1 }).then((res) => res.success && setFoundCount(res.total)).catch(() => {});
  }, []);

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
  const hasFilters = Boolean(filters.search || filters.city || filters.star || filters.status !== 'Active');

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
    run(
      item,
      () => hotelService.update(item._id, { status: item.status === 'Archived' ? 'Active' : 'Archived' }),
      item.status === 'Archived' ? `${item.name} is active again.` : `${item.name} was archived. It stays saved and can be restored.`,
      'The hotel could not be updated.'
    );
  const confirmDelete = async () => {
    const item = toDelete;
    await run(item, () => hotelService.remove(item._id), `${item.name} was deleted.`, 'The hotel could not be deleted.');
    setToDelete(null);
  };

  const { data, total, pages } = result;

  return (
    <div className="itin-page">
      <div className="page-header animate-fade-in">
        <div className="page-header-text">
          <div className="page-title-row">
            <h2 className="page-title">Hotel List</h2>
            {tab === 'hotels' ? <span className="count-chip">{total} {total === 1 ? 'hotel' : 'hotels'}</span> : foundCount !== null && <span className="count-chip">{foundCount} found</span>}
          </div>
          <p className="page-subtitle">{tab === 'hotels' ? 'Every hotel you work with, saved once with its photos, rooms and contact details, and ready to use in quotations.' : 'Hotels found on their own websites with "Find hotel info" and saved here. Check them, then add the ones you work with to the hotel list.'}</p>
        </div>
        <div className="page-actions">
          {can('hotels', 'canCreate') && (
            <button type="button" className="btn btn-outline" onClick={() => navigate('/hotels/find')} title="Paste a hotel's website address and collect its details">
              <Sparkles size={16} /> <span>Find hotel info</span>
            </button>
          )}
          {can('hotels', 'canCreate') ? (
            <button type="button" className="btn btn-primary" onClick={() => navigate('/hotels/new')}>
              <Plus size={16} /> <span>Add hotel</span>
            </button>
          ) : (
            <button type="button" className="btn btn-outline" disabled title="You do not have permission to add hotels">
              <Lock size={14} /> <span>Adding locked</span>
            </button>
          )}
          <button type="button" className="btn-icon btn-outline" onClick={load} title="Refresh" aria-label="Refresh the list">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="fh-tabs" role="tablist" aria-label="Sections of the hotel list">
        <button type="button" role="tab" aria-selected={tab === 'hotels'} className={tab === 'hotels' ? 'is-active' : ''} onClick={() => showTab('hotels')}>Hotels</button>
        <button type="button" role="tab" aria-selected={tab === 'found'} className={tab === 'found' ? 'is-active' : ''} onClick={() => showTab('found')}>Found hotels{foundCount !== null && foundCount > 0 ? ` (${foundCount})` : ''}</button>
      </div>

      {tab === 'found' ? (
        <FoundHotelsSection onCount={setFoundCount} />
      ) : (
      <>
      <div className="glass-panel itin-filters">
        <div className="itin-search">
          <Search size={16} aria-hidden="true" />
          <input type="search" className="form-input" placeholder="Search name, city or amenity…" aria-label="Search hotels" value={searchText} onChange={(e) => setSearchText(e.target.value)} />
        </div>
        <select className="form-select" aria-label="Filter by city" value={filters.city} onChange={(e) => setFilter({ city: e.target.value })}>
          <option value="">All cities</option>
          {cities.map((c) => (
            <option key={c.city} value={c.city}>
              {c.city} ({c.count})
            </option>
          ))}
        </select>
        <select className="form-select" aria-label="Filter by rating" value={filters.star} onChange={(e) => setFilter({ star: e.target.value })}>
          <option value="">Any rating</option>
          {STAR_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
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
        <div className="itin-grid" aria-busy="true" aria-label="Loading hotels">
          {Array.from({ length: 6 }, (_, i) => (
            <div className="itin-card itin-skeleton" key={i} />
          ))}
        </div>
      ) : data.length === 0 ? (
        <div className="itin-state">
          <Hotel size={34} aria-hidden="true" />
          {hasFilters ? (
            <>
              <h3>No hotels match</h3>
              <p>Try a different word, or clear the filters.</p>
              <button type="button" className="btn btn-outline" onClick={clearFilters}>
                Clear filters
              </button>
            </>
          ) : (
            <>
              <h3>No hotels yet</h3>
              <p>Add a hotel once, with its photos and details, and pick it in any quotation instead of typing it again.</p>
              {can('hotels', 'canCreate') && (
                <button type="button" className="btn btn-primary" onClick={() => navigate('/hotels/new')}>
                  <Plus size={16} /> Add the first hotel
                </button>
              )}
            </>
          )}
        </div>
      ) : (
        <div className={`itin-grid${loading ? ' is-refreshing' : ''}`}>
          {data.map((item) => {
            const editable = canEditRecord('hotels', item);
            const busy = busyId === item._id;
            return (
              <article className={`itin-card${item.status === 'Archived' ? ' is-archived' : ''}`} key={item._id} aria-busy={busy}>
                <button type="button" className="itin-cover" onClick={() => navigate(`/hotels/${item._id}/edit`)} aria-label={`Open ${item.name}`}>
                  {item.cover ? <img src={mediaUrl(item.cover.token, 'thumb')} alt="" loading="lazy" /> : <span className="itin-cover-empty"><ImageOff size={26} aria-hidden="true" /><small>No photo yet</small></span>}
                  {item.status === 'Archived' && <span className="itin-badge">Archived</span>}
                </button>
                <div className="itin-body">
                  <h3 className="itin-title" title={item.name}>{item.name}</h3>
                  <p className="itin-where hotel-stars">
                    <Star size={13} aria-hidden="true" /> {starLabel(item.starRating)}
                  </p>
                  <p className="itin-where">
                    <MapPin size={13} aria-hidden="true" /> {[item.area, item.city, item.country].filter(Boolean).join(', ')}
                  </p>
                  <p className="itin-meta">
                    <span><Images size={13} aria-hidden="true" /> {item.photoCount} {item.photoCount === 1 ? 'photo' : 'photos'}</span>
                    {item.phone && <span><Phone size={13} aria-hidden="true" /> {item.phone}</span>}
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
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => navigate(`/hotels/${item._id}/edit`)}>
                    {editable ? <Edit2 size={13} /> : <Eye size={13} />} {editable ? 'Edit' : 'View'}
                  </button>
                  {item.status === 'Active' && can('quotations', 'canCreate') && (
                    <button type="button" className="btn-icon btn-outline" onClick={() => navigate(`/quotations/new?hotelId=${item._id}`)} title="Create a quotation for this hotel" aria-label={`Create quotation for ${item.name}`}>
                      <FileText size={14} />
                    </button>
                  )}
                  {editable && (
                    <button type="button" className="btn-icon btn-outline" onClick={() => toggleArchive(item)} disabled={busy} title={item.status === 'Archived' ? 'Restore' : 'Archive'} aria-label={`${item.status === 'Archived' ? 'Restore' : 'Archive'} ${item.name}`}>
                      {item.status === 'Archived' ? <ArchiveRestore size={14} /> : <Archive size={14} />}
                    </button>
                  )}
                  {can('hotels', 'canDelete') && editable && (
                    <button type="button" className="btn-icon btn-outline itin-danger" onClick={() => setToDelete(item)} disabled={busy} title="Delete" aria-label={`Delete ${item.name}`}>
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

      </>
      )}

      <ConfirmDialog
        isOpen={Boolean(toDelete)}
        onClose={() => setToDelete(null)}
        onConfirm={confirmDelete}
        isDanger
        isLoading={Boolean(busyId)}
        title="Delete this hotel?"
        message={`"${toDelete?.name || ''}" will disappear from the hotel list. Quotations that already used it keep their own copy. If you only want it out of the way, archive it instead.`}
        confirmText="Delete hotel"
      />
    </div>
  );
};

export default HotelListPage;
