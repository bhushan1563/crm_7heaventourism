import React, { useCallback, useEffect, useId, useState } from 'react';
import { AlertCircle, Hotel, ImageOff, Loader2, Plus, Search } from 'lucide-react';
import Modal from '../Modal';
import hotelService from '../../services/hotelService';
import { getErrorMessage } from '../../services/api';
import { mediaUrl } from '../../services/mediaService';
import { STAR_OPTIONS, emptyHotel, starLabel, toPayload, validateHotel } from '../../utils/hotel';
import '../itinerary/picker.css';

const PAGE_SIZE = 8;

/**
 * "Choose from the hotel list": search the saved hotels and pick one, or add a hotel that is not in the list yet without
 * leaving the quotation. `onPick(hotel)` receives the whole hotel and returns anything to close the dialog, or
 * { ok: false, message } to keep it open with that message. `canAdd` shows the quick-add form.
 */
export const HotelPicker = ({ isOpen, onClose, onPick, canAdd = false }) => {
  const groupId = useId();
  const [search, setSearch] = useState('');
  const [list, setList] = useState({ loading: true, error: '', rows: [], total: 0 });
  const [picked, setPicked] = useState(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ name: '', city: '', country: '', starRating: 'Unrated' });
  const [errors, setErrors] = useState({});
  const [working, setWorking] = useState(false);
  const [problem, setProblem] = useState('');

  // A fresh dialog every time it is opened.
  useEffect(() => {
    if (!isOpen) return;
    setSearch('');
    setPicked(null);
    setAdding(false);
    setDraft({ name: '', city: '', country: '', starRating: 'Unrated' });
    setErrors({});
    setWorking(false);
    setProblem('');
  }, [isOpen]);

  const load = useCallback(async (text) => {
    setList((l) => ({ ...l, loading: true, error: '' }));
    try {
      const res = await hotelService.list({ search: text || undefined, status: 'Active', sort: 'name', page: 1, limit: PAGE_SIZE });
      if (res.success) setList({ loading: false, error: '', rows: res.data, total: res.total });
      else setList({ loading: false, error: res.message || 'The hotels could not be loaded.', rows: [], total: 0 });
    } catch (err) {
      setList({ loading: false, error: getErrorMessage(err, 'The hotels could not be loaded.'), rows: [], total: 0 });
    }
  }, []);

  // Ask the server only after typing pauses.
  useEffect(() => {
    if (!isOpen) return undefined;
    const timer = setTimeout(() => load(search.trim()), search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [isOpen, search, load]);

  const finish = async (hotel) => {
    const result = await onPick(hotel);
    if (result && result.ok === false) setProblem(result.message);
    else onClose();
  };

  const useHotel = async () => {
    if (!picked || working) return;
    setWorking(true);
    setProblem('');
    try {
      const res = await hotelService.get(picked._id);
      if (!res.success) setProblem(res.message || 'This hotel could not be opened. It may have been removed.');
      else await finish(res.data);
    } catch (err) {
      setProblem(getErrorMessage(err, 'This hotel could not be opened. Please try again.'));
    } finally {
      setWorking(false);
    }
  };

  const addAndUse = async () => {
    if (working) return;
    const found = validateHotel({ ...emptyHotel(), ...draft });
    const mine = { name: found.name, city: found.city };
    setErrors(Object.fromEntries(Object.entries(mine).filter(([, v]) => v)));
    if (mine.name || mine.city) return;
    setWorking(true);
    setProblem('');
    try {
      const res = await hotelService.create(toPayload({ ...emptyHotel(), ...draft }));
      if (!res.success) setProblem(res.message || 'The hotel could not be added.');
      else await finish(res.data);
    } catch (err) {
      setProblem(getErrorMessage(err, 'The hotel could not be added. Please try again.'));
    } finally {
      setWorking(false);
    }
  };

  const setField = (key, value) => {
    setDraft((d) => ({ ...d, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: '' }));
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Choose from the hotel list" subtitle="The hotel's details and photos are copied into this quotation, where you can still change them." maxWidth="720px">
      <div className="picker">
        <div className="picker-search">
          <Search size={16} aria-hidden="true" />
          <input type="search" className="form-input" placeholder="Search by name, city or amenity…" aria-label="Search the hotel list" value={search} onChange={(e) => setSearch(e.target.value)} autoFocus />
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
            <p>Loading the hotel list…</p>
          </div>
        ) : list.rows.length === 0 ? (
          <div className="picker-state">
            <Hotel size={22} aria-hidden="true" />
            <p>{search ? 'No hotel matches your search.' : 'The hotel list is empty.'}{canAdd ? ' You can add the hotel below.' : ' Ask someone with permission to add it to the hotel list.'}</p>
          </div>
        ) : (
          <>
            <div className={`picker-list${list.loading ? ' is-refreshing' : ''}`} role="radiogroup" aria-label="Hotels in the list">
              {list.rows.map((row) => (
                <label key={row._id} className={`picker-row${picked?._id === row._id ? ' is-picked' : ''}`}>
                  <input type="radio" name={groupId} checked={picked?._id === row._id} onChange={() => { setPicked(row); setProblem(''); }} />
                  <span className="picker-cover" aria-hidden="true">
                    {row.cover ? <img src={mediaUrl(row.cover.token, 'thumb')} alt="" loading="lazy" /> : <ImageOff size={18} />}
                  </span>
                  <span className="picker-text">
                    <strong>{row.name}</strong>
                    <small>
                      {starLabel(row.starRating)} · {[row.area, row.city, row.country].filter(Boolean).join(', ')} · {row.photoCount} {row.photoCount === 1 ? 'photo' : 'photos'}
                    </small>
                  </span>
                </label>
              ))}
            </div>
            {list.total > list.rows.length && <p className="picker-more">Showing {list.rows.length} of {list.total}. Type in the search box to narrow them down.</p>}
          </>
        )}

        {canAdd && (
          <div className="picker-options">
            {!adding ? (
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setAdding(true)} style={{ alignSelf: 'flex-start' }}>
                <Plus size={14} /> The hotel is not in the list: add it
              </button>
            ) : (
              <>
                <strong style={{ fontSize: '0.88rem' }}>Add a hotel to the list</strong>
                <p className="picker-note">Only the name and the city are needed now. You can add photos, rooms and contact details later in the Hotels section.</p>
                <div className="quick-add">
                  <div>
                    <label className="form-label" htmlFor={`${groupId}-name`}>Hotel name *</label>
                    <input id={`${groupId}-name`} className="form-input" value={draft.name} maxLength={150} aria-invalid={Boolean(errors.name)} onChange={(e) => setField('name', e.target.value)} placeholder="e.g. The Ubud Retreat" />
                    {errors.name && <p className="field-error" role="alert">{errors.name}</p>}
                  </div>
                  <div>
                    <label className="form-label" htmlFor={`${groupId}-city`}>City *</label>
                    <input id={`${groupId}-city`} className="form-input" value={draft.city} maxLength={100} aria-invalid={Boolean(errors.city)} onChange={(e) => setField('city', e.target.value)} placeholder="e.g. Ubud" />
                    {errors.city && <p className="field-error" role="alert">{errors.city}</p>}
                  </div>
                  <div>
                    <label className="form-label" htmlFor={`${groupId}-country`}>Country</label>
                    <input id={`${groupId}-country`} className="form-input" value={draft.country} maxLength={80} onChange={(e) => setField('country', e.target.value)} placeholder="e.g. Indonesia" />
                  </div>
                  <div>
                    <label className="form-label" htmlFor={`${groupId}-star`}>Rating</label>
                    <select id={`${groupId}-star`} className="form-select" value={draft.starRating} onChange={(e) => setField('starRating', e.target.value)}>
                      {STAR_OPTIONS.map((s) => (
                        <option key={s.value} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" className="btn btn-primary btn-sm" onClick={addAndUse} disabled={working}>
                    {working ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} {working ? 'Adding…' : 'Add to the list and use it'}
                  </button>
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => { setAdding(false); setProblem(''); }} disabled={working}>
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
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
          <button type="button" className="btn btn-primary" onClick={useHotel} disabled={!picked || working || adding}>
            {working && !adding ? <Loader2 size={15} className="animate-spin" /> : null} {working && !adding ? 'Opening…' : 'Use this hotel'}
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default HotelPicker;
