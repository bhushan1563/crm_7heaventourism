import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertCircle, ArrowLeft, Download, ExternalLink, FileSpreadsheet, FileText, Hotel, Loader2, Lock, Plus, RefreshCw, Save, Trash2, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import hotelFinderService from '../services/hotelFinderService';
import { getErrorMessage } from '../services/api';
import ConfirmDialog from '../components/ConfirmDialog';
import PageLoader from '../components/PageLoader';
import PhotoGallery from '../components/PhotoGallery';
import TagInput from '../components/itinerary/TagInput';
import { Level } from '../components/hotelFinder/FindResult';
import { STAR_OPTIONS } from '../utils/hotel';
import { statusLabel } from '../utils/hotelFinder';
import { exportFoundCsv, exportFoundDocx, exportFoundPdf } from '../utils/hotelFinderExport';
import { formatDate } from '../utils/dateHelper';
import './itineraries.css';
import '../components/hotelFinder/hotelFinder.css';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^[0-9+\-().\s]{5,40}$/;
const TAG_RULES = { max: 10, maxLength: 30, lower: true, noun: 'tag', plural: 'tags', owner: 'A found hotel' };
const AMENITY_RULES = { max: 60, maxLength: 80, lower: false, noun: 'amenity', plural: 'amenities', owner: 'A found hotel' };

const blank = { full: '', street: '', locality: '', region: '', postalCode: '', country: '' };

/** The saved record as the form holds it: numbers as text, lists of rows. */
export const toForm = (r) => ({
  name: r.name || '', propertyType: r.propertyType || '', starRating: r.starRating || 'Unrated', tagline: r.tagline || '', description: r.description || '',
  address: { ...blank, ...(r.address || {}) }, lat: r.geo ? String(r.geo.lat) : '', lng: r.geo ? String(r.geo.lng) : '',
  phones: [...(r.phones || [])], emails: [...(r.emails || [])], website: r.website || '', social: (r.social || []).map((s) => ({ ...s })),
  checkIn: r.checkIn || '', checkOut: r.checkOut || '', amenities: [...(r.amenities || [])], rooms: (r.rooms || []).map((x) => ({ name: x.name, details: x.details || '' })),
  rateCurrency: r.rates?.currency || '', rateFrom: r.rates ? String(r.rates.from) : '', rateTo: r.rates ? String(r.rates.to) : '', rateUnit: r.rates?.unit || 'night', rateText: r.rates?.text || '', rateNote: r.rates?.note || '', rateLines: r.rates?.lines || [],
  ratingValue: r.guestRating ? String(r.guestRating.value) : '', ratingBest: r.guestRating ? String(r.guestRating.best) : '5', ratingCount: r.guestRating?.count ? String(r.guestRating.count) : '',
  cancellation: r.policies?.cancellation || '', children: r.policies?.children || '', pets: r.policies?.pets || '',
  photos: (r.photos || []).map((p) => ({ ...p })), notes: r.notes || '', tags: [...(r.tags || [])]
});

const num = (v) => (String(v).trim() === '' ? null : Number(v));

/** The form as the server wants it: blank rows dropped, empty numbers as "none". */
export const toPayload = (f) => ({
  name: f.name, propertyType: f.propertyType, starRating: f.starRating, tagline: f.tagline, description: f.description, address: f.address,
  geo: num(f.lat) === null || num(f.lng) === null ? null : { lat: num(f.lat), lng: num(f.lng) },
  phones: f.phones.map((p) => p.trim()).filter(Boolean), emails: f.emails.map((p) => p.trim()).filter(Boolean), website: f.website,
  social: f.social.filter((s) => s.url.trim()).map((s) => ({ network: s.network.trim() || 'link', url: s.url.trim() })),
  checkIn: f.checkIn, checkOut: f.checkOut, amenities: f.amenities, rooms: f.rooms.filter((r) => r.name.trim()),
  rates: num(f.rateFrom) ? { currency: f.rateCurrency, from: num(f.rateFrom), to: num(f.rateTo) || num(f.rateFrom), unit: f.rateUnit, text: f.rateText, note: f.rateNote, lines: f.rateLines } : null,
  guestRating: num(f.ratingValue) ? { value: num(f.ratingValue), best: num(f.ratingBest) || 5, count: num(f.ratingCount) || 0 } : null,
  policies: { cancellation: f.cancellation, children: f.children, pets: f.pets },
  photos: f.photos.map(({ token, caption }) => ({ token, caption: caption || '' })), notes: f.notes, tags: f.tags
});

