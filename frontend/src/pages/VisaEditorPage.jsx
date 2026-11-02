import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertCircle, Archive, ArchiveRestore, ArrowLeft, FileText, Lock, RefreshCw, Save, Trash2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import visaService from '../services/visaService';
import { getErrorMessage } from '../services/api';
import ConfirmDialog from '../components/ConfirmDialog';
import PageLoader from '../components/PageLoader';
import VisaEditor from '../components/quotation/VisaEditor';
import { VISA_LIST_LIMITS, emptyVisaItem, formFromVisaItem, visaItemPayload, visaItemProblem } from '../utils/visaList';
import './itineraries.css';
import '../components/confirmation/confirmation.css';

export const VisaEditorPage = () => {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const { can, canEditRecord } = useAuth();
  const { showToast } = useToast();

  const [form, setForm] = useState(emptyVisaItem);
  const [record, setRecord] = useState(null);
  const [snapshot, setSnapshot] = useState(() => JSON.stringify(visaItemPayload(emptyVisaItem())));
  const [loading, setLoading] = useState(isEdit);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState('');
  const [conflict, setConflict] = useState(false);
  const [dialog, setDialog] = useState(null); // 'leave' | 'delete' | 'reload'
  const heldId = useRef(null);

  const apply = useCallback((data) => {
    heldId.current = data._id;
    const next = formFromVisaItem(data);
    setForm(next);
    setRecord(data);
    setSnapshot(JSON.stringify(visaItemPayload(next)));
    setServerError('');
    setConflict(false);
  }, []);

  const loadRecord = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await visaService.get(id);
      if (res.success) apply(res.data);
      else setLoadError(res.message || 'This visa could not be loaded.');
    } catch (err) {
      setLoadError(getErrorMessage(err, 'This visa could not be loaded.'));
    } finally {
      setLoading(false);
    }
  }, [id, apply]);

  useEffect(() => {
    if (isEdit && heldId.current !== id) loadRecord();
  }, [isEdit, id, loadRecord]);

  const dirty = useMemo(() => JSON.stringify(visaItemPayload(form)) !== snapshot, [form, snapshot]);

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

  const readOnly = isEdit ? !record || !canEditRecord('visas', record) : !can('visas', 'canCreate');
  const archived = record?.status === 'Archived';
  const patch = (changes) => setForm((f) => ({ ...f, ...changes }));

  const save = async () => {
    const problem = visaItemProblem(form);
    if (problem) {
      setServerError(problem);
      showToast(problem, 'warning');
      document.getElementById('visa-country')?.focus();
      return;
    }
    setSaving(true);
    setServerError('');
    try {
      const payload = visaItemPayload(form);
      const res = isEdit ? await visaService.update(id, { ...payload, updatedAt: record.updatedAt }) : await visaService.create(payload);
      if (res.success) {
        showToast(isEdit ? 'Visa saved.' : 'Visa added to the list.', 'success');
        apply(res.data);
        if (!isEdit) navigate(`/visas/${res.data._id}/edit`, { replace: true });
      } else {
        setServerError(res.message || 'The visa could not be saved.');
        if (/while you were editing/i.test(res.message || '')) setConflict(true);
        showToast(res.message || 'The visa could not be saved.', 'error');
      }
    } catch (err) {
      const message = getErrorMessage(err, 'The visa could not be saved. Your changes are still on this page; please try again.');
      setServerError(message);
      showToast(message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async () => {
    const status = archived ? 'Active' : 'Archived';
    try {
      const res = await visaService.update(id, { status });
      if (res.success) {
        setRecord(res.data);
        showToast(status === 'Archived' ? 'The visa was archived. It stays saved and can be restored.' : 'The visa is active again.', 'success');
      } else showToast(res.message || 'The status could not be changed.', 'error');
    } catch (err) {
      showToast(getErrorMessage(err, 'The status could not be changed.'), 'error');
    }
  };

  const remove = async () => {
    try {
      const res = await visaService.remove(id);
      if (res.success) {
        showToast('The visa was deleted.', 'success');
        setSnapshot(JSON.stringify(visaItemPayload(form))); // nothing left to protect
        navigate('/visas');
      } else showToast(res.message || 'The visa could not be deleted.', 'error');
    } catch (err) {
      showToast(getErrorMessage(err, 'The visa could not be deleted.'), 'error');
    }
    setDialog(null);
  };

  const goBack = () => (dirty ? setDialog('leave') : navigate('/visas'));

  if (loading) return <PageLoader label="Loading the visa…" />;
  if (loadError) {
    return (
      <div className="itin-state" role="alert">
        <AlertCircle size={32} aria-hidden="true" />
        <h3>This visa cannot be opened</h3>
        <p>{loadError}</p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" className="btn btn-outline" onClick={() => navigate('/visas')}>
            <ArrowLeft size={14} /> Back to the visa list
          </button>
          <button type="button" className="btn btn-outline" onClick={loadRecord}>
            <RefreshCw size={14} /> Try again
          </button>
        </div>
      </div>
    );
  }

  const title = isEdit ? [form.visa.country, form.visa.visaType].filter(Boolean).join(' · ') || 'Visa' : 'Add a visa';

  return (
    <div className="itin-page itin-editor">
      <div className="page-header animate-fade-in">
        <div className="page-header-text">
          <button type="button" className="itin-back" onClick={goBack}>
            <ArrowLeft size={14} /> Visa List
          </button>
          <div className="page-title-row">
            <h2 className="page-title">{title}</h2>
            {archived && <span className="cf-badge is-cancelled">Archived</span>}
            {dirty && <span className="itin-dirty">Unsaved changes</span>}
          </div>
          <p className="page-subtitle">A visa saved here can be picked in any visa quotation: its details, documents checklist, usual fees and inclusions come with it.</p>
        </div>
        <div className="page-actions">
          {isEdit && !archived && can('quotations', 'canCreate') && (
            <button type="button" className="btn btn-outline-azure" onClick={() => (dirty ? setDialog('leave-to-quote') : navigate(`/quotations/new?visaId=${id}`))}>
              <FileText size={15} /> <span>Create quotation</span>
            </button>
          )}
          {isEdit && !readOnly && (
            <button type="button" className="btn btn-outline" onClick={changeStatus}>
              {archived ? <ArchiveRestore size={15} /> : <Archive size={15} />} <span>{archived ? 'Restore' : 'Archive'}</span>
            </button>
          )}
          {isEdit && !readOnly && can('visas', 'canDelete') && (
            <button type="button" className="btn btn-outline itin-danger" onClick={() => setDialog('delete')}>
              <Trash2 size={15} /> <span>Delete</span>
            </button>
          )}
        </div>
      </div>

      {readOnly && (
        <div className="itin-alert" role="status">
          <Lock size={16} aria-hidden="true" />
          <span>{isEdit ? 'You can look at this visa but not change it.' : 'You do not have permission to add visas.'}</span>
        </div>
      )}
      {serverError && (
        <div className="itin-alert cf-alert-error" role="alert">
          <AlertCircle size={16} aria-hidden="true" />
          <span>{serverError}</span>
          {conflict && (
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setDialog('reload')}>
              <RefreshCw size={13} /> Load the latest version
            </button>
          )}
        </div>
      )}

      <fieldset disabled={readOnly || saving} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        <section className="glass-panel edit-section">
          <VisaEditor quotation={form} section="details" hideApplicants onChange={patch} />
        </section>
        <section className="glass-panel edit-section" style={{ marginTop: 18 }}>
          <VisaEditor quotation={form} section="fees" hideApplicants onChange={patch} />
        </section>
        <section className="glass-panel edit-section" style={{ marginTop: 18 }}>
          <h3 className="edit-section-title" style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800 }}>Internal notes</h3>
          <p className="edit-hint">For your team only: never printed on a quotation.</p>
          <textarea id="visa-notes" className="form-textarea" rows={3} maxLength={VISA_LIST_LIMITS.notes} value={form.notes} aria-label="Internal notes" placeholder="e.g. The embassy is closed on Fridays; allow an extra day." onChange={(e) => patch({ notes: e.target.value })} />
        </section>
      </fieldset>

      <div className="edit-bar" role="region" aria-label="Save">
        <span className={`edit-bar-status${dirty ? ' is-dirty' : ''}`}>{dirty ? 'You have unsaved changes' : isEdit ? 'All changes saved' : 'Not saved yet'}</span>
        <button type="button" className="btn btn-outline" onClick={goBack}>
          {dirty ? 'Cancel' : 'Back to the list'}
        </button>
        {!readOnly && (
          <button type="button" className="btn btn-primary" onClick={save} disabled={saving || (isEdit && !dirty)}>
            <Save size={15} /> {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add visa'}
          </button>
        )}
      </div>

      <ConfirmDialog isOpen={dialog === 'leave'} onClose={() => setDialog(null)} onConfirm={() => navigate('/visas')} isDanger title="Leave without saving?" message="You have changes that are not saved. If you leave now they will be lost." confirmText="Leave without saving" cancelText="Keep editing" />
      <ConfirmDialog isOpen={dialog === 'leave-to-quote'} onClose={() => setDialog(null)} onConfirm={() => navigate(`/quotations/new?visaId=${id}`)} isDanger title="Create the quotation without saving?" message="You have changes that are not saved. The quotation will use the visa as it was last saved." confirmText="Create the quotation anyway" cancelText="Keep editing" />
      <ConfirmDialog isOpen={dialog === 'delete'} onClose={() => setDialog(null)} onConfirm={remove} isDanger title="Delete this visa?" message={`"${title}" will disappear from the visa list. Quotations that already used it keep their own copy. If you only want it out of the way, archive it instead.`} confirmText="Delete visa" />
      <ConfirmDialog
        isOpen={dialog === 'reload'}
        onClose={() => setDialog(null)}
        onConfirm={() => {
          setDialog(null);
          loadRecord();
        }}
        isDanger
        title="Load the latest version?"
        message="Someone else saved this visa while you were editing. Loading their version replaces what is on this page, including your unsaved changes."
        confirmText="Load the latest version"
        cancelText="Keep my version"
      />
    </div>
  );
};

export default VisaEditorPage;
