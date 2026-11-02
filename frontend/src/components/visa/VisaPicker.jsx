import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Search, Stamp } from 'lucide-react';
import Modal from '../Modal';
import visaService from '../../services/visaService';
import { getErrorMessage } from '../../services/api';
import { feeSummary } from '../../utils/visaList';

/**
 * Choose a visa from the visa list to fill a visa quotation. `onPick(visa)` receives the whole visa (with its checklist and
 * inclusions), not just the row of the list.
 */
export const VisaPicker = ({ isOpen, onClose, onPick }) => {
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false); // the first answer has arrived: only then can the list be called empty
  const [picking, setPicking] = useState('');
  const [error, setError] = useState('');
  const latest = useRef(0);

  useEffect(() => {
    if (!isOpen) return undefined;
    const request = ++latest.current;
    const timer = setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        const res = await visaService.list({ search: search.trim() || undefined, status: 'Active', limit: 20 });
        if (request !== latest.current) return;
        if (res.success) setRows(res.data);
        else setError(res.message || 'The visa list could not be loaded.');
      } catch (err) {
        if (request === latest.current) setError(getErrorMessage(err, 'The visa list could not be loaded.'));
      } finally {
        if (request === latest.current) {
          setLoading(false);
          setLoaded(true);
        }
      }
    }, search ? 250 : 0);
    return () => clearTimeout(timer);
  }, [isOpen, search]);

  useEffect(() => {
    if (isOpen) {
      setSearch('');
      setPicking('');
      setLoaded(false);
    }
  }, [isOpen]);

  const choose = async (row) => {
    setPicking(row._id);
    setError('');
    try {
      const res = await visaService.get(row._id);
      if (res.success) onPick(res.data);
      else setError(res.message || 'That visa could not be opened.');
    } catch (err) {
      setError(getErrorMessage(err, 'That visa could not be opened.'));
    } finally {
      setPicking('');
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Choose a visa from the list" subtitle="Its details, documents checklist, usual fees and inclusions fill this quotation." maxWidth="620px">
      <div className="itin-search" style={{ marginBottom: 12 }}>
        <Search size={16} aria-hidden="true" />
        <input type="search" className="form-input" placeholder="Search country, visa type or entry…" aria-label="Search the visa list" value={search} onChange={(e) => setSearch(e.target.value)} autoFocus />
      </div>
      {error && <p className="field-error" role="alert">{error}</p>}
      {!loaded ? (
        <p style={{ textAlign: 'center' }} aria-busy="true"><Loader2 size={18} className="animate-spin" /> Loading…</p>
      ) : rows.length === 0 ? (
        <div className="itin-state" style={{ padding: '24px 12px' }}>
          <Stamp size={26} aria-hidden="true" />
          <p>{search ? 'No visa matches that search.' : 'The visa list is empty. Add visas from the Visa List in the menu.'}</p>
        </div>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '50vh', overflowY: 'auto' }}>
          {rows.map((row) => (
            <li key={row._id}>
              <button type="button" className="cf-option" style={{ width: '100%', textAlign: 'left' }} onClick={() => choose(row)} disabled={Boolean(picking)} aria-label={`Use ${[row.country, row.visaType, row.entryType].filter(Boolean).join(', ')}`}>
                <span style={{ flex: 1 }}>
                  <span className="cf-option-name">{row.country}{row.visaType ? ` · ${row.visaType}` : ''}{row.entryType ? ` · ${row.entryType}` : ''}</span>
                  <span className="cf-option-meta" style={{ display: 'block' }}>{[row.mode, row.processingTime, `${row.documentCount} ${row.documentCount === 1 ? 'document' : 'documents'}`].filter(Boolean).join(' · ')}</span>
                  <span className="cf-option-meta" style={{ display: 'block' }}>{feeSummary(row.fees)}</span>
                </span>
                {picking === row._id && <Loader2 size={16} className="animate-spin" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
};

export default VisaPicker;
