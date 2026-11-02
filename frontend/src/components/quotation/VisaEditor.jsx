import React from 'react';
import { ListChecks, Plus, Trash2 } from 'lucide-react';
import FormattedLine from './FormattedLine';
import { ENTRY_CHOICES, FEE_UNITS, VISA_LIMITS, VISA_MODE_SUGGESTIONS, VISA_TYPE_SUGGESTIONS, addStandardDocuments, blankFee, feeAmount, visaFeeTotal } from '../../utils/visa';
import './visa.css';

const money = (n) => `Rs ${(Number(n) || 0).toLocaleString('en-IN')}`;

/**
 * The two visa tabs. `section="details"` is the visa itself and the documents checklist; `section="fees"` is the fees (the price
 * IS the fees) and what they include. `onChange(patch)` receives the fields that changed (visa, visaFees, visaDocuments, visaInclusions).
 */
// `hideApplicants` is for the visa list: a visa there is priced for one applicant, and the number of applicants belongs to a quotation.
export const VisaEditor = ({ quotation, section, onChange, hideApplicants = false }) => {
  const visa = quotation.visa || {};
  const fees = quotation.visaFees || [];
  const documents = quotation.visaDocuments || [];
  const inclusions = quotation.visaInclusions || [];

  const setVisa = (key, value) => onChange({ visa: { ...visa, [key]: value } });
  const setFee = (index, patch) => onChange({ visaFees: fees.map((f, i) => (i === index ? { ...f, ...patch } : f)) });
  const setLine = (key, list, index, value) => onChange({ [key]: list.map((x, i) => (i === index ? value : x)) });

  const field = (key, label, placeholder, max, extra = {}) => (
    <div className="form-group">
      <label className="form-label" htmlFor={`visa-${key}`}>{label}</label>
      <input id={`visa-${key}`} type="text" className="form-input" value={visa[key] || ''} maxLength={max} placeholder={placeholder} onChange={(e) => setVisa(key, e.target.value)} {...extra} />
    </div>
  );

  const checklist = (key, list, { heading, hint, empty, placeholder, noun, addText, tools }) => (
    <section aria-labelledby={`vz-${key}`}>
      <div className="vz-head">
        <h4 id={`vz-${key}`} className="vz-heading">{heading} ({list.length})</h4>
        <span className="vz-tools">
          {tools}
          <button type="button" className="btn btn-outline-azure btn-sm" onClick={() => onChange({ [key]: [...list, ''] })}>
            <Plus size={14} /> <span>{addText}</span>
          </button>
        </span>
      </div>
      <p className="vz-hint">{hint}</p>
      <div className="vz-list">
        {list.map((item, i) => (
          <div className="vz-item" key={i}>
            <span className="vz-tick" aria-hidden="true">✓</span>
            <FormattedLine value={item} placeholder={placeholder} ariaLabel={`${heading} ${i + 1}`} onChange={(value) => setLine(key, list, i, value)} />
            <button type="button" className="btn btn-danger btn-sm btn-icon" onClick={() => onChange({ [key]: list.filter((_, k) => k !== i) })} aria-label={`Remove ${noun} ${i + 1}`} title={`Remove this ${noun}`}>
              <Trash2 size={13} />
            </button>
          </div>
        ))}
        {list.length === 0 && <p className="vz-hint">{empty}</p>}
      </div>
    </section>
  );

  if (section === 'fees') {
    const applicants = Math.max(1, Number(visa.applicants) || 1);
    const total = visaFeeTotal(fees, applicants);
    return (
      <div className="visa-editor">
        <section aria-labelledby="vz-fees">
          <div className="vz-head">
            <h4 id="vz-fees" className="vz-heading">Fees</h4>
            <button type="button" className="btn btn-outline-azure btn-sm" onClick={() => onChange({ visaFees: [...fees, blankFee()] })} disabled={fees.length >= VISA_LIMITS.fees}>
              <Plus size={14} /> <span>Add a fee</span>
            </button>
          </div>
          <p className="vz-hint">
            {hideApplicants ? (
              <>The usual fees <strong>for one applicant</strong>. In a quotation, a fee marked "Per applicant" is multiplied by the number of applicants and a fee for the "Whole group" is charged once. Leave an amount empty if it changes every time.</>
            ) : (
              <>Worked out for <strong>{applicants} applicant{applicants === 1 ? '' : 's'}</strong> (change this on the "Visa & Documents" tab). A fee marked "Per applicant" is multiplied by the applicants; a fee for the "Whole group" is charged once. The price of the quotation is the total of these lines.</>
            )}
          </p>
          {fees.length === 0 && <p className="vz-hint">No fee yet. Add the visa fee and your service charge to give a price.</p>}
          <div className="vz-rows">
            {fees.map((f, i) => (
              <div className="vz-row" key={i} role="group" aria-label={`Fee ${i + 1}`}>
                <div className="vz-label">
                  <label className="form-label" htmlFor={`fee-label-${i}`}>Fee</label>
                  <input id={`fee-label-${i}`} type="text" className="form-input" value={f.label} maxLength={VISA_LIMITS.label} placeholder="e.g. Visa fee, Service charge" onChange={(e) => setFee(i, { label: e.target.value })} />
                </div>
                <div>
                  <label className="form-label" htmlFor={`fee-amount-${i}`}>Amount (Rs)</label>
                  <input id={`fee-amount-${i}`} type="number" min={0} step="any" className="form-input" value={f.amount} placeholder="e.g. 6500" onChange={(e) => setFee(i, { amount: e.target.value })} />
                </div>
                <div>
                  <label className="form-label" htmlFor={`fee-per-${i}`}>Charged</label>
                  <select id={`fee-per-${i}`} className="form-select" value={f.per === 'group' ? 'group' : 'applicant'} onChange={(e) => setFee(i, { per: e.target.value })}>
                    {FEE_UNITS.map((u) => (
                      <option key={u.value} value={u.value}>
                        {u.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="vz-amount">
                  <span className="form-label">Total</span>
                  <div className="vz-amount-value" aria-live="polite">{feeAmount(f, applicants) > 0 ? money(feeAmount(f, applicants)) : '—'}</div>
                </div>
                <button type="button" className="btn-icon btn-outline vz-remove" onClick={() => onChange({ visaFees: fees.filter((_, k) => k !== i) })} aria-label={`Remove fee ${i + 1}`} title="Remove this fee">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
          <div className="vz-total">
            <span>Total for {applicants} applicant{applicants === 1 ? '' : 's'}</span>
            <strong aria-live="polite">{total > 0 ? money(total) : '—'}</strong>
          </div>
          <div className="form-group">
            <span className="form-label">Price note</span>
            <FormattedLine value={visa.priceNote || ''} maxLength={VISA_LIMITS.note} placeholder="e.g. Embassy fees may change without notice; GST extra" ariaLabel="Price note" onChange={(value) => setVisa('priceNote', value)} />
          </div>
        </section>

        {checklist('visaInclusions', inclusions, {
          heading: 'Visa inclusions',
          hint: 'What your service covers. Press a line to change it or to use bold, colour, highlight or a bigger size.',
          empty: 'Nothing listed. Add what the price includes, such as form filling or a document check.',
          placeholder: 'e.g. Form filling and document check',
          noun: 'inclusion',
          addText: 'Add an inclusion'
        })}
      </div>
    );
  }

  return (
    <div className="visa-editor">
      <section aria-labelledby="vz-visa">
        <h4 id="vz-visa" className="vz-heading">The visa</h4>
        <datalist id="visa-types">
          {VISA_TYPE_SUGGESTIONS.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
        <datalist id="visa-modes">
          {VISA_MODE_SUGGESTIONS.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
        <div className="vz-grid">
          <div className="vz-wide">{field('country', 'Country *', 'e.g. United Arab Emirates', VISA_LIMITS.text)}</div>
          {field('visaType', 'Visa type', 'e.g. Tourist', VISA_LIMITS.text, { list: 'visa-types' })}
          <div className="form-group">
            <label className="form-label" htmlFor="visa-entryType">Entry type</label>
            <select id="visa-entryType" className="form-select" value={visa.entryType || ''} onChange={(e) => setVisa('entryType', e.target.value)}>
              {ENTRY_CHOICES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          {field('mode', 'How the visa is issued', 'e.g. e-Visa', VISA_LIMITS.text, { list: 'visa-modes' })}
          {field('processingTime', 'Processing time', 'e.g. 3 to 5 working days', VISA_LIMITS.text)}
          {field('validity', 'Validity', 'e.g. 60 days from issue', VISA_LIMITS.text)}
          {field('stay', 'Length of stay', 'e.g. 30 days per visit', VISA_LIMITS.text)}
          {!hideApplicants && (
          <div className="form-group">
            <label className="form-label" htmlFor="visa-applicants">Number of applicants *</label>
            <input id="visa-applicants" type="number" min={1} max={VISA_LIMITS.applicants} className="form-input" value={visa.applicants ?? ''} onChange={(e) => setVisa('applicants', e.target.value)} />
          </div>
          )}
        </div>
      </section>

      {checklist('visaDocuments', documents, {
        heading: 'Documents required',
        hint: 'The checklist the traveller sees. It starts empty because the documents depend on the country and the visa type. Press a line to change it or to use bold, colour, highlight or a bigger size.',
        empty: 'No document listed yet. Add them one by one, or start from the standard checklist and edit it.',
        placeholder: 'e.g. Passport valid for at least 6 months',
        noun: 'document',
        addText: 'Add a document',
        tools: (
          <button type="button" className="btn btn-outline btn-sm" onClick={() => onChange({ visaDocuments: addStandardDocuments(documents) })} title="Add the usual documents to the list (lines already there are not repeated)">
            <ListChecks size={13} /> <span>Add the standard checklist</span>
          </button>
        )
      })}
    </div>
  );
};

export default VisaEditor;
