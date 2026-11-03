import React, { useState } from 'react';
import { ArrowDown, ArrowUp, CheckCircle2, Copy, Hotel, Plus, Star, Trash2, Undo2 } from 'lucide-react';
import { HOTEL_STAR_RATINGS, MEAL_PLANS } from '../../config';
import { OPTION_LIMITS, addOption, duplicateOption, guestCount, moveOption, removeOption, setPrice, setRecommended } from '../../utils/quotationOptions';
import { blankStay, stayDatePatch } from '../../utils/hotelStay';
import { toInputDate } from '../../utils/dateHelper';
import FormattedLine from './FormattedLine';
import './optionsEditor.css';

const money = (n) => `Rs ${(Number(n) || 0).toLocaleString('en-IN')}`;

/**
 * The hotel options of a quotation: each option has its own hotels and its own price per person. `onChange(options)` gets the
 * whole new list. `onChooseHotel(optionIndex, hotelIndex | null)` opens the hotel list for that option (null = a new hotel).
 * `onSingle()` goes back to a single offer. The total of an option is worked out from the price and the number of guests.
 */
export const OptionsEditor = ({ options, onChange, paxDetails, quotationType, canUseList, onChooseHotel, onSingle }) => {
  const [askSingle, setAskSingle] = useState(false);
  const guests = guestCount(paxDetails);
  const fromListOnly = quotationType === 'Only Hotel';

  const patchOption = (i, patch) => onChange(options.map((o, k) => (k === i ? { ...o, ...patch } : o)));
  const patchHotel = (i, h, patch) => patchOption(i, { hotels: options[i].hotels.map((s, k) => (k === h ? { ...s, ...patch } : s)) });
  const addByHand = (i) => patchOption(i, { hotels: [...options[i].hotels, blankStay()] });
  const removeHotel = (i, h) => patchOption(i, { hotels: options[i].hotels.filter((_, k) => k !== h) });

  return (
    <div className="options-editor">
      <div className="options-head">
        <div>
          <div className="options-title">Hotel options ({options.length})</div>
          <div className="options-hint">Offer the guest a choice. Each option has its own hotels and its own price, and they are shown side by side. Prices are per person for {guests} {guests === 1 ? 'guest' : 'guests'}.</div>
        </div>
        <div className="options-tools">
          <button type="button" className="btn btn-outline-azure btn-sm" onClick={() => onChange(addOption(options))} disabled={options.length >= OPTION_LIMITS.options}>
            <Plus size={14} /> <span>Add option</span>
          </button>
          {!askSingle && (
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setAskSingle(true)}>
              <Undo2 size={14} /> <span>Back to a single offer</span>
            </button>
          )}
        </div>
      </div>

      {askSingle && (
        <div className="options-confirm" role="alert">
          <span>Keep only the hotels of the first option, and remove the other options and their prices?</span>
          <button type="button" className="btn btn-danger btn-sm" onClick={() => { setAskSingle(false); onSingle(); }}>
            Yes, go back
          </button>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => setAskSingle(false)}>
            No, keep the options
          </button>
        </div>
      )}

      <div className="options-list">
        {options.map((option, i) => (
          <section className={`option-card${option.recommended ? ' is-recommended' : ''}`} key={i} aria-label={`Option ${i + 1}`}>
            <div className="option-top">
              <input type="text" className="form-input option-name" value={option.name} maxLength={80} aria-label={`Name of option ${i + 1}`} placeholder={`Option ${i + 1}`} onChange={(e) => patchOption(i, { name: e.target.value })} />
              <label className="option-recommend">
                <input type="checkbox" checked={option.recommended} onChange={(e) => onChange(setRecommended(options, i, e.target.checked))} />
                <Star size={13} aria-hidden="true" /> Recommended
              </label>
              <span className="option-tools">
                <button type="button" className="btn-icon btn-outline" onClick={() => onChange(moveOption(options, i, i - 1))} disabled={i === 0} aria-label={`Move option ${i + 1} earlier`} title="Move earlier">
                  <ArrowUp size={14} />
                </button>
                <button type="button" className="btn-icon btn-outline" onClick={() => onChange(moveOption(options, i, i + 1))} disabled={i === options.length - 1} aria-label={`Move option ${i + 1} later`} title="Move later">
                  <ArrowDown size={14} />
                </button>
                <button type="button" className="btn-icon btn-outline" onClick={() => onChange(duplicateOption(options, i))} disabled={options.length >= OPTION_LIMITS.options} aria-label={`Copy option ${i + 1}`} title="Copy this option">
                  <Copy size={14} />
                </button>
                <button type="button" className="btn-icon btn-outline option-danger" onClick={() => onChange(removeOption(options, i))} aria-label={`Remove option ${i + 1}`} title="Remove this option">
                  <Trash2 size={14} />
                </button>
              </span>
            </div>

            <div className="option-hotels">
              {option.hotels.length === 0 && <p className="options-hint">No hotel in this option yet.</p>}
              {option.hotels.map((h, k) => {
                const linked = Boolean(h.hotelId);
                const locked = fromListOnly && linked;
                return (
                  <div className="option-hotel" key={k}>
                    <div className="option-hotel-head">
                      {linked ? (
                        <span className="option-linked">
                          <CheckCircle2 size={13} aria-hidden="true" /> From the hotel list{h.photos?.length ? ` · ${h.photos.length} ${h.photos.length === 1 ? 'photo' : 'photos'}` : ''}
                        </span>
                      ) : (
                        <span className="option-typed">Typed by hand</span>
                      )}
                      <span className="option-hotel-tools">
                        {canUseList && (
                          <button type="button" className="btn btn-outline btn-sm" onClick={() => onChooseHotel(i, k)}>
                            <Hotel size={13} /> {linked ? 'Change hotel' : 'Choose from list'}
                          </button>
                        )}
                        <button type="button" className="btn-icon btn-outline option-danger" onClick={() => removeHotel(i, k)} aria-label={`Remove hotel ${k + 1} from option ${i + 1}`} title="Remove this hotel">
                          <Trash2 size={13} />
                        </button>
                      </span>
                    </div>
                    <div className="option-hotel-grid">
                      <input type="text" className="form-input" value={h.hotelName || ''} readOnly={locked} placeholder="Hotel name" aria-label={`Hotel ${k + 1} name, option ${i + 1}`} onChange={(e) => patchHotel(i, k, { hotelName: e.target.value })} />
                      <input type="text" className="form-input" value={h.city || ''} readOnly={locked} placeholder="City" aria-label={`Hotel ${k + 1} city, option ${i + 1}`} onChange={(e) => patchHotel(i, k, { city: e.target.value })} />
                      <select className="form-select" value={h.starRating || '4 star'} disabled={locked} aria-label={`Hotel ${k + 1} rating, option ${i + 1}`} onChange={(e) => patchHotel(i, k, { starRating: e.target.value })}>
                        {HOTEL_STAR_RATINGS.map((s) => (
                          <option key={s.value} value={s.value}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                      <input type="text" className="form-input" value={h.nights || ''} placeholder="Nights, e.g. 2 Nights" aria-label={`Hotel ${k + 1} nights, option ${i + 1}`} onChange={(e) => patchHotel(i, k, { nights: e.target.value })} />
                      <input type="text" className="form-input" value={h.roomCategory || ''} list={`opt-rooms-${i}-${k}`} placeholder="Room category" aria-label={`Hotel ${k + 1} room, option ${i + 1}`} onChange={(e) => patchHotel(i, k, { roomCategory: e.target.value })} />
                      <datalist id={`opt-rooms-${i}-${k}`}>
                        {(h.roomOptions || []).map((room) => (
                          <option key={room} value={room} />
                        ))}
                      </datalist>
                      <select className="form-select" value={h.mealPlan || 'CP (Breakfast Only)'} aria-label={`Hotel ${k + 1} meal plan, option ${i + 1}`} onChange={(e) => patchHotel(i, k, { mealPlan: e.target.value })}>
                        {MEAL_PLANS.map((m) => (
                          <option key={m.value} value={m.value}>
                            {m.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="option-hotel-grid">
                      <div>
                        <label className="form-label option-mini" htmlFor={`opt-in-${i}-${k}`}>Check-in date</label>
                        <input id={`opt-in-${i}-${k}`} type="date" className="form-input" value={toInputDate(h.checkInDate)} aria-label={`Hotel ${k + 1} check-in date, option ${i + 1}`} onChange={(e) => patchHotel(i, k, stayDatePatch(h, 'checkInDate', e.target.value))} />
                      </div>
                      <div>
                        <label className="form-label option-mini" htmlFor={`opt-out-${i}-${k}`}>Check-out date</label>
                        <input id={`opt-out-${i}-${k}`} type="date" className="form-input" value={toInputDate(h.checkOutDate)} aria-label={`Hotel ${k + 1} check-out date, option ${i + 1}`} onChange={(e) => patchHotel(i, k, stayDatePatch(h, 'checkOutDate', e.target.value))} />
                      </div>
                      <div>
                        <label className="form-label option-mini" htmlFor={`opt-rooms-count-${i}-${k}`}>No. of rooms</label>
                        <input id={`opt-rooms-count-${i}-${k}`} type="text" className="form-input" value={h.noOfRooms || ''} placeholder="e.g. 2 Rooms" aria-label={`Hotel ${k + 1} rooms, option ${i + 1}`} onChange={(e) => patchHotel(i, k, { noOfRooms: e.target.value })} />
                      </div>
                      <input type="text" className="form-input option-address" value={h.address || ''} maxLength={300} placeholder="Hotel address" aria-label={`Hotel ${k + 1} address, option ${i + 1}`} onChange={(e) => patchHotel(i, k, { address: e.target.value })} />
                    </div>
                  </div>
                );
              })}
              <div className="option-add">
                {canUseList && (
                  <button type="button" className="btn btn-outline-azure btn-sm" onClick={() => onChooseHotel(i, null)} disabled={option.hotels.length >= OPTION_LIMITS.hotelsPerOption}>
                    <Hotel size={13} /> <span>Choose from hotel list</span>
                  </button>
                )}
                {!fromListOnly && (
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => addByHand(i)} disabled={option.hotels.length >= OPTION_LIMITS.hotelsPerOption}>
                    <Plus size={13} /> <span>Add a hotel by hand</span>
                  </button>
                )}
              </div>
            </div>

            <div className="option-price">
              <div>
                <label className="form-label" htmlFor={`opt-price-${i}`}>Price per person (Rs)</label>
                <input id={`opt-price-${i}`} type="number" min={0} step="any" className="form-input" value={option.pricePerPerson || ''} placeholder="e.g. 25000" onChange={(e) => onChange(setPrice(options, i, e.target.value, paxDetails))} />
              </div>
              <div>
                <span className="form-label">Total for {guests} {guests === 1 ? 'guest' : 'guests'}</span>
                <div className="option-total" aria-live="polite">{option.pricePerPerson > 0 ? money(option.totalPrice) : '—'}</div>
              </div>
              <div className="option-note">
                <span className="form-label">Price note</span>
                <FormattedLine value={option.priceNote || ''} maxLength={200} placeholder="e.g. Per person on twin sharing, incl. GST" ariaLabel={`Price note of option ${i + 1}`} onChange={(value) => patchOption(i, { priceNote: value })} />
              </div>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
};

export default OptionsEditor;
