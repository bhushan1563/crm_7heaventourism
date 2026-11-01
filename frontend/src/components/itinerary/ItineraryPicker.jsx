import React, { useCallback, useEffect, useId, useState } from 'react';
import { AlertCircle, ImageOff, Loader2, MapPin, Search } from 'lucide-react';
import Modal from '../Modal';
import itineraryService from '../../services/itineraryService';
import { getErrorMessage } from '../../services/api';
import { mediaUrl } from '../../services/mediaService';
import { formatDuration } from '../../utils/itinerary';
import './picker.css';

const PAGE_SIZE = 8;

/**
 * "Insert from the itinerary library": search the saved itineraries, pick one and say how it should be added.
 * `onInsert(itinerary, { mode, copyLists, fillDetails })` does the insert and returns { ok: false, message } to keep the
 * dialog open with that message, or anything else to close it.
 */
export const ItineraryPicker = ({ isOpen, onClose, onInsert, currentDayCount = 0 }) => {
  const groupId = useId();
  const [search, setSearch] = useState('');
  const [list, setList] = useState({ loading: true, error: '', rows: [], total: 0 });
  const [picked, setPicked] = useState(null);
  const [mode, setMode] = useState('append');
  const [copyLists, setCopyLists] = useState(false);
  const [fillDetails, setFillDetails] = useState(true);
  const [working, setWorking] = useState(false);
  const [problem, setProblem] = useState('');

  // A fresh dialog every time it is opened.
  useEffect(() => {
    if (!isOpen) return;
    setSearch('');
    setPicked(null);
    setMode(currentDayCount > 0 ? 'append' : 'replace');
    setCopyLists(false);
    setFillDetails(true);
    setWorking(false);
    setProblem('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const load = useCallback(async (text) => {
    setList((l) => ({ ...l, loading: true, error: '' }));
    try {
      const res = await itineraryService.list({ search: text || undefined, status: 'Active', sort: 'updated', page: 1, limit: PAGE_SIZE });
      if (res.success) setList({ loading: false, error: '', rows: res.data, total: res.total });
      else setList({ loading: false, error: res.message || 'The itineraries could not be loaded.', rows: [], total: 0 });
    } catch (err) {
      setList({ loading: false, error: getErrorMessage(err, 'The itineraries could not be loaded.'), rows: [], total: 0 });
    }
  }, []);

  // Ask the server only after typing pauses.
  useEffect(() => {
    if (!isOpen) return undefined;
    const timer = setTimeout(() => load(search.trim()), search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [isOpen, search, load]);

  const insert = async () => {
    if (!picked || working) return;
    setWorking(true);
    setProblem('');
    try {
      const res = await itineraryService.get(picked._id);
      if (!res.success) {
        setProblem(res.message || 'This itinerary could not be opened. It may have been removed.');
        return;
      }
      const result = await onInsert(res.data, { mode, copyLists, fillDetails });
      if (result && result.ok === false) setProblem(result.message);
      else onClose();
    } catch (err) {
      setProblem(getErrorMessage(err, 'This itinerary could not be opened. Please try again.'));
    } finally {
      setWorking(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Insert from the itinerary library" subtitle="You get your own copy to edit. The saved itinerary stays as it is." maxWidth="720px">
      <div className="picker">
        <div className="picker-search">
          <Search size={16} aria-hidden="true" />
          <input type="search" className="form-input" placeholder="Search by title, destination, country or tag…" aria-label="Search the itinerary library" value={search} onChange={(e) => setSearch(e.target.value)} autoFocus />
        </div>

        {list.error ? (
          <div className="picker-state" role="alert">
            <AlertCircle size={22} aria-hidden="true" />
            <p>{list.error}</p>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => load(search.trim())}>
              Try again
            </button>
          </div>
        ) : list.loading && list.rows.length === 0 ? (
          <div className="picker-state" role="status">
            <Loader2 size={22} className="animate-spin" aria-hidden="true" />
            <p>Loading the library…</p>
          </div>
        ) : list.rows.length === 0 ? (
          <div className="picker-state">
            <MapPin size={22} aria-hidden="true" />
            <p>{search ? 'No itinerary matches your search.' : 'The library is empty. Create an itinerary in the Itineraries section first, then insert it here.'}</p>
          </div>
        ) : (
          <>
            <div className={`picker-list${list.loading ? ' is-refreshing' : ''}`} role="radiogroup" aria-label="Itineraries in the library">
              {list.rows.map((row) => (
                <label key={row._id} className={`picker-row${picked?._id === row._id ? ' is-picked' : ''}`}>
                  <input type="radio" name={groupId} checked={picked?._id === row._id} onChange={() => { setPicked(row); setProblem(''); }} />
                  <span className="picker-cover" aria-hidden="true">
                    {row.cover ? <img src={mediaUrl(row.cover.token, 'thumb')} alt="" loading="lazy" /> : <ImageOff size={18} />}
                  </span>
                  <span className="picker-text">
                    <strong>{row.title}</strong>
                    <small>
                      {row.destination}
                      {row.country ? `, ${row.country}` : ''} · {formatDuration(row.nights)} · {row.dayCount} {row.dayCount === 1 ? 'day' : 'days'} · {row.photoCount} {row.photoCount === 1 ? 'photo' : 'photos'}
                    </small>
                  </span>
                </label>
              ))}
            </div>
            {list.total > list.rows.length && <p className="picker-more">Showing {list.rows.length} of {list.total}. Type in the search box to narrow them down.</p>}
          </>
        )}

        {picked && (
          <fieldset className="picker-options">
            <legend>How should it be added?</legend>
            {currentDayCount > 0 ? (
              <>
                <label>
                  <input type="radio" name={`${groupId}-mode`} checked={mode === 'append'} onChange={() => setMode('append')} />
                  <span>Add its days after the {currentDayCount} {currentDayCount === 1 ? 'day' : 'days'} already here</span>
                </label>
                <label>
                  <input type="radio" name={`${groupId}-mode`} checked={mode === 'replace'} onChange={() => setMode('replace')} />
                  <span>Replace the days already here <em>(they are removed from this quotation; nothing is lost until you save)</em></span>
                </label>
              </>
            ) : (
              <p className="picker-note">Its {picked.dayCount} {picked.dayCount === 1 ? 'day' : 'days'} will be added to this quotation.</p>
            )}
            <label>
              <input type="checkbox" checked={copyLists} onChange={(e) => setCopyLists(e.target.checked)} />
              <span>Also copy its inclusions and exclusions (as plain lines; lines already in the quotation are not repeated)</span>
            </label>
            <label>
              <input type="checkbox" checked={fillDetails} onChange={(e) => setFillDetails(e.target.checked)} />
              <span>Fill in the destination and duration if they are still empty</span>
            </label>
          </fieldset>
        )}

        {problem && (
          <p className="picker-problem" role="alert">
            <AlertCircle size={15} aria-hidden="true" /> {problem}
          </p>
        )}

        <div className="picker-actions">
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={insert} disabled={!picked || working}>
            {working ? <Loader2 size={15} className="animate-spin" /> : null} {working ? 'Inserting…' : 'Insert itinerary'}
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default ItineraryPicker;
