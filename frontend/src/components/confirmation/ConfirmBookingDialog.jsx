import React, { useEffect, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import Modal from '../Modal';
import { guestCount } from '../../utils/quotationOptions';
import { needsOptionChoice } from '../../utils/confirmation';
import { filledTables, needsPriceTableChoice, tableTotal } from '../../utils/priceTables';
import './confirmation.css';

const money = (n) => `Rs ${(Number(n) || 0).toLocaleString('en-IN')}`;

/** What an option costs for this quotation's guests: its stored total, or the price per person times the guests. */
export const optionTotal = (option, paxDetails) => (Number(option.totalPrice) > 0 ? Number(option.totalPrice) : Math.round((Number(option.pricePerPerson) || 0) * guestCount(paxDetails) * 100) / 100);

/**
 * Asks before turning a quotation into a booking: what will happen, and which hotel option the client accepted when the
 * quotation offers several. `onConfirm(optionIndex)` is called with the chosen option (undefined when there are none).
 */
export const ConfirmBookingDialog = ({ quotation, isOpen, onClose, onConfirm, busy = false }) => {
  const [choice, setChoice] = useState(null);
  const [priceChoice, setPriceChoice] = useState(null);
  const options = quotation?.options || [];
  const mustChoose = needsOptionChoice(quotation);
  const mustChoosePrice = needsPriceTableChoice(quotation);

  useEffect(() => {
    if (isOpen) {
      setChoice(null);
      setPriceChoice(null);
    }
  }, [isOpen, quotation?._id]);

  if (!quotation) return null;
  const ready = (!mustChoose || choice !== null) && (!mustChoosePrice || priceChoice !== null);

  return (
    <Modal isOpen={isOpen} onClose={busy ? () => {} : onClose} title="Confirm this booking?" subtitle={`${quotation.quotationNo} · ${quotation.clientName} · ${quotation.destination}`} maxWidth="560px">
      <div className="cf-dialog">
        {mustChoose && (
          <fieldset className="cf-options" style={{ border: 0, padding: 0, margin: '0 0 6px' }}>
            <legend className="form-label">Which hotel option did the client accept?</legend>
            {options.map((o, i) => (
              <label className={`cf-option${choice === i ? ' is-selected' : ''}`} key={i}>
                <input type="radio" name="accepted-option" checked={choice === i} onChange={() => setChoice(i)} disabled={busy} />
                <span>
                  <span className="cf-option-name">{o.name || `Option ${i + 1}`}</span>
                  <span className="cf-option-meta" style={{ display: 'block' }}>
                    {money(o.pricePerPerson)} per person · {money(optionTotal(o, quotation.paxDetails))} in all
                  </span>
                  {(o.hotels || []).length > 0 && (
                    <span className="cf-option-meta" style={{ display: 'block' }}>
                      {o.hotels.map((h) => h.hotelName).filter(Boolean).join(', ')}
                    </span>
                  )}
                </span>
              </label>
            ))}
          </fieldset>
        )}

        {mustChoosePrice && (
          <fieldset className="cf-options" style={{ border: 0, padding: 0, margin: '0 0 6px' }}>
            <legend className="form-label">Which pricing option did the client accept?</legend>
            {filledTables(quotation).map(({ table, index }) => (
              <label className={`cf-option${priceChoice === index ? ' is-selected' : ''}`} key={index}>
                <input type="radio" name="accepted-pricing" checked={priceChoice === index} onChange={() => setPriceChoice(index)} disabled={busy} />
                <span>
                  <span className="cf-option-name">{table.name || `Option ${index + 1}`}</span>
                  <span className="cf-option-meta" style={{ display: 'block' }}>Grand Total {money(tableTotal(table))}</span>
                </span>
              </label>
            ))}
          </fieldset>
        )}

        <p style={{ margin: '4px 0 0', fontWeight: 600 }}>This will:</p>
        <ul className="cf-dialog-list">
          <li>create a booking confirmation: a copy of the quotation as it was sold, with room for travellers, payments and notes</li>
          <li>lock the quotation, so what was sold cannot be changed by accident</li>
          {quotation.guestId && <li>mark the guest as Confirmed</li>}
        </ul>
        <p className="edit-hint" style={{ marginTop: 10 }}>If the plans change, you can cancel the booking with a reason. That unlocks the quotation again.</p>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={busy}>
            Not now
          </button>
          <button type="button" className="btn btn-primary" onClick={() => onConfirm(mustChoose ? choice : undefined, mustChoosePrice ? priceChoice : undefined)} disabled={!ready || busy} title={ready ? undefined : 'Choose what the client accepted first'}>
            <CheckCircle2 size={15} /> {busy ? 'Confirming…' : 'Confirm booking'}
          </button>
        </div>
        {!ready && <p className="edit-hint" style={{ textAlign: 'right', marginTop: 6 }}>Choose what the client accepted to continue.</p>}
      </div>
    </Modal>
  );
};

export default ConfirmBookingDialog;
