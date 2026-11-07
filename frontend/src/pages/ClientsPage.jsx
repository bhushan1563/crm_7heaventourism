import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Copy, ExternalLink, Loader2, Mail, MessageCircle, Pencil, Phone, Plus, RefreshCw, Search, Trash2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import clientService from '../services/clientService';
import { getErrorMessage } from '../services/api';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import { formatDate } from '../utils/dateHelper';
import { CLIENT_LIMITS as L, CLIENT_SOURCES, blankClient, clientErrors, clientForm, clientPayload, matchesClient, uniqueEmails, whatsappUrl } from '../utils/clients';
import './itineraries.css';
import './clients.css';

const TABS = [['current', 'Current clients'], ['future', 'Future clients']];
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const none = <span className="cl-none">–</span>;

const Phones = ({ numbers }) => (numbers.length ? numbers.map((p) => {
  const wa = whatsappUrl(p);
  return (
    <div className="cl-line" key={p}>
      <Phone size={12} aria-hidden="true" />
      <span>{p}</span>
      {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className="cl-icon" aria-label={`WhatsApp ${p}`} title="Open in WhatsApp"><MessageCircle size={13} /></a>}
    </div>
  );
}) : none);

const Emails = ({ addresses }) => (addresses.length ? addresses.map((a) => (
  <div className="cl-line" key={a}>
    <Mail size={12} aria-hidden="true" />
    <a href={`mailto:${a}`} className="cl-mail">{a}</a>
  </div>
)) : none);

