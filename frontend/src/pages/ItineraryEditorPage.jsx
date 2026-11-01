import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertCircle, Archive, ArchiveRestore, ArrowLeft, Copy, Lock, Plus, RefreshCw, Save, Trash2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import itineraryService from '../services/itineraryService';
import { getErrorMessage } from '../services/api';
import ConfirmDialog from '../components/ConfirmDialog';
import ItineraryExportButtons from '../components/itinerary/ItineraryExportButtons';
import PageLoader from '../components/PageLoader';
import PhotoGallery from '../components/PhotoGallery';
import LazyRichTextEditor from '../components/LazyRichTextEditor';
import DayEditor from '../components/itinerary/DayEditor';
import ListEditor from '../components/itinerary/ListEditor';
import TagInput from '../components/itinerary/TagInput';
import { LIMITS, emptyDay, emptyItinerary, firstErrorKey, formatDuration, moveItem, toPayload, validateItinerary } from '../utils/itinerary';
import './itineraries.css';

const toForm = (data) => ({
  ...emptyItinerary(),
  title: data.title || '',
  destination: data.destination || '',
  country: data.country || '',
  nights: data.nights ?? 0,
  summary: data.summary || '',
  photos: data.photos || [],
  days: (data.days || []).map((d) => ({ ...emptyDay(), ...d, photos: d.photos || [] })),
  inclusions: data.inclusions || [],
  exclusions: data.exclusions || [],
  tags: data.tags || [],
  status: data.status || 'Active'
});

const hasContent = (day) => Boolean(day.title.trim() || day.description || day.meals || day.stay || day.photos.length);

