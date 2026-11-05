import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import LazyRichTextEditor from '../LazyRichTextEditor';
import { CONFIRMATION_LIMITS as L, CONTACT_ROLES, balanceOf, blankDetail, blankTraveller } from '../../utils/confirmation';
import '../../pages/itineraries.css';
import './confirmation.css';

const money = (n) => `Rs ${(Number(n) || 0).toLocaleString('en-IN')}`;

/**
 * The booking information of a confirmation: travel date and travellers, payment, additional details (label + value, for whatever
 * the company wants to record) and notes. `form` is what `formFromConfirmation` returns; `onChange(patch)` receives the parts that
 * changed; `errors` is what `bookingErrors` returns, shown next to the field that needs fixing. `hotels` are the hotels of the copy of
 * the quotation (for their names); the form holds one entry of details for each.
 */
export const BookingEditor = ({ form, errors = {}, onChange, readOnly = false, hotels = [] }) => {
  const setHotel = (index, patch) => onChange({ hotelBookings: form.hotelBookings.map((h, i) => (i === index ? { ...h, ...patch } : h)) });
  const setTraveller =(index, patch) => onChange({ travellers: form.travellers.map((t, i) => (i === index ? { ...t, ...patch } : t)) });
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

      {form.hotelBookings.length > 0 && (
        <section className="glass-panel edit-section" aria-labelledby="be-hotels">
          <h3 id="be-hotels" className="edit-section-title">Hotels <span className="edit-count">({form.hotelBookings.length})</span></h3>
          <p className="edit-hint">What each hotel gave once the room was booked. They are printed on the confirmation: the hotel's confirmation number under its name, its contact number after the address, and the times after the check-in and check-out dates. The contact number and times start from the hotel list.</p>
          <div className="be-rows">
            {form.hotelBookings.map((h, i) => {
              const stay = hotels[i] || {};
              return (
                <div className="be-hotel" key={i} role="group" aria-label={`Hotel ${i + 1}: ${stay.hotelName || 'hotel'}`}>
                  <div className="be-hotel-name">
                    {stay.hotelName || `Hotel ${i + 1}`}
                    {stay.starRating ? <small> · {stay.starRating}</small> : null}
                    {stay.city ? <small> · {stay.city}</small> : null}
                  </div>
                  <div className="be-hotel-info">
                    {stay.checkInDate && <span>Check-in: <strong>{new Date(stay.checkInDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</strong></span>}
                    {stay.checkOutDate && <span>Check-out: <strong>{new Date(stay.checkOutDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</strong></span>}
                    {stay.nights && <span>Nights: <strong>{stay.nights}</strong></span>}
                    {stay.roomCategory && <span>Room: <strong>{stay.roomCategory}</strong></span>}
                    {stay.mealPlan && <span>Meal: <strong>{stay.mealPlan}</strong></span>}
                    {stay.noOfRooms && <span>Rooms: <strong>{stay.noOfRooms}</strong></span>}
                    {stay.address && <span style={{ gridColumn: '1 / -1' }}>📍 <strong>{stay.address}{stay.city && !stay.address.includes(stay.city) ? `, ${stay.city}` : ''}</strong></span>}
                  </div>
                  <div className="be-hotel-grid">
                    <div>
                      <label className="form-label" htmlFor={`hotel-${i}-no`}>Hotel confirmation number</label>
                      <input id={`hotel-${i}-no`} type="text" className="form-input" value={h.confirmationNo} maxLength={L.hotelNo + 20} disabled={readOnly} placeholder="As given by the hotel" onChange={(e) => setHotel(i, { confirmationNo: e.target.value })} {...invalid(`hotel-${i}-no`)} />
                      {error(`hotel-${i}-no`)}
                    </div>
                    <div>
                      <label className="form-label" htmlFor={`hotel-${i}-phone`}>Hotel contact number</label>
                      <input id={`hotel-${i}-phone`} type="text" className="form-input" value={h.contactNumber} maxLength={L.hotelPhone + 20} disabled={readOnly} placeholder="e.g. +91 294 242 8800" onChange={(e) => setHotel(i, { contactNumber: e.target.value })} {...invalid(`hotel-${i}-phone`)} />
                      {error(`hotel-${i}-phone`)}
                    </div>
                    <div>
                      <label className="form-label" htmlFor={`hotel-${i}-in`}>Check-in time</label>
                      <input id={`hotel-${i}-in`} type="time" className="form-input" value={h.checkInTime} disabled={readOnly} onChange={(e) => setHotel(i, { checkInTime: e.target.value })} {...invalid(`hotel-${i}-in`)} />
                      {error(`hotel-${i}-in`)}
                    </div>
                    <div>
                      <label className="form-label" htmlFor={`hotel-${i}-out`}>Check-out time</label>
                      <input id={`hotel-${i}-out`} type="time" className="form-input" value={h.checkOutTime} disabled={readOnly} onChange={(e) => setHotel(i, { checkOutTime: e.target.value })} {...invalid(`hotel-${i}-out`)} />
                      {error(`hotel-${i}-out`)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="glass-panel edit-section" aria-labelledby="be-contacts">
        <h3 id="be-contacts" className="edit-section-title">Contacts on the trip</h3>
        <p className="edit-hint">Who the guests can call during the trip. They are printed on the confirmation, each person's numbers one under the other. Add as many numbers as needed (up to {L.contactNumbers}).</p>
        <div className="be-contacts">
          {CONTACT_ROLES.map(([key, label]) => {
            const person = form.contacts?.[key] || { name: '', numbers: [''] };
            const numbers = person.numbers?.length ? person.numbers : [''];
            const setPerson = (patch) => onChange({ contacts: { ...form.contacts, [key]: { ...person, numbers, ...patch } } });
            const setNumber = (i, value) => setPerson({ numbers: numbers.map((n, k) => (k === i ? value : n)) });
            const removeNumber = (i) => setPerson({ numbers: numbers.length > 1 ? numbers.filter((_, k) => k !== i) : [''] });
            return (
              <div className="be-contact" key={key} role="group" aria-label={label}>
                <div className="be-contact-title">{label}</div>
                <div className="form-group">
                  <label className="form-label" htmlFor={`contact-${key}-name`}>{label} name</label>
                  <input id={`contact-${key}-name`} type="text" className="form-input" value={person.name} maxLength={L.name} disabled={readOnly} placeholder="Full name" onChange={(e) => setPerson({ name: e.target.value })} {...invalid(`contact-${key}-name`)} />
                  {error(`contact-${key}-name`)}
                </div>
                <div className="be-numbers">
                  <span className="form-label" id={`contact-${key}-numbers-label`}>Contact numbers</span>
                  {numbers.map((n, i) => (
                    <div className="be-number-row" key={i}>
                      <input id={`contact-${key}-number-${i}`} type="tel" className="form-input" value={n} maxLength={L.hotelPhone + 20} disabled={readOnly} placeholder="e.g. +91 98765 43210" aria-label={`${label} number ${i + 1}`} onChange={(e) => setNumber(i, e.target.value)} {...invalid(`contact-${key}-number-${i}`)} />
                      {!readOnly && (
                        <button type="button" className="btn-icon btn-outline" onClick={() => removeNumber(i)} aria-label={`Remove ${label.toLowerCase()} number ${i + 1}`} title="Remove this number">
                          <Trash2 size={14} />
                        </button>
                      )}
                      {error(`contact-${key}-number-${i}`)}
                    </div>
                  ))}
                  {error(`contact-${key}-numbers`)}
                  {!readOnly && (
                    <button type="button" className="btn btn-outline-azure btn-sm be-add-number" onClick={() => setPerson({ numbers: [...numbers, ''] })} disabled={numbers.length >= L.contactNumbers}>
                      <Plus size={14} /> <span>Add another number</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
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
          <label className="form-label" htmlFor="payment-supplier">Supplier (who the balance is paid to)</label>
          <input id="payment-supplier" type="text" className="form-input" value={form.payment.supplier || ''} maxLength={L.supplier} disabled={readOnly} placeholder="e.g. Taj Hotels, or the tour operator's name" onChange={(e) => setPayment({ supplier: e.target.value })} />
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