/** What is wrong before saving, keyed by field (the server repeats the checks). */
export const validate = (f) => {
  const errors = {};
  if (!f.name.trim()) errors.name = 'Please enter the name of the hotel.';
  const badPhone = f.phones.find((p) => p.trim() && !PHONE.test(p.trim()));
  if (badPhone) errors.phones = `The phone number "${badPhone}" may only contain digits, spaces and + - ( ) . characters.`;
  const badEmail = f.emails.find((e) => e.trim() && !EMAIL.test(e.trim()));
  if (badEmail) errors.emails = `The email address "${badEmail}" does not look right.`;
  const lat = num(f.lat);
  const lng = num(f.lng);
  if ((lat === null) !== (lng === null)) errors.geo = 'Enter both the latitude and the longitude, or leave both empty.';
  else if (lat !== null && (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180)) errors.geo = 'The latitude must be from -90 to 90 and the longitude from -180 to 180.';
  const from = num(f.rateFrom);
  const to = num(f.rateTo);
  if ((from !== null && (!Number.isFinite(from) || from < 0)) || (to !== null && (!Number.isFinite(to) || to < 0))) errors.rates = 'The rates must be amounts of 0 or more.';
  const value = num(f.ratingValue);
  const best = num(f.ratingBest);
  if (value !== null && (!Number.isFinite(value) || value <= 0 || !Number.isFinite(best) || best <= 0 || value > best)) errors.rating = 'The guest rating must be above 0 and not more than the best possible score.';
  const names = f.rooms.map((r) => r.name.trim().toLowerCase()).filter(Boolean);
  if (new Set(names).size !== names.length) errors.rooms = 'A room type is listed twice. Please keep it once.';
  return errors;
};