/** The clients: everyone we already have (inquiries and bookings, one entry per person) and the future clients kept by hand. */
export const ClientsPage = () => {
  const { can, canEditRecord } = useAuth();
  const { showToast } = useToast();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'future' ? 'future' : 'current';

  const [current, setCurrent] = useState({ rows: [], sources: { guests: true, confirmations: true }, error: '' });
  const [future, setFuture] = useState({ rows: [], error: '' });
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState(null); // { id, form } while the form is open; id is '' for a new client
  const [editingCurrent, setEditingCurrent] = useState(null); // { client, name, phone, email } for editing current client contact
  const [shownErrors, setShownErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [now, later] = await Promise.all([
      clientService.getCurrent().catch((err) => ({ success: false, message: getErrorMessage(err, 'The clients could not be loaded.') })),
      clientService.getFuture().catch((err) => ({ success: false, message: getErrorMessage(err, 'The future clients could not be loaded.') }))
    ]);
    setCurrent((c) => (now.success ? { rows: now.data, sources: now.sources || c.sources, error: '' } : { ...c, error: now.message || 'The clients could not be loaded.' }));
    setFuture((f) => (later.success ? { rows: later.data, error: '' } : { ...f, error: later.message || 'The future clients could not be loaded.' }));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const shownCurrent = useMemo(() => current.rows.filter((c) => matchesClient(c, query)), [current.rows, query]);
  const shownFuture = useMemo(() => future.rows.filter((c) => matchesClient(c, query)), [future.rows, query]);
  const shown = tab === 'current' ? shownCurrent : shownFuture;
  const hiddenSources = Object.entries({ 'guest inquiries': current.sources.guests, bookings: current.sources.confirmations }).filter(([, ok]) => !ok).map(([name]) => name);

  const open = (c) => {
    setShownErrors({});
    setEditing(c ? { id: c._id, form: clientForm(c) } : { id: '', form: blankClient() });
  };
  const setField = (patch) => setEditing((e) => ({ ...e, form: { ...e.form, ...patch } }));
  const errors = editing ? clientErrors(editing.form) : {};

  const save = async (e) => {
    e.preventDefault();
    if (Object.keys(errors).length) {
      setShownErrors(errors);
      return;
    }
    setSaving(true);
    try {
      const body = clientPayload(editing.form);
      const res = editing.id ? await clientService.updateFuture(editing.id, body) : await clientService.createFuture(body);
      if (res.success) {
        showToast(res.message || 'Saved.', 'success');
        setEditing(null);
        load();
      } else {
        showToast(res.message || 'The client could not be saved.', 'error');
      }
    } catch (err) {
      showToast(getErrorMessage(err, 'The client could not be saved.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const saveCurrentContact = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await clientService.updateCurrentContact({
        guestId: editingCurrent.client.guestId,
        confirmationId: editingCurrent.client.confirmationId,
        name: editingCurrent.name,
        phone: editingCurrent.phone,
        email: editingCurrent.email
      });
      if (res.success) {
        showToast(res.message || 'Contact details saved.', 'success');
        setEditingCurrent(null);
        load();
      } else {
        showToast(res.message || 'The contact details could not be saved.', 'error');
      }
    } catch (err) {
      showToast(getErrorMessage(err, 'The contact details could not be saved.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setSaving(true);
    try {
      const res = await clientService.deleteFuture(removing._id);
      if (res.success) {
        showToast(res.message || 'Client removed.', 'info');
        setRemoving(null);
        load();
      } else {
        showToast(res.message || 'The client could not be removed.', 'error');
      }
    } catch (err) {
      showToast(getErrorMessage(err, 'The client could not be removed.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const copyEmails = async () => {
    const list = uniqueEmails(shown);
    if (!list.length) {
      showToast('There are no e-mail addresses to copy here.', 'info');
      return;
    }
    try {
      await navigator.clipboard.writeText(list.join('; '));
      showToast(`Copied ${plural(list.length, 'e-mail address', 'e-mail addresses')}.`, 'success');
    } catch {
      showToast('Could not copy. Please select the addresses and copy them yourself.', 'error');
    }
  };

  const err = tab === 'current' ? current.error : future.error;
  const field = (key, label, props = {}) => (
    <div className="form-group">
      <label className="form-label" htmlFor={`client-${key}`}>{label}</label>
      <input id={`client-${key}`} className="form-input" value={editing.form[key]} maxLength={L[key] + 20} onChange={(e) => setField({ [key]: e.target.value })} aria-invalid={Boolean(shownErrors[key])} aria-describedby={shownErrors[key] ? `client-${key}-error` : undefined} {...props} />
      {shownErrors[key] && <p className="field-error" id={`client-${key}-error`} role="alert">{shownErrors[key]}</p>}
    </div>
  );

  return (
    <div className="itin-page clients-page">
      <div className="page-header animate-fade-in">
        <div className="page-header-text">
          <div className="page-title-row">
            <h2 className="page-title">Clients</h2>
            <span className="count-chip">{plural(shown.length, 'client', 'clients')}</span>
          </div>
          <p className="page-subtitle">Everyone we already work with, with all their e-mail addresses and numbers, and the people who may travel with us one day.</p>
        </div>
        <div className="page-actions">
          <button type="button" className="btn btn-outline" onClick={copyEmails} title="Copy the e-mail addresses shown, to paste into a mail"><Copy size={15} /> <span>Copy e-mails</span></button>
          {tab === 'future' && (can('guest_list', 'canCreate')
            ? <button type="button" className="btn btn-primary" onClick={() => open(null)}><Plus size={16} /> <span>Add future client</span></button>
            : <button type="button" className="btn btn-outline" disabled title="No Create Permission"><Plus size={16} /> <span>Add future client</span></button>)}
          <button type="button" className="btn-icon btn-outline" onClick={load} aria-label="Refresh the clients" title="Refresh"><RefreshCw size={15} className={loading ? 'animate-spin' : ''} /></button>
        </div>
      </div>

      <div className="cl-bar glass-panel">
        <div className="itin-tabs" role="tablist" aria-label="Clients">
          {TABS.map(([value, label]) => (
            <button key={value} type="button" role="tab" aria-selected={tab === value} className={tab === value ? 'is-active' : ''} onClick={() => setParams({ tab: value }, { replace: true })}>
              {label} <span className="cl-count">{value === 'current' ? current.rows.length : future.rows.length}</span>
            </button>
          ))}
        </div>
        <div className="itin-search cl-search">
          <Search size={15} aria-hidden="true" />
          <input type="search" className="form-input" placeholder="Search name, e-mail, number, place…" aria-label="Search the clients" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>

      {tab === 'current' && hiddenSources.length > 0 && <p className="cl-note">The {hiddenSources.join(' and ')} are not included: you do not have access to them.</p>}
      {err && <div className="cl-alert" role="alert"><p>{err}</p><button type="button" className="btn btn-outline btn-sm" onClick={load}><RefreshCw size={14} /> Try again</button></div>}

      <div className="table-container">
        {tab === 'current' ? (
          <table className="luxury-table table-stack" aria-label="Current clients">
            <thead>
              <tr><th>Client</th><th>E-mail</th><th>Phone</th><th>Trips</th><th>Latest trip</th><th>Sales</th><th><span className="cl-sr">Open</span></th></tr>
            </thead>
            <tbody>
              {loading && !current.rows.length ? (
                <tr><td colSpan="7" className="cl-empty"><Loader2 size={16} className="animate-spin" /> Loading the clients…</td></tr>
              ) : shownCurrent.length === 0 ? (
                <tr><td colSpan="7" className="cl-empty">{current.rows.length ? 'No client matches the search.' : 'No clients yet. They appear here as inquiries and bookings are added.'}</td></tr>
              ) : shownCurrent.map((c) => (
                <tr key={c.id}>
                  <td data-label="Client"><strong>{c.name}</strong></td>
                  <td data-label="E-mail"><Emails addresses={c.emails} /></td>
                  <td data-label="Phone"><Phones numbers={c.phones} /></td>
                  <td data-label="Trips">
                    <div>{plural(c.inquiries, 'inquiry', 'inquiries')}</div>
                    <div className="cl-sub">{plural(c.bookings, 'booking', 'bookings')}</div>
                  </td>
                  <td data-label="Latest trip">
                    <div>{[c.destination, c.travelDate && formatDate(c.travelDate)].filter(Boolean).join(' · ') || none}</div>
                    {c.status && <div className="cl-sub">{c.status}</div>}
                  </td>
                  <td data-label="Sales">{c.sales || none}</td>
                  <td data-label="">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
                      {can('guest_list', 'canUpdate') && (
                        <button
                          type="button"
                          className="btn-icon btn-outline btn-sm"
                          onClick={() => setEditingCurrent({ client: c, name: c.name || '', phone: (c.phones || [])[0] || '', email: (c.emails || [])[0] || '' })}
                          aria-label={`Edit contact for ${c.name}`}
                          title="Edit contact details"
                        >
                          <Pencil size={13} />
                        </button>
                      )}
                      {c.confirmationId
                        ? <Link to={`/confirmations/${c.confirmationId}`} className="cl-open"><ExternalLink size={13} /> Booking</Link>
                        : c.guestId ? <Link to="/guests" className="cl-open"><ExternalLink size={13} /> Guest list</Link> : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="luxury-table table-stack" aria-label="Future clients">
            <thead>
              <tr><th>Client</th><th>Contact</th><th>Interested in</th><th>Source</th><th>Notes</th><th style={{ textAlign: 'right' }}>Actions</th></tr>
            </thead>
            <tbody>
              {loading && !future.rows.length ? (
                <tr><td colSpan="6" className="cl-empty"><Loader2 size={16} className="animate-spin" /> Loading the future clients…</td></tr>
              ) : shownFuture.length === 0 ? (
                <tr><td colSpan="6" className="cl-empty">{future.rows.length ? 'No client matches the search.' : 'No future client yet. Use “Add future client” to keep the details of someone who may travel with us.'}</td></tr>
              ) : shownFuture.map((c) => {
                const editable = canEditRecord('guest_list', c);
                return (
                  <tr key={c._id}>
                    <td data-label="Client">
                      <strong>{c.name}</strong>
                      <div className="cl-sub">Added by {c.createdByName || 'Admin'}</div>
                    </td>
                    <td data-label="Contact">
                      <Phones numbers={c.phone ? [c.phone] : []} />
                      <Emails addresses={c.email ? [c.email] : []} />
                    </td>
                    <td data-label="Interested in">
                      <div>{c.destination || none}</div>
                      {(c.expectedTravel || c.budget) && <div className="cl-sub">{[c.expectedTravel, c.budget && `Budget ${c.budget}`].filter(Boolean).join(' · ')}</div>}
                    </td>
                    <td data-label="Source">{c.source || none}</td>
                    <td data-label="Notes"><span className="cl-notes">{c.notes || none}</span></td>
                    <td data-label="">
                      <div className="cl-actions">
                        {editable && can('guest_list', 'canUpdate') && <button type="button" className="btn-icon btn-outline" onClick={() => open(c)} aria-label={`Edit ${c.name}`} title="Edit"><Pencil size={14} /></button>}
                        {editable && can('guest_list', 'canDelete') && <button type="button" className="btn-icon btn-outline cl-danger" onClick={() => setRemoving(c)} aria-label={`Remove ${c.name}`} title="Remove"><Trash2 size={14} /></button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <Modal isOpen={Boolean(editing)} onClose={() => setEditing(null)} title={editing?.id ? 'Edit future client' : 'Add a future client'} subtitle="Someone who may travel with us one day. Only the name is needed." maxWidth="620px">
        {editing && (
          <form onSubmit={save} noValidate>
            {field('name', 'Name *', { placeholder: 'Full name', autoFocus: true })}
            <div className="cl-form-grid">
              {field('phone', 'Phone / WhatsApp number', { type: 'tel', placeholder: 'e.g. +91 98765 43210' })}
              {field('email', 'E-mail', { type: 'email', placeholder: 'name@example.com' })}
              {field('destination', 'Interested in (place)', { placeholder: 'e.g. Bali' })}
              {field('expectedTravel', 'When they want to travel', { placeholder: 'e.g. December 2026' })}
              {field('budget', 'Budget', { placeholder: 'e.g. 2 lakh' })}
              <div className="form-group">
                <label className="form-label" htmlFor="client-source">Where they came from</label>
                <select id="client-source" className="form-select" value={editing.form.source} onChange={(e) => setField({ source: e.target.value })}>
                  <option value="">Not noted</option>
                  {CLIENT_SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
                  {editing.form.source && !CLIENT_SOURCES.includes(editing.form.source) && <option value={editing.form.source}>{editing.form.source}</option>}
                </select>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="client-notes">Notes</label>
              <textarea id="client-notes" className="form-textarea" rows={3} value={editing.form.notes} maxLength={L.notes + 50} placeholder="Anything worth remembering: how many people, what they like, when to call" onChange={(e) => setField({ notes: e.target.value })} />
              {shownErrors.notes && <p className="field-error" role="alert">{shownErrors.notes}</p>}
            </div>
            <div className="cl-form-foot">
              <button type="button" className="btn btn-outline" onClick={() => setEditing(null)} disabled={saving}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : editing.id ? 'Save changes' : 'Add client'}</button>
            </div>
          </form>
        )}
      </Modal>

      <Modal isOpen={Boolean(editingCurrent)} onClose={() => setEditingCurrent(null)} title="Edit contact details" subtitle="Update phone number, e-mail or name for this client." maxWidth="500px">
        {editingCurrent && (
          <form onSubmit={saveCurrentContact}>
            <div className="form-group">
              <label className="form-label" htmlFor="edit-curr-name">Client name *</label>
              <input
                id="edit-curr-name"
                className="form-input"
                value={editingCurrent.name}
                onChange={(e) => setEditingCurrent((prev) => ({ ...prev, name: e.target.value }))}
                required
                autoFocus
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="edit-curr-phone">Phone / WhatsApp number</label>
              <input
                id="edit-curr-phone"
                type="tel"
                className="form-input"
                placeholder="e.g. +91 98765 43210"
                value={editingCurrent.phone}
                onChange={(e) => setEditingCurrent((prev) => ({ ...prev, phone: e.target.value }))}
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="edit-curr-email">E-mail address</label>
              <input
                id="edit-curr-email"
                type="email"
                className="form-input"
                placeholder="name@example.com"
                value={editingCurrent.email}
                onChange={(e) => setEditingCurrent((prev) => ({ ...prev, email: e.target.value }))}
              />
            </div>
            <div className="cl-form-foot" style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
              <button type="button" className="btn btn-outline" onClick={() => setEditingCurrent(null)} disabled={saving}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Saving…' : 'Save contact'}
              </button>
            </div>
          </form>
        )}
      </Modal>

      <ConfirmDialog isOpen={Boolean(removing)} onClose={() => setRemoving(null)} onConfirm={remove} title="Remove this client?" message={`${removing?.name || 'This client'} will be removed from the future clients. This cannot be undone.`} confirmText="Remove" isDanger isLoading={saving} />
    </div>
  );
};

export default ClientsPage;
