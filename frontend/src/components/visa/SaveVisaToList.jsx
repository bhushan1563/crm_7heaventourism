import React, { useState } from 'react';
import { useToast } from '../../context/ToastContext';
import visaService from '../../services/visaService';
import { getErrorMessage } from '../../services/api';
import { visaItemFromQuotation, visaItemPayload, visaItemProblem } from '../../utils/visaList';
import '../confirmation/confirmation.css';

const keyOf = (visa) => [visa?.country, visa?.visaType, visa?.entryType].map((x) => String(x || '').trim().toLowerCase()).join('|');

/**
 * "Save to the Visa List" for the visa of a quotation: the visa, its documents checklist, fees and inclusions are kept in the Visa
 * List (never the client or the trip), so the same visa can be picked next time and is found under Visas. A visa that is already in
 * the list is not added twice: the server says so in plain words.
 */
export const SaveVisaToList = ({ quotation }) => {
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);
  const [savedKey, setSavedKey] = useState('');
  const form = visaItemFromQuotation(quotation);
  const problem = visaItemProblem(form);
  const key = keyOf(quotation?.visa);
  const saved = Boolean(savedKey) && savedKey === key; // until the country, kind or entry is changed

  const save = async () => {
    if (problem) return showToast(problem, 'error');
    setBusy(true);
    try {
      const res = await visaService.create(visaItemPayload(form));
      if (res.success) {
        setSavedKey(key);
        showToast(`${[form.visa.country.trim(), form.visa.visaType.trim()].filter(Boolean).join(' · ')} was saved to the Visa List. You can pick it in any visa quotation, and find it under Visas.`, 'success');
      } else {
        showToast(res.message || 'The visa could not be saved to the Visa List.', 'error');
      }
    } catch (err) {
      showToast(getErrorMessage(err, 'The visa could not be saved to the Visa List. Please try again.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="cf-banner" role="note" style={{ marginBottom: 16 }}>
      <span>Made this visa for a client? Keep it in the Visa List, so you can pick it next time and find it under Visas. The client and the trip are not saved with it.</span>
      <button type="button" className="btn btn-outline btn-sm" onClick={save} disabled={busy || saved || Boolean(problem)} title={problem || (saved ? 'Already saved' : 'Save the visa, its documents, fees and inclusions')}>
        {busy ? 'Saving…' : saved ? 'Saved to the Visa List' : 'Save to the Visa List'}
      </button>
    </div>
  );
};

export default SaveVisaToList;