export const ItineraryEditorPage = () => {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const { can, canEditRecord } = useAuth();
  const { showToast } = useToast();

  const [form, setForm] = useState(emptyItinerary);
  const [record, setRecord] = useState(null);
  const [snapshot, setSnapshot] = useState(() => JSON.stringify(toPayload(emptyItinerary())));
  const [loading, setLoading] = useState(isEdit);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [conflict, setConflict] = useState(false);
  const [openDay, setOpenDay] = useState(0);
  const [confirm, setConfirm] = useState(null); // { type: 'leave' | 'delete' | 'removeDay' | 'reload', index? }

  const apply = useCallback((data, { keepOpenDay = false } = {}) => {
    const next = toForm(data);
    setForm(next);
    setRecord(data);
    setSnapshot(JSON.stringify(toPayload(next)));
    setErrors({});
    setServerError('');
    setConflict(false);
    if (!keepOpenDay) setOpenDay(next.days.length ? 0 : -1);
  }, []);

  const loadRecord = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await itineraryService.get(id);
      if (res.success) apply(res.data);
      else setLoadError(res.message || 'This itinerary could not be loaded.');
    } catch (err) {
      setLoadError(getErrorMessage(err, 'This itinerary could not be loaded.'));
    } finally {
      setLoading(false);
    }
  }, [id, apply]);

  useEffect(() => {
    if (isEdit) loadRecord();
  }, [isEdit, loadRecord]);

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

  const readOnly = isEdit ? !record || !canEditRecord('itineraries', record) : !can('itineraries', 'canCreate');

  const set = (patch) => {
    setForm((f) => ({ ...f, ...patch }));
    const cleared = Object.keys(patch).filter((k) => errors[k]);
    if (cleared.length) setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !cleared.includes(k))));
  };
  const setDay = (index, patch) => {
    setForm((f) => ({ ...f, days: f.days.map((d, i) => (i === index ? { ...d, ...patch } : d)) }));
    if (patch.title !== undefined && errors[`day-${index}`]) setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => k !== `day-${index}`)));
  };

  const addDay = () => {
    if (form.days.length >= LIMITS.maxDays) return showToast(`An itinerary can have at most ${LIMITS.maxDays} days.`, 'warning');
    setForm((f) => ({ ...f, days: [...f.days, emptyDay()] }));
    setOpenDay(form.days.length);
    setTimeout(() => document.getElementById(`day-title-${form.days.length}`)?.focus(), 60);
  };
  const addDaysToMatchNights = () => {
    const wanted = Math.min(LIMITS.maxDays, (Number(form.nights) || 0) + 1);
    if (form.days.length >= wanted) return showToast(`There are already ${form.days.length} days.`, 'info');
    setForm((f) => ({ ...f, days: [...f.days, ...Array.from({ length: wanted - f.days.length }, emptyDay)] }));
  };
  const duplicateDay = (index) => {
    if (form.days.length >= LIMITS.maxDays) return;
    setForm((f) => ({ ...f, days: [...f.days.slice(0, index + 1), { ...f.days[index], title: `${f.days[index].title} (copy)`.slice(0, LIMITS.dayTitle) }, ...f.days.slice(index + 1)] }));
    setOpenDay(index + 1);
  };
  const removeDay = (index) => {
    setForm((f) => ({ ...f, days: f.days.filter((_, i) => i !== index) }));
    setOpenDay((open) => (open === index ? -1 : open > index ? open - 1 : open));
    setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !k.startsWith('day-'))));
  };
  const moveDay = (index, delta) => {
    setForm((f) => ({ ...f, days: moveItem(f.days, index, index + delta) }));
    setOpenDay((open) => (open === index ? index + delta : open === index + delta ? index : open));
  };

  const save = async () => {
    const found = validateItinerary(form);
    setErrors(found);
    const count = Object.keys(found).length;
    if (count) {
      showToast(count === 1 ? 'Please fix the highlighted field before saving.' : `Please fix the ${count} highlighted fields before saving.`, 'warning');
      const key = firstErrorKey(found, form);
      if (key?.startsWith('day-')) {
        const index = Number(key.slice(4));
        setOpenDay(index);
        setTimeout(() => document.getElementById(`day-title-${index}`)?.focus(), 60);
      } else if (key) {
        document.getElementById(`field-${key}`)?.focus();
      }
      return;
    }

    setSaving(true);
    setServerError('');
    try {
      const payload = toPayload(form);
      const res = isEdit ? await itineraryService.update(id, { ...payload, updatedAt: record.updatedAt }) : await itineraryService.create(payload);
      if (res.success) {
        showToast(isEdit ? 'Itinerary saved.' : 'Itinerary created.', 'success');
        apply(res.data, { keepOpenDay: true });
        if (!isEdit) navigate(`/itineraries/${res.data._id}/edit`, { replace: true });
      } else {
        setServerError(res.message || 'The itinerary could not be saved.');
        if (/while you were editing/i.test(res.message || '')) setConflict(true);
        showToast(res.message || 'The itinerary could not be saved.', 'error');
      }
    } catch (err) {
      const message = getErrorMessage(err, 'The itinerary could not be saved. Your changes are still on this page; please try again.');
      setServerError(message);
      showToast(message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async () => {
    const status = form.status === 'Archived' ? 'Active' : 'Archived';
    try {
      const res = await itineraryService.update(id, { status });
      if (res.success) {
        setForm((f) => ({ ...f, status }));
        setSnapshot((s) => JSON.stringify({ ...JSON.parse(s), status }));
        setRecord(res.data);
        showToast(status === 'Archived' ? 'The itinerary was archived. It stays saved and can be restored.' : 'The itinerary is active again.', 'success');
      } else showToast(res.message || 'The status could not be changed.', 'error');
    } catch (err) {
      showToast(getErrorMessage(err, 'The status could not be changed.'), 'error');
    }
  };

  const duplicate = async () => {
    try {
      const res = await itineraryService.duplicate(id);
      if (res.success) {
        showToast('A copy was created. You are now editing the copy.', 'success');
        navigate(`/itineraries/${res.data._id}/edit`);
      } else showToast(res.message || 'The itinerary could not be copied.', 'error');
    } catch (err) {
      showToast(getErrorMessage(err, 'The itinerary could not be copied.'), 'error');
    }
  };

  const remove = async () => {
    try {
      const res = await itineraryService.remove(id);
      if (res.success) {
        showToast('The itinerary was deleted.', 'success');
        setSnapshot(JSON.stringify(toPayload(form))); // nothing left to protect
        navigate('/itineraries');
      } else showToast(res.message || 'The itinerary could not be deleted.', 'error');
    } catch (err) {
      showToast(getErrorMessage(err, 'The itinerary could not be deleted.'), 'error');
    }
    setConfirm(null);
  };

  const goBack = () => (dirty ? setConfirm({ type: 'leave' }) : navigate('/itineraries'));

  if (loading) return <PageLoader label="Loading the itinerary…" />;
  if (loadError) {
    return (
      <div className="itin-state" role="alert">
        <AlertCircle size={32} aria-hidden="true" />
        <h3>This itinerary cannot be opened</h3>
        <p>{loadError}</p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" className="btn btn-outline" onClick={() => navigate('/itineraries')}>
            <ArrowLeft size={14} /> Back to the library
          </button>
          <button type="button" className="btn btn-outline" onClick={loadRecord}>
            <RefreshCw size={14} /> Try again
          </button>
        </div>
      </div>
    );
  }

  const fieldError = (key) => errors[key] && <p className="field-error" id={`error-${key}`} role="alert">{errors[key]}</p>;
  const duration = formatDuration(form.nights);

  return (
    <div className="itin-page itin-editor">
      <div className="page-header animate-fade-in">
        <div className="page-header-text">
          <button type="button" className="itin-back" onClick={goBack}>
            <ArrowLeft size={14} /> Itinerary Library
          </button>
          <div className="page-title-row">
            <h2 className="page-title">{isEdit ? 'Edit itinerary' : 'New itinerary'}</h2>
            {form.status === 'Archived' && <span className="count-chip">Archived</span>}
            {dirty && <span className="itin-dirty">Unsaved changes</span>}
          </div>
          <p className="page-subtitle">{isEdit ? `${duration}. Changes apply to this library entry only; quotations that already use a copy are not affected.` : 'Fill in the basics, then add the days with their photos.'}</p>
        </div>
        <div className="page-actions">
          {/* Prints what is on screen right now, saved or not. */}
          <ItineraryExportButtons getItinerary={async () => ({ ...form, nights: Number(form.nights) || 0 })} />
          {isEdit && can('itineraries', 'canCreate') && (
            <button type="button" className="btn btn-outline" onClick={duplicate} disabled={dirty} title={dirty ? 'Save your changes first' : 'Make a copy'}>
              <Copy size={14} /> Copy
            </button>
          )}
          {isEdit && !readOnly && (
            <button type="button" className="btn btn-outline" onClick={changeStatus} disabled={dirty} title={dirty ? 'Save your changes first' : undefined}>
              {form.status === 'Archived' ? <ArchiveRestore size={14} /> : <Archive size={14} />} {form.status === 'Archived' ? 'Restore' : 'Archive'}
            </button>
          )}
          {isEdit && can('itineraries', 'canDelete') && !readOnly && (
            <button type="button" className="btn btn-outline itin-danger" onClick={() => setConfirm({ type: 'delete' })}>
              <Trash2 size={14} /> Delete
            </button>
          )}
        </div>
      </div>

      {readOnly && (
        <div className="itin-alert" role="status">
          <Lock size={16} aria-hidden="true" />
          <span>{isEdit ? 'You can view this itinerary but not change it. Ask an administrator or the person who created it.' : 'You do not have permission to create itineraries.'}</span>
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
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label className="form-label" htmlFor="field-title">Title *</label>
            <input id="field-title" type="text" className="form-input" value={form.title} maxLength={LIMITS.title} placeholder="e.g. Bali Honeymoon: Ubud & Seminyak" aria-invalid={Boolean(errors.title)} aria-describedby={errors.title ? 'error-title' : undefined} disabled={readOnly} onChange={(e) => set({ title: e.target.value })} />
            {fieldError('title')}
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="field-destination">Destination *</label>
            <input id="field-destination" type="text" className="form-input" value={form.destination} maxLength={LIMITS.destination} placeholder="e.g. Bali" aria-invalid={Boolean(errors.destination)} aria-describedby={errors.destination ? 'error-destination' : undefined} disabled={readOnly} onChange={(e) => set({ destination: e.target.value })} />
            {fieldError('destination')}
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="field-country">Country</label>
            <input id="field-country" type="text" className="form-input" value={form.country} maxLength={LIMITS.country} placeholder="e.g. Indonesia" disabled={readOnly} onChange={(e) => set({ country: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="field-nights">Nights</label>
            <div className="nights-row">
              <input id="field-nights" type="number" min={0} max={LIMITS.maxNights} className="form-input" value={form.nights} aria-invalid={Boolean(errors.nights)} aria-describedby={errors.nights ? 'error-nights' : undefined} disabled={readOnly} onChange={(e) => set({ nights: e.target.value })} />
              <span className="nights-duration">{duration}</span>
            </div>
            {fieldError('nights')}
          </div>
          <div className="form-group">
            <span className="form-label">Tags</span>
            <TagInput tags={form.tags} onChange={(tags) => set({ tags })} disabled={readOnly} />
          </div>
        </div>
      </section>

      <section className="glass-panel edit-section" aria-labelledby="sec-overview">
        <h3 id="sec-overview">Overview</h3>
        <p className="edit-hint">A short introduction shown at the top of the itinerary.</p>
        <LazyRichTextEditor value={form.summary} onChange={(summary) => set({ summary })} maxLength={LIMITS.summary} minHeight={120} ariaLabel="Itinerary overview" placeholder="What makes this itinerary special?" disabled={readOnly} />
      </section>

      <section className="glass-panel edit-section" aria-labelledby="sec-gallery">
        <h3 id="sec-gallery">Photos of the destination</h3>
        <PhotoGallery photos={form.photos} onChange={(photos) => set({ photos })} purpose="itinerary" max={LIMITS.itineraryPhotos} disabled={readOnly} label="Gallery" help="The first photo is the cover shown in the library and at the top of the Word file and PDF." />
      </section>

      <section className="glass-panel edit-section" aria-labelledby="sec-days">
        <div className="edit-section-head">
          <h3 id="sec-days">Day by day <span className="edit-count">({form.days.length})</span></h3>
          {!readOnly && (
            <div className="edit-section-tools">
              <button type="button" className="btn btn-outline btn-sm" onClick={addDaysToMatchNights} disabled={form.days.length >= Math.min(LIMITS.maxDays, (Number(form.nights) || 0) + 1)} title="Add empty days until there is one more day than nights">
                Fill days to match nights
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={addDay}>
                <Plus size={14} /> Add a day
              </button>
            </div>
          )}
        </div>
        {errors.days && <p className="field-error" role="alert">{errors.days}</p>}
        {form.days.length === 0 && <p className="edit-hint">No days yet. Add the first day to describe what happens.</p>}
        <div className="days-list">
          {form.days.map((day, index) => (
            <DayEditor
              key={index}
              index={index}
              total={form.days.length}
              day={day}
              open={openDay === index}
              error={errors[`day-${index}`]}
              disabled={readOnly}
              onToggle={() => setOpenDay(openDay === index ? -1 : index)}
              onChange={(patch) => setDay(index, patch)}
              onMove={(delta) => moveDay(index, delta)}
              onDuplicate={() => duplicateDay(index)}
              onRemove={() => (hasContent(day) ? setConfirm({ type: 'removeDay', index }) : removeDay(index))}
            />
          ))}
        </div>
      </section>

      <div className="itin-two-col">
        <section className="glass-panel edit-section" aria-labelledby="sec-inc">
          <h3 id="sec-inc">Inclusions</h3>
          <ListEditor label="Inclusion" items={form.inclusions} onChange={(inclusions) => set({ inclusions })} placeholder="e.g. Daily breakfast" disabled={readOnly} />
        </section>
        <section className="glass-panel edit-section" aria-labelledby="sec-exc">
          <h3 id="sec-exc">Exclusions</h3>
          <ListEditor label="Exclusion" items={form.exclusions} onChange={(exclusions) => set({ exclusions })} placeholder="e.g. Airfare" disabled={readOnly} />
        </section>
      </div>

      <div className="edit-bar" role="region" aria-label="Save">
        <span className={`edit-bar-status${dirty ? ' is-dirty' : ''}`}>{dirty ? 'You have unsaved changes' : isEdit ? 'All changes saved' : 'Not saved yet'}</span>
        <button type="button" className="btn btn-outline" onClick={goBack}>
          {dirty ? 'Cancel' : 'Back to the library'}
        </button>
        {!readOnly && (
          <button type="button" className="btn btn-primary" onClick={save} disabled={saving || (isEdit && !dirty)}>
            <Save size={15} /> {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create itinerary'}
          </button>
        )}
      </div>

      <ConfirmDialog
        isOpen={confirm?.type === 'leave'}
        onClose={() => setConfirm(null)}
        onConfirm={() => navigate('/itineraries')}
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
        title="Delete this itinerary?"
        message={`"${form.title}" will be removed from the library. Quotations that already use a copy of it are not affected. If you only want it out of the way, archive it instead.`}
        confirmText="Delete itinerary"
      />
      <ConfirmDialog
        isOpen={confirm?.type === 'removeDay'}
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          removeDay(confirm.index);
          setConfirm(null);
        }}
        isDanger
        title={`Remove Day ${(confirm?.index ?? 0) + 1}?`}
        message="The text and photos on this day will be removed from the itinerary (they are only saved when you press Save)."
        confirmText="Remove day"
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
        message="Someone else saved this itinerary while you were editing. Loading their version replaces what is on this page, including your unsaved changes."
        confirmText="Load the latest version"
        cancelText="Keep my version"
      />
    </div>
  );
};

export default ItineraryEditorPage;