export const FoundHotelPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { can, canEditRecord } = useAuth();
  const { showToast } = useToast();

  const [record, setRecord] = useState(null);
  const [form, setForm] = useState(null);
  const [snapshot, setSnapshot] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [confirm, setConfirm] = useState(null);
  const [downloading, setDownloading] = useState('');
  const held = useRef(null);

  const apply = useCallback((data) => {
    held.current = data._id;
    const next = toForm(data);
    setRecord(data);
    setForm(next);
    setSnapshot(JSON.stringify(toPayload(next)));
    setErrors({});
    setServerError('');
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await hotelFinderService.get(id);
      if (res.success) apply(res.data);
      else setLoadError(res.message || 'This found hotel could not be loaded.');
    } catch (err) {
      setLoadError(getErrorMessage(err, 'This found hotel could not be loaded.'));
    } finally {
      setLoading(false);
    }
  }, [id, apply]);

  useEffect(() => {
    if (held.current !== id) load();
  }, [id, load]);

  const dirty = useMemo(() => Boolean(form) && JSON.stringify(toPayload(form)) !== snapshot, [form, snapshot]);
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const readOnly = !record || !canEditRecord('hotels', record);
  const set = (patch) => {
    setForm((f) => ({ ...f, ...patch }));
    const cleared = Object.keys(errors);
    if (cleared.length) setErrors({});
  };
  const setAddress = (patch) => set({ address: { ...form.address, ...patch } });
  const setList = (key, index, value) => set({ [key]: form[key].map((x, i) => (i === index ? value : x)) });

  const save = async () => {
    const found = validate(form);
    setErrors(found);
    const keys = Object.keys(found);
    if (keys.length) {
      showToast(keys.length === 1 ? 'Please fix the highlighted field before saving.' : `Please fix the ${keys.length} highlighted fields before saving.`, 'warning');
      return;
    }
    setSaving(true);
    setServerError('');
    try {
      const res = await hotelFinderService.update(id, { ...toPayload(form), updatedAt: record.updatedAt });
      if (res.success) {
        showToast('Saved.', 'success');
        apply(res.data);
      } else {
        setServerError(res.message || 'The changes could not be saved.');
        showToast(res.message || 'The changes could not be saved.', 'error');
      }
    } catch (err) {
      const message = getErrorMessage(err, 'The changes could not be saved. They are still on this page; please try again.');
      setServerError(message);
      showToast(message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    try {
      const res = await hotelFinderService.remove(id);
      if (res.success) {
        showToast('Removed from Found hotels.', 'success');
        held.current = null;
        setSnapshot(JSON.stringify(toPayload(form)));
        navigate('/hotels?tab=found', { replace: true });
      } else showToast(res.message || 'It could not be removed.', 'error');
    } catch (err) {
      showToast(getErrorMessage(err, 'It could not be removed.'), 'error');
    }
    setConfirm(null);
  };

  const download = async (kind) => {
    setDownloading(kind);
    try {
      const current = { ...record, ...toPayload(form), foundAt: record.foundAt, completeness: record.completeness, warnings: record.warnings, sourceUrl: record.sourceUrl };
      if (kind === 'csv') {
        const r = await exportFoundCsv(current);
        if (!r.ok) showToast(r.message, 'warning');
      } else if (kind === 'docx') await exportFoundDocx(current);
      else await exportFoundPdf(current);
    } catch (err) {
      showToast(getErrorMessage(err, 'The file could not be made. Please try again.'), 'error');
    } finally {
      setDownloading('');
    }
  };

  if (loading) return <PageLoader />;
  if (loadError || !form) {
    return (
      <div className="itin-page">
        <div className="itin-state" role="alert">
          <p>{loadError || 'This found hotel could not be loaded.'}</p>
          <button type="button" className="btn btn-outline" onClick={load}><RefreshCw size={14} /> Try again</button>
          <button type="button" className="btn btn-outline" onClick={() => navigate('/hotels?tab=found')}>Back to Found hotels</button>
        </div>
      </div>
    );
  }

  const fe = (key) => errors[key] && <p className="field-error" role="alert">{errors[key]}</p>;
  const input = (label, value, onChange, { id: fieldId, type = 'text', placeholder = '', max, error } = {}) => (
    <div className="form-group">
      <label className="form-label" htmlFor={fieldId}>{label}</label>
      <input id={fieldId} type={type} className="form-input" value={value} maxLength={max} placeholder={placeholder} disabled={readOnly} aria-invalid={Boolean(error)} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
  const levels = record.fieldLevels || {};

  return (
    <div className="itin-page itin-editor">
      <div className="page-header animate-fade-in">
        <div className="page-header-text">
          <button type="button" className="itin-back" onClick={() => navigate('/hotels?tab=found')}><ArrowLeft size={14} /> Found hotels</button>
          <div className="page-title-row">
            <h2 className="page-title">{form.name || 'Found hotel'}</h2>
            <span className="count-chip">{statusLabel(record.status)}</span>
            {dirty && <span className="itin-dirty">Unsaved changes</span>}
          </div>
          <p className="page-subtitle">
            Found {record.foundAt ? formatDate(record.foundAt) : ''}{record.sourceUrl ? <> at <a href={record.sourceUrl} target="_blank" rel="noopener noreferrer">{record.sourceSite || record.sourceUrl} <ExternalLink size={12} aria-hidden="true" /></a></> : ' (typed in)'}.
            {record.completeness ? ` ${record.completeness.score} out of 100 complete.` : ''} Check the details, correct what is wrong, then add the hotel to the hotel list.
          </p>
        </div>
        <div className="page-actions fh-actions">
          {record.status === 'Added' && record.hotelId ? (
            <button type="button" className="btn btn-primary" onClick={() => navigate(`/hotels/${record.hotelId}/edit`)}><Hotel size={15} /> Open in the hotel list</button>
          ) : (
            can('hotels', 'canCreate') && <button type="button" className="btn btn-primary" onClick={() => navigate(`/hotels/new?fromFound=${id}`)} disabled={dirty} title={dirty ? 'Save your changes first' : undefined}><Plus size={15} /> Add to the hotel list</button>
          )}
          <button type="button" className="btn btn-outline" onClick={() => download('docx')} disabled={Boolean(downloading)}>{downloading === 'docx' ? <Loader2 size={15} className="animate-spin" /> : <FileText size={15} />} Word</button>
          <button type="button" className="btn btn-outline" onClick={() => download('pdf')} disabled={Boolean(downloading)}>{downloading === 'pdf' ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />} PDF</button>
          <button type="button" className="btn btn-outline" onClick={() => download('csv')} disabled={Boolean(downloading)}><FileSpreadsheet size={15} /> CSV</button>
          {can('hotels', 'canDelete') && !readOnly && <button type="button" className="btn btn-outline itin-danger" onClick={() => setConfirm({ type: 'delete' })}><Trash2 size={14} /> Remove</button>}
        </div>
      </div>

      {readOnly && <div className="itin-alert" role="status"><Lock size={16} aria-hidden="true" /><span>You can view this hotel but not change it. Ask an administrator or the person who saved it.</span></div>}
      {serverError && <div className="itin-alert is-error" role="alert"><AlertCircle size={16} aria-hidden="true" /><span>{serverError}</span></div>}
      {(record.warnings || []).length > 0 && <div className="fh-warn" role="status">{record.warnings.map((w) => <p key={w}>{w}</p>)}</div>}

      <section className="glass-panel edit-section" aria-labelledby="sec-basics">
        <h3 id="sec-basics">The basics <Level level={levels.name} /></h3>
        <div className="basics-grid">
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label className="form-label" htmlFor="found-name">Hotel name *</label>
            <input id="found-name" className="form-input" value={form.name} maxLength={150} disabled={readOnly} aria-invalid={Boolean(errors.name)} onChange={(e) => set({ name: e.target.value })} />
            {fe('name')}
          </div>
          {input('Kind of property', form.propertyType, (v) => set({ propertyType: v }), { id: 'found-type', max: 40, placeholder: 'e.g. Resort' })}
          <div className="form-group">
            <label className="form-label" htmlFor="found-stars">Rating</label>
            <select id="found-stars" className="form-select" value={form.starRating} disabled={readOnly} onChange={(e) => set({ starRating: e.target.value })}>
              {STAR_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          {input('Tagline', form.tagline, (v) => set({ tagline: v }), { id: 'found-tagline', max: 160 })}
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label className="form-label" htmlFor="found-description">About the hotel</label>
            <textarea id="found-description" className="form-input" rows={5} maxLength={5000} value={form.description} disabled={readOnly} onChange={(e) => set({ description: e.target.value })} />
          </div>
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <span className="form-label">Tags</span>
            <TagInput tags={form.tags} onChange={(tags) => set({ tags })} disabled={readOnly} rules={TAG_RULES} label="Add a tag" removeLabel="Remove tag" placeholder="e.g. beachfront, family" />
          </div>
        </div>
      </section>

      <section className="glass-panel edit-section" aria-labelledby="sec-contact">
        <h3 id="sec-contact">Contact <Level level={levels.phones} /></h3>
        <div className="fh-two">
          <div className="form-group">
            <span className="form-label">Phone numbers</span>
            <div className="fh-form-list">
              {form.phones.map((p, i) => (
                <div className="fh-form-row" key={i}>
                  <input className="form-input" aria-label={`Phone number ${i + 1}`} value={p} maxLength={40} disabled={readOnly} onChange={(e) => setList('phones', i, e.target.value)} />
                  {!readOnly && <button type="button" className="btn-icon btn-outline" aria-label={`Remove phone number ${i + 1}`} onClick={() => set({ phones: form.phones.filter((_, k) => k !== i) })}><X size={14} /></button>}
                </div>
              ))}
              {!readOnly && form.phones.length < 8 && <button type="button" className="btn btn-outline btn-sm" onClick={() => set({ phones: [...form.phones, ''] })}><Plus size={13} /> Add a phone number</button>}
            </div>
            {fe('phones')}
          </div>
          <div className="form-group">
            <span className="form-label">Email addresses</span>
            <div className="fh-form-list">
              {form.emails.map((p, i) => (
                <div className="fh-form-row" key={i}>
                  <input className="form-input" aria-label={`Email address ${i + 1}`} value={p} maxLength={120} disabled={readOnly} onChange={(e) => setList('emails', i, e.target.value)} />
                  {!readOnly && <button type="button" className="btn-icon btn-outline" aria-label={`Remove email address ${i + 1}`} onClick={() => set({ emails: form.emails.filter((_, k) => k !== i) })}><X size={14} /></button>}
                </div>
              ))}
              {!readOnly && form.emails.length < 8 && <button type="button" className="btn btn-outline btn-sm" onClick={() => set({ emails: [...form.emails, ''] })}><Plus size={13} /> Add an email address</button>}
            </div>
            {fe('emails')}
          </div>
          {input('Website', form.website, (v) => set({ website: v }), { id: 'found-website', max: 200, placeholder: 'e.g. www.hotel.com' })}
        </div>
      </section>

      <section className="glass-panel edit-section" aria-labelledby="sec-location">
        <h3 id="sec-location">Location <Level level={levels.address} /></h3>
        <div className="basics-grid">
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label className="form-label" htmlFor="found-address">Address</label>
            <input id="found-address" className="form-input" value={form.address.full} maxLength={300} disabled={readOnly} onChange={(e) => setAddress({ full: e.target.value })} />
          </div>
          {input('Street', form.address.street, (v) => setAddress({ street: v }), { id: 'found-street', max: 120 })}
          {input('City', form.address.locality, (v) => setAddress({ locality: v }), { id: 'found-city', max: 120 })}
          {input('State or region', form.address.region, (v) => setAddress({ region: v }), { id: 'found-region', max: 120 })}
          {input('Postal code', form.address.postalCode, (v) => setAddress({ postalCode: v }), { id: 'found-postal', max: 20 })}
          {input('Country', form.address.country, (v) => setAddress({ country: v }), { id: 'found-country', max: 120 })}
        </div>
        <div className="fh-two" style={{ marginTop: 10 }}>
          {input('Latitude', form.lat, (v) => set({ lat: v }), { id: 'found-lat', placeholder: 'e.g. 15.5524', error: errors.geo })}
          {input('Longitude', form.lng, (v) => set({ lng: v }), { id: 'found-lng', placeholder: 'e.g. 73.7517', error: errors.geo })}
        </div>
        {fe('geo')}
      </section>

      <section className="glass-panel edit-section" aria-labelledby="sec-stay">
        <h3 id="sec-stay">Check-in, rooms and amenities</h3>
        <div className="fh-two">
          {input('Check-in time', form.checkIn, (v) => set({ checkIn: v }), { id: 'found-checkin', type: 'time' })}
          {input('Check-out time', form.checkOut, (v) => set({ checkOut: v }), { id: 'found-checkout', type: 'time' })}
        </div>
        <div className="form-group" style={{ marginTop: 12 }}>
          <span className="form-label">Room types</span>
          <div className="fh-form-list">
            {form.rooms.map((r, i) => (
              <div className="fh-form-row" key={i}>
                <input className="form-input" aria-label={`Room type ${i + 1}`} placeholder="Room name" value={r.name} maxLength={80} disabled={readOnly} onChange={(e) => setList('rooms', i, { ...r, name: e.target.value })} />
                <input className="form-input" aria-label={`Details of room type ${i + 1}`} placeholder="Details" value={r.details} maxLength={200} disabled={readOnly} onChange={(e) => setList('rooms', i, { ...r, details: e.target.value })} />
                {!readOnly && <button type="button" className="btn-icon btn-outline" aria-label={`Remove room type ${i + 1}`} onClick={() => set({ rooms: form.rooms.filter((_, k) => k !== i) })}><X size={14} /></button>}
              </div>
            ))}
            {!readOnly && form.rooms.length < 30 && <button type="button" className="btn btn-outline btn-sm" onClick={() => set({ rooms: [...form.rooms, { name: '', details: '' }] })}><Plus size={13} /> Add a room type</button>}
          </div>
          {fe('rooms')}
        </div>
        <div className="form-group" style={{ marginTop: 12 }}>
          <span className="form-label">Amenities</span>
          <TagInput tags={form.amenities} onChange={(amenities) => set({ amenities })} disabled={readOnly} rules={AMENITY_RULES} label="Add an amenity" removeLabel="Remove amenity" placeholder="e.g. Swimming pool, Free WiFi" />
        </div>
      </section>

      <section className="glass-panel edit-section" aria-labelledby="sec-rates">
        <h3 id="sec-rates">Rates and guest rating <Level level={levels.rates} /></h3>
        <p className="edit-hint">Rates are as the hotel's own website printed them. Check them with the hotel before quoting.</p>
        <div className="fh-three">
          {input('Currency', form.rateCurrency, (v) => set({ rateCurrency: v.toUpperCase() }), { id: 'found-currency', max: 5, placeholder: 'e.g. INR' })}
          {input('Lowest rate', form.rateFrom, (v) => set({ rateFrom: v }), { id: 'found-rate-from', type: 'number', placeholder: 'e.g. 3500', error: errors.rates })}
          {input('Highest rate', form.rateTo, (v) => set({ rateTo: v }), { id: 'found-rate-to', type: 'number', placeholder: 'e.g. 9000', error: errors.rates })}
        </div>
        <div className="fh-two" style={{ marginTop: 10 }}>
          <div className="form-group">
            <label className="form-label" htmlFor="found-rate-unit">Per</label>
            <select id="found-rate-unit" className="form-select" value={form.rateUnit} disabled={readOnly} onChange={(e) => set({ rateUnit: e.target.value })}>
              <option value="night">Night</option>
              <option value="person">Person</option>
            </select>
          </div>
          {input('As printed on the website', form.rateText, (v) => set({ rateText: v }), { id: 'found-rate-text', max: 200 })}
        </div>
        {fe('rates')}
        <div className="fh-three" style={{ marginTop: 10 }}>
          {input('Guest rating', form.ratingValue, (v) => set({ ratingValue: v }), { id: 'found-rating', type: 'number', placeholder: 'e.g. 4.5', error: errors.rating })}
          {input('Out of', form.ratingBest, (v) => set({ ratingBest: v }), { id: 'found-rating-best', type: 'number' })}
          {input('Number of reviews', form.ratingCount, (v) => set({ ratingCount: v }), { id: 'found-rating-count', type: 'number' })}
        </div>
        {fe('rating')}
      </section>

      <section className="glass-panel edit-section" aria-labelledby="sec-photos">
        <h3 id="sec-photos">Pictures</h3>
        <PhotoGallery photos={form.photos} onChange={(photos) => set({ photos })} purpose="hotel" max={30} disabled={readOnly} label="Gallery" help="The pictures copied from the website, and any you add. The first picture is the cover." />
      </section>

      <section className="glass-panel edit-section" aria-labelledby="sec-policy">
        <h3 id="sec-policy">Policies and notes</h3>
        {[['cancellation', 'Cancellation policy'], ['children', 'Children'], ['pets', 'Pets']].map(([key, label]) => (
          <div className="form-group" key={key}>
            <label className="form-label" htmlFor={`found-${key}`}>{label}</label>
            <textarea id={`found-${key}`} className="form-input" rows={2} maxLength={700} value={form[key]} disabled={readOnly} onChange={(e) => set({ [key]: e.target.value })} />
          </div>
        ))}
        <div className="form-group">
          <label className="form-label" htmlFor="found-notes">Internal notes</label>
          <textarea id="found-notes" className="form-input" rows={3} maxLength={1500} value={form.notes} disabled={readOnly} onChange={(e) => set({ notes: e.target.value })} placeholder="e.g. Called on Monday; ask for the group rate." />
        </div>
      </section>

      {!readOnly && (
        <div className="edit-bar">
          <span className={`edit-bar-status${dirty ? ' is-dirty' : ''}`}>{dirty ? 'You have unsaved changes.' : 'All changes are saved.'}</span>
          <button type="button" className="btn btn-primary" onClick={save} disabled={!dirty || saving}>{saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} {saving ? 'Saving…' : 'Save changes'}</button>
        </div>
      )}

      <ConfirmDialog
        isOpen={confirm?.type === 'delete'}
        onClose={() => setConfirm(null)}
        onConfirm={remove}
        isDanger
        title="Remove this found hotel?"
        message={`"${form.name}" will disappear from Found hotels. A hotel already added to the hotel list is not affected.`}
        confirmText="Remove"
      />
    </div>
  );
};

export default FoundHotelPage;
