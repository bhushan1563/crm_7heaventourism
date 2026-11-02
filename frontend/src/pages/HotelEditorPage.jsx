import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertCircle, Archive, ArchiveRestore, ArrowLeft, FileText, Lock, RefreshCw, Save, Trash2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import hotelService from '../services/hotelService';
import { getErrorMessage } from '../services/api';
import ConfirmDialog from '../components/ConfirmDialog';
import PageLoader from '../components/PageLoader';
import PhotoGallery from '../components/PhotoGallery';
import LazyRichTextEditor from '../components/LazyRichTextEditor';
import RoomTypesEditor from '../components/hotel/RoomTypesEditor';
import PriceTablesEditor from '../components/quotation/PriceTablesEditor';
import { startPriceTables } from '../utils/priceTables';
import TagInput from '../components/itinerary/TagInput';
import { AMENITY_RULES, AMENITY_SUGGESTIONS, HOTEL_LIMITS, HOTEL_TAG_RULES, MEAL_PLAN_CHOICES, STAR_OPTIONS, emptyHotel, firstErrorKey, toPayload, validateHotel } from '../utils/hotel';
import { addTag } from '../utils/itinerary';
import './itineraries.css';
import './hotels.css';

const toForm = (data) => ({
  ...emptyHotel(),
  ...Object.fromEntries(Object.keys(emptyHotel()).map((key) => [key, data[key] ?? emptyHotel()[key]])),
  roomTypes: (data.roomTypes || []).map((r) => ({ name: r.name || '', details: r.details || '' })),
  // A hotel with no prices yet starts with the usual two options, ready to be named and filled in.
  priceTables: data.priceTables?.length ? data.priceTables : startPriceTables().priceTables
});

