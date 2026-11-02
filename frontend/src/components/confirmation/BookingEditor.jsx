import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import LazyRichTextEditor from '../LazyRichTextEditor';
import { CONFIRMATION_LIMITS as L, balanceOf, blankDetail, blankTraveller } from '../../utils/confirmation';
import '../../pages/itineraries.css';
import './confirmation.css';

const money = (n) => `Rs ${(Number(n) || 0).toLocaleString('en-IN')}`;

/**
 * The booking information of a confirmation: travel date and travellers, payment, additional details (label + value, for whatever
 * the company wants to record) and notes. `form` is what `formFromConfirmation` returns; `onChange(patch)` receives the parts that
 * changed; `errors` is what `bookingErrors` returns, shown next to the field that needs fixing.
 */
export const BookingEditor = ({ form, errors = {}, onChange, readOnly = false }) => {
  const setTraveller = (index, patch) => onChange({ travellers: form.travellers.map((t, i) => (i === index ? { ...t, ...patch } : t)) });
  const setDetail = (index, patch) => onChange({ customFields: form.customFields.map((d, i) => (i === index ? { ...d, ...patch } : d)) });
  const setPayment = (patch) => onChange({ payment: { ...form.payment, ...patch } });
  const balance = balanceOf(form.payment);

  const error = (key) => errors[key] && <p className="field-error" id={`error-${key}`} role="alert">{errors[key]}</p>;
  const invalid = (key) => ({ 'aria-invalid': Boolean(errors[key]), 'aria-describedby': errors[key] ? `error-${key}` : undefined });

  return (
    <div className="booking-editor">
      <section className="glass-panel edit-section" aria-labelledby="be-travellers">
        <div className="edit-section-head">
          <h3 id="be-travellers" className="edit-section-title">Travellers <span className="edit-count">({form.travellers.length})</span></h3>
          {!readOnly && (
            <button type="button" className="btn btn-outline-azure btn-sm" onClick={() => onChange({ travellers: [...form.travellers, blankTraveller()] })} disabled={form.travellers.length >= L.travellers}>
              <Plus size={14} /> <span>Add a traveller</span>
            </button>
          )}
        </div>
        <div className="form-group be-date">
          <label className="form-label" htmlFor="travelDate">Travel date</label>
          <input id="travelDate" type="date" className="form-input" value={form.travelDate} disabled={readOnly} onChange={(e) => onChange({ travelDate: e.target.value })} {...invalid('travelDate')} />
          {error('travelDate')}
        </div>
        {form.travellers.length === 0 && <p className="edit-hint">No traveller added yet. Add each person travelling, with their passport number if you have it.</p>}
        <div className="be-rows">
          {form.travellers.map((t, i) => (
            <div className="be-traveller" key={i} role="group" aria-label={`Traveller ${i + 1}`}>
              <div className="be-name">
                <label className="form-label" htmlFor={`traveller-${i}-name`}>Name</label>
                <input id={`traveller-${i}-name`} type="text" className="form-input" value={t.name} maxLength={L.name} disabled={readOnly} placeholder="Name as on the passport" onChange={(e) => setTraveller(i, { name: e.target.value })} {...invalid(`traveller-${i}-name`)} />
                {error(`traveller-${i}-name`)}
              </div>
              <div>
                <label className="form-label" htmlFor={`traveller-${i}-age`}>Age</label>
                <input id={`traveller-${i}-age`} type="number" min={0} max={L.maxAge} className="form-input" value={t.age} disabled={readOnly} onChange={(e) => setTraveller(i, { age: e.target.value })} {...invalid(`traveller-${i}-age`)} />
                {error(`traveller-${i}-age`)}
              </div>
              <div>
                <label className="form-label" htmlFor={`traveller-${i}-passport`}>Passport number</label>
                <input id={`traveller-${i}-passport`} type="text" className="form-input" value={t.passportNo} maxLength={L.passport + 20} disabled={readOnly} onChange={(e) => setTraveller(i, { passportNo: e.target.value })} {...invalid(`traveller-${i}-passport`)} />
                {error(`traveller-${i}-passport`)}
              </div>
              {!readOnly && (
                <button type="button" className="btn-icon btn-outline be-remove" onClick={() => onChange({ travellers: form.travellers.filter((_, k) => k !== i) })} aria-label={`Remove traveller ${i + 1}`} title="Remove this traveller">
                  <Trash2 size={14} />
                </button>
              )}
              <div className="be-note">
                <input type="text" className="form-input" value={t.notes} maxLength={L.note} disabled={readOnly} placeholder="Note (optional), e.g. vegetarian, needs a wheelchair" aria-label={`Note for traveller ${i + 1}`} onChange={(e) => setTraveller(i, { notes: e.target.value })} />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="glass-panel edit-section" aria-labelledby="be-payment">
        <h3 id="be-payment" className="edit-section-title">Payment</h3>
        <p className="edit-hint">The total starts as the price of the quotation. Change it if the final price was agreed differently.</p>
        <div className="be-pay-grid">
          <div className="form-group">
            <label className="form-label" htmlFor="payment-total">Total amount (Rs)</label>
            <input id="payment-total" type="number" min={0} step="any" className="form-input" value={form.payment.totalAmount} disabled={readOnly} onChange={(e) => setPayment({ totalAmount: e.target.value })} {...invalid('payment-total')} />
            {error('payment-total')}
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="payment-received">Received so far (Rs)</label>
            <input id="payment-received" type="number" min={0} step="any" className="form-input" value={form.payment.received} disabled={readOnly} onChange={(e) => setPayment({ received: e.target.value })} {...invalid('payment-received')} />
            {error('payment-received')}
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="payment-date">Balance due by</label>
            <input id="payment-date" type="date" className="form-input" value={form.payment.balanceDueDate} disabled={readOnly} onChange={(e) => setPayment({ balanceDueDate: e.target.value })} {...invalid('payment-date')} />
            {error('payment-date')}
          </div>
        </div>
        <div className={`be-balance${balance > 0 ? '' : balance < 0 ? ' is-over' : ' is-clear'}`} aria-live="polite">
          <span>{balance > 0 ? 'Balance to pay' : balance < 0 ? 'Received is more than the total by' : (Number(form.payment.totalAmount) || 0) > 0 ? 'Fully paid' : 'No amount due'}</span>
          <strong>{money(Math.abs(balance))}</strong>
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="payment-note">Payment note</label>
          <input id="payment-note" type="text" className="form-input" value={form.payment.note} maxLength={L.paymentNote} disabled={readOnly} placeholder="e.g. Advance received by bank transfer on 5 March" onChange={(e) => setPayment({ note: e.target.value })} />
        </div>
      </section>

      <section className="glass-panel edit-section" aria-labelledby="be-details">
        <div className="edit-section-head">
          <h3 id="be-details" className="edit-section-title">Additional details <span className="edit-count">({form.customFields.length})</span></h3>
          {!readOnly && (
            <button type="button" className="btn btn-outline-azure btn-sm" onClick={() => onChange({ customFields: [...form.customFields, blankDetail()] })} disabled={form.customFields.length >= L.customFields}>
              <Plus size={14} /> <span>Add a detail</span>
            </button>
          )}
        </div>
        <p className="edit-hint">Anything else you want on this booking, as a label and a value: a hotel voucher number, the driver's name, a flight PNR, an emergency contact.</p>
        {form.customFields.length === 0 && <p className="edit-hint">No additional detail yet.</p>}
        <div className="be-rows">
          {form.customFields.map((d, i) => (
            <div className="be-detail" key={i} role="group" aria-label={`Additional detail ${i + 1}`}>
              <div>
                <label className="form-label" htmlFor={`detail-${i}-label`}>Label</label>
                <input id={`detail-${i}-label`} type="text" className="form-input" value={d.label} maxLength={L.label + 20} disabled={readOnly} placeholder="e.g. Hotel voucher no." onChange={(e) => setDetail(i, { label: e.target.value })} {...invalid(`detail-${i}-label`)} />
                {error(`detail-${i}-label`)}
              </div>
              <div>
                <label className="form-label" htmlFor={`detail-${i}-value`}>Value</label>
                <input id={`detail-${i}-value`} type="text" className="form-input" value={d.value} maxLength={L.value + 20} disabled={readOnly} onChange={(e) => setDetail(i, { value: e.target.value })} {...invalid(`detail-${i}-value`)} />
                {error(`detail-${i}-value`)}
              </div>
              {!readOnly && (
                <button type="button" className="btn-icon btn-outline be-remove" onClick={() => onChange({ customFields: form.customFields.filter((_, k) => k !== i) })} aria-label={`Remove additional detail ${i + 1}`} title="Remove this detail">
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="glass-panel edit-section" aria-labelledby="be-notes">
        <h3 id="be-notes" className="edit-section-title">Notes</h3>
        <p className="edit-hint">Printed on the confirmation, for the client. Use bold, colour or highlight for what matters.</p>
        <LazyRichTextEditor value={form.notes} onChange={(notes) => onChange({ notes })} maxLength={L.notes} minHeight={110} ariaLabel="Notes" placeholder="e.g. Airport pick-up at 10:30. Please carry a printed copy of this confirmation." disabled={readOnly} />
      </section>
    </div>
  );
};

export default BookingEditor;
