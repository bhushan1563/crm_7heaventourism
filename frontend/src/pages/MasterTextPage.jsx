import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowDown, ArrowUp, Lock, Plus, RefreshCw, RotateCcw, Save, Trash2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import masterTextService from '../services/masterTextService';
import { getErrorMessage } from '../services/api';
import ConfirmDialog from '../components/ConfirmDialog';
import PageLoader from '../components/PageLoader';
import FormattedLine from '../components/quotation/FormattedLine';
import { MASTER_LIMITS, MASTER_SECTIONS, masterChanged, masterProblem, payloadOf, standardLists } from '../utils/masterText';
import { formatLongDate } from '../utils/dateHelper';
import './itineraries.css';
import './masterText.css';

/**
 * The "Master Editor": one place where an Admin changes the standard Notes and Policy text (important notes, payment policy,
 * cancellation policy, exclusions, vehicle notes). Every NEW quotation starts with it; a quotation that was already made keeps its own
 * copy, so changing it here never changes what a client was sent. Until something is saved the built-in text is in use.
 */
export const MasterTextPage = () => {
  const { can } = useAuth();
  const { showToast } = useToast();
  const readOnly = !can('rights', 'canUpdate');

  const [master, setMaster] = useState(null); // what is saved (null = the built-in text)
  const [lists, setLists] = useState(() => standardLists(null));
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState('');
  const [conflict, setConflict] = useState(false);
  const [askReset, setAskReset] = useState(false);
  const [resetting, setResetting] = useState(false);

  const apply = useCallback((data) => {
    setMaster(data);
    setLists(standardLists(data));
    setServerError('');
    setConflict(false);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await masterTextService.get();
      if (res.success) apply(res.data);
      else setLoadError(res.message || 'The standard notes and policies could not be loaded.');
    } catch (err) {
      setLoadError(getErrorMessage(err, 'The standard notes and policies could not be loaded.'));
    } finally {
      setLoading(false);
    }
  }, [apply]);

  useEffect(() => {
    load();
  }, [load]);

  const dirty = useMemo(() => !loading && masterChanged(lists, master), [lists, master, loading]);

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

  const setLine = (key, index, value) => setLists((l) => ({ ...l, [key]: l[key].map((line, i) => (i === index ? value : line)) }));
  const addLine = (key) => setLists((l) => ({ ...l, [key]: [...l[key], ''] }));
  const removeLine = (key, index) => setLists((l) => ({ ...l, [key]: l[key].filter((_, i) => i !== index) }));
  const moveLine = (key, index, to) =>
    setLists((l) => {
      if (to < 0 || to >= l[key].length) return l;
      const next = [...l[key]];
      const [line] = next.splice(index, 1);
      next.splice(to, 0, line);
      return { ...l, [key]: next };
    });

  const save = async () => {
    const problem = masterProblem(lists);
    if (problem) {
      setServerError(problem);
      showToast(problem, 'warning');
      return;
    }
    setSaving(true);
    setServerError('');
    try {
      const res = await masterTextService.save({ ...payloadOf(lists), ...(master?.updatedAt ? { updatedAt: master.updatedAt } : {}) });
      if (res.success) {
        showToast(res.message || 'The standard notes and policies were saved.', 'success');
        apply(res.data);
      } else {
        setServerError(res.message || 'The standard notes and policies could not be saved.');
        if (/while you were editing/i.test(res.message || '')) setConflict(true);
        showToast(res.message || 'The standard notes and policies could not be saved.', 'error');
      }
    } catch (err) {
      const message = getErrorMessage(err, 'The standard notes and policies could not be saved. Your changes are still on this page; please try again.');
      setServerError(message);
      showToast(message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const backToBuiltIn = async () => {
    setResetting(true);
    try {
      const res = await masterTextService.reset();
      if (res.success) {
        showToast(res.message || 'Back to the built-in text.', 'success');
        apply(null);
        setAskReset(false);
      } else {
        showToast(res.message || 'Could not go back to the built-in text.', 'error');
      }
    } catch (err) {
      showToast(getErrorMessage(err, 'Could not go back to the built-in text.'), 'error');
    } finally {
      setResetting(false);
    }
  };

  if (loading) return <PageLoader label="Loading the standard notes and policies…" />;
  if (loadError) {
    return (
      <div className="itin-state" role="alert">
        <AlertCircle size={32} aria-hidden="true" />
        <h3>The standard notes and policies cannot be opened</h3>
        <p>{loadError}</p>
        <button type="button" className="btn btn-outline" onClick={load}>
          <RefreshCw size={14} /> Try again
        </button>
      </div>
    );
  }

  return (
    <div className="itin-page itin-editor">
      <div className="page-header animate-fade-in">
        <div className="page-header-text">
          <div className="page-title-row">
            <h2 className="page-title">Notes &amp; Policies</h2>
            {dirty && <span className="itin-dirty">Unsaved changes</span>}
          </div>
          <p className="page-subtitle">The standard text every new quotation starts with. Quotations that were already made keep their own text.</p>
        </div>
        <div className="page-actions">
          {!readOnly && master && (
            <button type="button" className="btn btn-outline" onClick={() => setAskReset(true)} disabled={saving}>
              <RotateCcw size={15} /> <span>Back to the built-in text</span>
            </button>
          )}
          {!readOnly && (
            <button type="button" className="btn btn-primary" onClick={save} disabled={saving || !dirty}>
              <Save size={15} /> {saving ? 'Saving…' : 'Save changes'}
            </button>
          )}
        </div>
      </div>

      <div className="itin-alert mt-status" role="status">
        <span>
          {master
            ? `The company's own text, saved${master.updatedByName ? ` by ${master.updatedByName}` : ''}${master.updatedAt ? ` on ${formatLongDate(master.updatedAt)}` : ''}.`
            : 'The built-in standard text is in use. Change any line below and save, and it becomes the company\'s own text.'}
        </span>
      </div>
      {readOnly && (
        <div className="itin-alert" role="status">
          <Lock size={16} aria-hidden="true" />
          <span>Only an Admin can change the standard text. You can read it here.</span>
        </div>
      )}
      {serverError && (
        <div className="itin-alert cf-alert-error" role="alert">
          <AlertCircle size={16} aria-hidden="true" />
          <span>{serverError}</span>
          {conflict && (
            <button type="button" className="btn btn-outline btn-sm" onClick={load}>
              <RefreshCw size={13} /> Load the latest version
            </button>
          )}
        </div>
      )}

      {MASTER_SECTIONS.map(({ key, title, noun, hint, placeholder }) => (
        <section className="glass-panel edit-section" key={key} aria-labelledby={`mt-${key}`}>
          <div className="edit-section-head">
            <h3 id={`mt-${key}`} className="edit-section-title">
              {title} <span className="edit-count">({lists[key].length})</span>
            </h3>
            {!readOnly && (
              <button type="button" className="btn btn-outline-azure btn-sm" onClick={() => addLine(key)} disabled={lists[key].length >= MASTER_LIMITS.items}>
                <Plus size={14} /> <span>Add a line</span>
              </button>
            )}
          </div>
          <p className="edit-hint">{hint}</p>
          {lists[key].length === 0 && <p className="edit-hint">No line yet. A new quotation will start with nothing here.</p>}
          <div className="mt-rows">
            {lists[key].map((line, i) => (
              <div className="mt-row" key={i} role="group" aria-label={`${title}, line ${i + 1}`}>
                <span className="mt-bullet" aria-hidden="true">•</span>
                <FormattedLine value={line} placeholder={placeholder} ariaLabel={`${title} ${noun} ${i + 1}`} maxLength={MASTER_LIMITS.text} disabled={readOnly} onChange={(value) => setLine(key, i, value)} />
                {!readOnly && (
                  <span className="mt-tools">
                    <button type="button" className="btn-icon btn-outline" onClick={() => moveLine(key, i, i - 1)} disabled={i === 0} aria-label={`Move ${title} ${noun} ${i + 1} up`} title="Move up">
                      <ArrowUp size={14} />
                    </button>
                    <button type="button" className="btn-icon btn-outline" onClick={() => moveLine(key, i, i + 1)} disabled={i === lists[key].length - 1} aria-label={`Move ${title} ${noun} ${i + 1} down`} title="Move down">
                      <ArrowDown size={14} />
                    </button>
                    <button type="button" className="btn-icon btn-outline mt-remove" onClick={() => removeLine(key, i)} aria-label={`Remove ${title} ${noun} ${i + 1}`} title="Remove this line">
                      <Trash2 size={14} />
                    </button>
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>
      ))}

      <ConfirmDialog
        isOpen={askReset}
        onClose={() => setAskReset(false)}
        onConfirm={backToBuiltIn}
        isDanger
        title="Go back to the built-in text?"
        message="The company's own text is removed and new quotations start with the built-in text again. Quotations that were already made are not changed."
        confirmText={resetting ? 'Going back…' : 'Yes, go back'}
        cancelText="No, keep my text"
      />
    </div>
  );
};

export default MasterTextPage;