export const HotelEditorPage = () => {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const { can, canEditRecord } = useAuth();
  const { showToast } = useToast();

  const [form, setForm] = useState(emptyHotel);
  const [record, setRecord] = useState(null);
  const [snapshot, setSnapshot] = useState(() => JSON.stringify(toPayload(emptyHotel())));
  const [loading, setLoading] = useState(isEdit);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [conflict, setConflict] = useState(false);
  const [confirm, setConfirm] = useState(null); // { type: 'leave' | 'delete' | 'reload' }
  const heldId = useRef(null); // the record this page already holds (so it is not downloaded again)

  const apply = useCallback((data) => {
    heldId.current = data._id;
    const next = toForm(data);
    setForm(next);
    setRecord(data);
    setSnapshot(JSON.stringify(toPayload(next)));
    setErrors({});
    setServerError('');
    setConflict(false);
  }, []);

  const loadRecord = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await hotelService.get(id);
      if (res.success) apply(res.data);
      else setLoadError(res.message || 'This hotel could not be loaded.');
    } catch (err) {
      setLoadError(getErrorMessage(err, 'This hotel could not be loaded.'));
    } finally {
      setLoading(false);
    }
  }, [id, apply]);

  useEffect(() => {
    if (isEdit && heldId.current !== id) loadRecord();
  }, [isEdit, id, loadRecord]);

  const dirty = useMemo(() => JSON.stringify(toPayload(form)) !== snapshot, [form, snapshot]);

  // The browser's own "leave this page?" prompt covers closing the tab and reloading.
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const readOnly = isEdit ? !record || !canEditRecord('hotels', record) : !can('hotels', 'canCreate');

  const set = (patch) => {
    setForm((f) => ({ ...f, ...patch }));
    const cleared = Object.keys(patch).flatMap((k) => (k === 'roomTypes' ? Object.keys(errors).filter((e) => e.startsWith('room-')) : errors[k] ? [k] : []));
    if (cleared.length) setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !cleared.includes(k))));
  };

  const save = async () => {
    const found = validateHotel(form);
    setErrors(found);
    const count = Object.keys(found).length;
    if (count) {
      showToast(count === 1 ? 'Please fix the highlighted field before saving.' : `Please fix the ${count} highlighted fields before saving.`, 'warning');
      const key = firstErrorKey(found, form);
      if (key) document.getElementById(key.startsWith('room-') ? key : `field-${key}`)?.focus();
      return;
    }

    setSaving(true);
    setServerError('');
    try {
      const payload = toPayload(form);
      const res = isEdit ? await hotelService.update(id, { ...payload, updatedAt: record.updatedAt }) : await hotelService.create(payload);
      if (res.success) {
        showToast(isEdit ? 'Hotel saved.' : 'Hotel added to the list.', 'success');
        apply(res.data);
        if (!isEdit) navigate(`/hotels/${res.data._id}/edit`, { replace: true });
      } else {
        setServerError(res.message || 'The hotel could not be saved.');
        if (/while you were editing/i.test(res.message || '')) setConflict(true);
        showToast(res.message || 'The hotel could not be saved.', 'error');
      }
    } catch (err) {
      const message = getErrorMessage(err, 'The hotel could not be saved. Your changes are still on this page; please try again.');
      setServerError(message);
      showToast(message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async () => {
    const status = form.status === 'Archived' ? 'Active' : 'Archived';
    try {
      const res = await hotelService.update(id, { status });
      if (res.success) {
        setForm((f) => ({ ...f, status }));
        setSnapshot((s) => JSON.stringify({ ...JSON.parse(s), status }));
        setRecord(res.data);
        showToast(status === 'Archived' ? 'The hotel was archived. It stays saved and can be restored.' : 'The hotel is active again.', 'success');
      } else showToast(res.message || 'The status could not be changed.', 'error');
    } catch (err) {
      showToast(getErrorMessage(err, 'The status could not be changed.'), 'error');
    }
  };

  const remove = async () => {
    try {
      const res = await hotelService.remove(id);
      if (res.success) {
        showToast('The hotel was deleted.', 'success');
        setSnapshot(JSON.stringify(toPayload(form))); // nothing left to protect
        navigate('/hotels');
      } else showToast(res.message || 'The hotel could not be deleted.', 'error');
    } catch (err) {
      showToast(getErrorMessage(err, 'The hotel could not be deleted.'), 'error');
    }
    setConfirm(null);
  };

  const goBack = () => (dirty ? setConfirm({ type: 'leave' }) : navigate('/hotels'));

  if (loading) return <PageLoader label="Loading the hotel…" />;
  if (loadError) {
    return (
      <div className="itin-state" role="alert">
        <AlertCircle size={32} aria-hidden="true" />
        <h3>This hotel cannot be opened</h3>
        <p>{loadError}</p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" className="btn btn-outline" onClick={() => navigate('/hotels')}>
            <ArrowLeft size={14} /> Back to the hotel list
          </button>
          <button type="button" className="btn btn-outline" onClick={loadRecord}>
            <RefreshCw size={14} /> Try again
          </button>
        </div>
      </div>
    );
  }

  const fieldError = (key) => errors[key] && <p className="field-error" id={`error-${key}`} role="alert">{errors[key]}</p>;
  const text = (key, { label, required = false, placeholder = '', max, type = 'text', half = true } = {}) => (
    <div className="form-group" style={half ? undefined : { gridColumn: '1 / -1' }}>
      <label className="form-label" htmlFor={`field-${key}`}>{label}{required ? ' *' : ''}</label>
      <input
        id={`field-${key}`}
        type={type}
        className="form-input"
        value={form[key]}
        maxLength={max}
        placeholder={placeholder}
        aria-invalid={Boolean(errors[key])}
        aria-describedby={errors[key] ? `error-${key}` : undefined}
        disabled={readOnly}
        onChange={(e) => set({ [key]: e.target.value })}
      />
      {fieldError(key)}
    </div>
  );
  const togglePlan = (plan) => set({ mealPlans: form.mealPlans.includes(plan) ? form.mealPlans.filter((p) => p !== plan) : [...form.mealPlans, plan] });
  const addAmenity = (name) => set({ amenities: addTag(form.amenities, name, AMENITY_RULES).tags });

  return (
    <div className="itin-page itin-editor">
      <div className="page-header animate-fade-in">
        <div className="page-header-text">
          <button type="button" className="itin-back" onClick={goBack}>
            <ArrowLeft size={14} /> Hotel List
          </button>
          <div className="page-title-row">
            <h2 className="page-title">{isEdit ? form.name || 'Edit hotel' : 'Add a hotel'}</h2>
            {form.status === 'Archived' && <span className="count-chip">Archived</span>}
            {dirty && <span className="itin-dirty">Unsaved changes</span>}
          </div>
          <p className="page-subtitle">{isEdit ? 'Changes apply to the hotel list and to new quotations; quotations that were already made keep what they showed.' : 'Fill in the basics, then add photos and room types. Only the name and the city are required.'}</p>
        </div>
        <div className="page-actions">
          {isEdit && form.status === 'Active' && can('quotations', 'canCreate') && (
            <button type="button" className="btn btn-primary" onClick={() => navigate(`/quotations/new?hotelId=${id}`)} disabled={dirty} title={dirty ? 'Save your changes first' : 'Start a quotation for this hotel'}>
              <FileText size={14} /> Create quotation
            </button>
          )}
          {isEdit && !readOnly && (
            <button type="button" className="btn btn-outline" onClick={changeStatus} disabled={dirty} title={dirty ? 'Save your changes first' : undefined}>
              {form.status === 'Archived' ? <ArchiveRestore size={14} /> : <Archive size={14} />} {form.status === 'Archived' ? 'Restore' : 'Archive'}
            </button>
          )}
          {isEdit && can('hotels', 'canDelete') && !readOnly && (
            <button type="button" className="btn btn-outline itin-danger" onClick={() => setConfirm({ type: 'delete' })}>
              <Trash2 size={14} /> Delete
            </button>
          )}
        </div>
      </div>

      {readOnly && (
        <div className="itin-alert" role="status">
          <Lock size={16} aria-hidden="true" />
          <span>{isEdit ? 'You can view this hotel but not change it. Ask an administrator or the person who added it.' : 'You do not have permission to add hotels.'}</span>
        </div>
      )}
      {serverError && (
        <div className="itin-alert is-error" role="alert">
          <AlertCircle size={16} aria-hidden="true" />
          <span>{serverError}</span>
          {conflict && (
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setConfirm({ type: 'reload' })}>
              <RefreshCw size={13} /> Load the latest version
            </button>
          )}
        </div>
      )}

      <section className="glass-panel edit-section" aria-labelledby="sec-basics">
        <h3 id="sec-basics">The basics</h3>
        <div className="basics-grid">
          {text('name', { label: 'Hotel name', required: true, placeholder: 'e.g. The Ubud Retreat', max: HOTEL_LIMITS.name, half: false })}
          {text('city', { label: 'City', required: true, placeholder: 'e.g. Ubud', max: HOTEL_LIMITS.city })}
          {text('country', { label: 'Country', placeholder: 'e.g. Indonesia', max: HOTEL_LIMITS.country })}
          {text('area', { label: 'Area', placeholder: 'e.g. Seminyak, or near the airport', max: HOTEL_LIMITS.area })}
          <div className="form-group">
            <label className="form-label" htmlFor="field-starRating">Rating</label>
            <select id="field-starRating" className="form-select" value={form.starRating} disabled={readOnly} onChange={(e) => set({ starRating: e.target.value })}>
              {STAR_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          {text('address', { label: 'Address', placeholder: 'Street, area, postcode', max: HOTEL_LIMITS.address, half: false })}
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <span className="form-label">Tags</span>
            <TagInput tags={form.tags} onChange={(tags) => set({ tags })} disabled={readOnly} rules={HOTEL_TAG_RULES} label="Add a tag" removeLabel="Remove tag" placeholder="e.g. beachfront, family, honeymoon" />
          </div>
        </div>
      </section>

      <section className="glass-panel edit-section" aria-labelledby="sec-photos">
        <h3 id="sec-photos">Photos</h3>
        <PhotoGallery photos={form.photos} onChange={(photos) => set({ photos })} purpose="hotel" max={HOTEL_LIMITS.photos} disabled={readOnly} label="Gallery" help="The first photo is the cover shown in the list and at the top of a hotel quotation." />
      </section>

      <section className="glass-panel edit-section" aria-labelledby="sec-about">
        <h3 id="sec-about">About the hotel</h3>
        <p className="edit-hint">A short description for quotations: location, style, what guests like.</p>
        <LazyRichTextEditor value={form.description} onChange={(description) => set({ description })} maxLength={HOTEL_LIMITS.description} minHeight={120} ariaLabel="About the hotel" placeholder="Describe the hotel…" disabled={readOnly} />
      </section>

      <section className="glass-panel edit-section" aria-labelledby="sec-contact">
        <h3 id="sec-contact">Contact and timings</h3>
        <div className="hotel-contact-grid">
          {text('contactPerson', { label: 'Contact person', placeholder: 'e.g. Reservations desk', max: HOTEL_LIMITS.contactPerson })}
          {text('phone', { label: 'Phone', placeholder: 'e.g. +62 361 123 456', max: HOTEL_LIMITS.phone })}
          {text('email', { label: 'Email', placeholder: 'e.g. reservations@hotel.com', max: HOTEL_LIMITS.email, type: 'email' })}
          {text('website', { label: 'Website', placeholder: 'e.g. www.hotel.com', max: HOTEL_LIMITS.website })}
        </div>
        <div className="hotel-times">
          {text('checkInTime', { label: 'Check-in time', type: 'time' })}
          {text('checkOutTime', { label: 'Check-out time', type: 'time' })}
        </div>
      </section>

      <section className="glass-panel edit-section" aria-labelledby="sec-amenities">
        <h3 id="sec-amenities">Amenities</h3>
        <TagInput tags={form.amenities} onChange={(amenities) => set({ amenities })} disabled={readOnly} rules={AMENITY_RULES} label="Add an amenity" removeLabel="Remove amenity" placeholder="e.g. Swimming pool, Free WiFi" />
        {!readOnly && (
          <div className="suggestions" aria-label="Suggested amenities">
            <p className="suggestions-label">Tap to add:</p>
            {AMENITY_SUGGESTIONS.filter((s) => !form.amenities.some((a) => a.toLowerCase() === s.toLowerCase())).map((s) => (
              <button type="button" key={s} onClick={() => addAmenity(s)} disabled={form.amenities.length >= HOTEL_LIMITS.amenities}>
                + {s}
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="glass-panel edit-section" aria-labelledby="sec-rooms">
        <h3 id="sec-rooms">Rooms and meals</h3>
        <p className="edit-hint">Rates are entered in each quotation, because they change; here you only keep what the hotel offers.</p>
        <RoomTypesEditor rooms={form.roomTypes} onChange={(roomTypes) => set({ roomTypes })} errors={errors} disabled={readOnly} />
        <div>
          <span className="form-label">Meal plans offered</span>
          <div className="choice-grid" role="group" aria-label="Meal plans offered">
            {MEAL_PLAN_CHOICES.map((plan) => (
              <label className="choice" key={plan.value}>
                <input type="checkbox" checked={form.mealPlans.includes(plan.value)} disabled={readOnly} onChange={() => togglePlan(plan.value)} />
                <span>{plan.label}</span>
              </label>
            ))}
          </div>
        </div>
      </section>

      <section className="glass-panel edit-section" aria-labelledby="sec-pricing">
        <h3 id="sec-pricing" className="sr-only">Pricing</h3>
        <p className="edit-hint" style={{ margin: 0 }}>The usual prices of this hotel. Give each option its own name (for example the room type or the season). A hotel quotation made with this hotel starts with a copy of these prices, which can still be changed there.</p>
        <fieldset disabled={readOnly} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
          <div id="field-priceTables" tabIndex={-1}>
            <PriceTablesEditor tables={form.priceTables} onChange={(priceTables) => set({ priceTables })} />
          </div>
        </fieldset>
        {errors.priceTables && <p className="field-error" id="error-priceTables" role="alert">{errors.priceTables}</p>}
      </section>

      <section className="glass-panel edit-section" aria-labelledby="sec-policy">
        <h3 id="sec-policy">Policies and notes</h3>
        <div className="form-group">
          <span className="form-label">Cancellation policy <small>(printed on quotations)</small></span>
          <LazyRichTextEditor value={form.cancellationPolicy} onChange={(cancellationPolicy) => set({ cancellationPolicy })} maxLength={HOTEL_LIMITS.policy} minHeight={90} ariaLabel="Cancellation policy" placeholder="e.g. Free cancellation up to 7 days before arrival." disabled={readOnly} />
        </div>
        <div className="form-group">
          <span className="form-label">Internal notes <small>(never printed; only your team sees them)</small></span>
          <LazyRichTextEditor value={form.notes} onChange={(notes) => set({ notes })} maxLength={HOTEL_LIMITS.notes} minHeight={90} ariaLabel="Internal notes" placeholder="e.g. Ask for the garden-view rooms; best rates for groups of 6 or more." disabled={readOnly} />
        </div>
      </section>

      <div className="edit-bar" role="region" aria-label="Save">
        <span className={`edit-bar-status${dirty ? ' is-dirty' : ''}`}>{dirty ? 'You have unsaved changes' : isEdit ? 'All changes saved' : 'Not saved yet'}</span>
        <button type="button" className="btn btn-outline" onClick={goBack}>
          {dirty ? 'Cancel' : 'Back to the list'}
        </button>
        {!readOnly && (
          <button type="button" className="btn btn-primary" onClick={save} disabled={saving || (isEdit && !dirty)}>
            <Save size={15} /> {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add hotel'}
          </button>
        )}
      </div>

      <ConfirmDialog
        isOpen={confirm?.type === 'leave'}
        onClose={() => setConfirm(null)}
        onConfirm={() => navigate('/hotels')}
        isDanger
        title="Leave without saving?"
        message="You have changes that are not saved. If you leave now they will be lost."
        confirmText="Leave without saving"
        cancelText="Keep editing"
      />
      <ConfirmDialog
        isOpen={confirm?.type === 'delete'}
        onClose={() => setConfirm(null)}
        onConfirm={remove}
        isDanger
        title="Delete this hotel?"
        message={`"${form.name}" will disappear from the hotel list. Quotations that already used it keep their own copy. If you only want it out of the way, archive it instead.`}
        confirmText="Delete hotel"
      />
      <ConfirmDialog
        isOpen={confirm?.type === 'reload'}
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null);
          loadRecord();
        }}
        isDanger
        title="Load the latest version?"
        message="Someone else saved this hotel while you were editing. Loading their version replaces what is on this page, including your unsaved changes."
        confirmText="Load the latest version"
        cancelText="Keep my version"
      />
    </div>
  );
};

export default HotelEditorPage;
