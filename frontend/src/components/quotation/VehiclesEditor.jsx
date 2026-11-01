import React from 'react';
import { Plus, RotateCcw, Trash2 } from 'lucide-react';
import FormattedLine from './FormattedLine';
import { AC_CHOICES, DEFAULT_VEHICLE_INCLUSIONS, VEHICLE_LIMITS, VEHICLE_TYPE_SUGGESTIONS, blankVehicle, lineAmount, vehicleTotal } from '../../utils/landService';
import './landService.css';

const money = (n) => `Rs ${(Number(n) || 0).toLocaleString('en-IN')}`;

/**
 * The "Vehicles & Rates" tab of a land service quotation: the trip, the vehicles with their rates (the price IS the vehicles),
 * and the vehicle inclusions. `onChange(patch)` receives the fields that changed (vehicles, landService, vehicleInclusions).
 */
export const VehiclesEditor = ({ quotation, onChange }) => {
  const vehicles = quotation.vehicles || [];
  const trip = quotation.landService || {};
  const inclusions = quotation.vehicleInclusions || [];

  const setTrip = (key, value) => onChange({ landService: { ...trip, [key]: value } });
  const setVehicle = (index, patch) => onChange({ vehicles: vehicles.map((v, i) => (i === index ? { ...v, ...patch } : v)) });
  const setInclusion = (index, value) => onChange({ vehicleInclusions: inclusions.map((x, i) => (i === index ? value : x)) });
  const total = vehicleTotal(vehicles);

  const tripField = (key, label, placeholder, max) => (
    <div className="form-group">
      <label className="form-label" htmlFor={`trip-${key}`}>{label}</label>
      <input id={`trip-${key}`} type="text" className="form-input" value={trip[key] || ''} maxLength={max} placeholder={placeholder} onChange={(e) => setTrip(key, e.target.value)} />
    </div>
  );

  return (
    <div className="vehicles-editor">
      <section aria-labelledby="ve-trip">
        <h4 id="ve-trip" className="ve-heading">The trip</h4>
        <div className="ve-trip-grid">
          <div className="ve-wide">{tripField('route', 'Route', 'e.g. Delhi – Agra – Jaipur – Delhi', VEHICLE_LIMITS.route)}</div>
          {tripField('pickupPoint', 'Pick-up point', 'e.g. IGI Airport, Delhi', VEHICLE_LIMITS.point)}
          {tripField('dropPoint', 'Drop point', 'e.g. IGI Airport, Delhi', VEHICLE_LIMITS.point)}
          <div className="ve-wide">{tripField('kmPolicy', 'Kilometre policy', 'e.g. 250 km per day; extra km at actuals', VEHICLE_LIMITS.km)}</div>
        </div>
      </section>

      <section aria-labelledby="ve-vehicles">
        <div className="ve-head">
          <h4 id="ve-vehicles" className="ve-heading">Vehicles and rates</h4>
          <button type="button" className="btn btn-outline-azure btn-sm" onClick={() => onChange({ vehicles: [...vehicles, blankVehicle()] })} disabled={vehicles.length >= VEHICLE_LIMITS.vehicles}>
            <Plus size={14} /> <span>Add a vehicle</span>
          </button>
        </div>
        <p className="ve-hint">The rate is for the whole trip, for one vehicle. The price of the quotation is the total of these lines.</p>
        {vehicles.length === 0 && <p className="ve-hint">No vehicle yet. Add one to give a price.</p>}
        <datalist id="vehicle-types">
          {VEHICLE_TYPE_SUGGESTIONS.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
        <div className="ve-rows">
          {vehicles.map((v, i) => (
            <div className="ve-row" key={i} role="group" aria-label={`Vehicle ${i + 1}`}>
              <div className="ve-type">
                <label className="form-label" htmlFor={`veh-type-${i}`}>Vehicle type</label>
                <input id={`veh-type-${i}`} type="text" className="form-input" list="vehicle-types" value={v.vehicleType} maxLength={VEHICLE_LIMITS.type} placeholder="e.g. SUV (Innova Crysta)" onChange={(e) => setVehicle(i, { vehicleType: e.target.value })} />
              </div>
              <div>
                <label className="form-label" htmlFor={`veh-seats-${i}`}>Seats</label>
                <input id={`veh-seats-${i}`} type="number" min={0} max={VEHICLE_LIMITS.seats} className="form-input" value={v.seats} placeholder="e.g. 7" onChange={(e) => setVehicle(i, { seats: e.target.value })} />
              </div>
              <div>
                <label className="form-label" htmlFor={`veh-ac-${i}`}>AC</label>
                <select id={`veh-ac-${i}`} className="form-select" value={v.acType ?? 'AC'} onChange={(e) => setVehicle(i, { acType: e.target.value })}>
                  {AC_CHOICES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="form-label" htmlFor={`veh-qty-${i}`}>How many</label>
                <input id={`veh-qty-${i}`} type="number" min={1} max={VEHICLE_LIMITS.quantity} className="form-input" value={v.quantity} onChange={(e) => setVehicle(i, { quantity: e.target.value })} />
              </div>
              <div>
                <label className="form-label" htmlFor={`veh-rate-${i}`}>Rate per vehicle (Rs)</label>
                <input id={`veh-rate-${i}`} type="number" min={0} step="any" className="form-input" value={v.rate} placeholder="e.g. 18500" onChange={(e) => setVehicle(i, { rate: e.target.value })} />
              </div>
              <div className="ve-amount">
                <span className="form-label">Amount</span>
                <div className="ve-amount-value" aria-live="polite">{lineAmount(v) > 0 ? money(lineAmount(v)) : '—'}</div>
              </div>
              <button type="button" className="btn-icon btn-outline ve-remove" onClick={() => onChange({ vehicles: vehicles.filter((_, k) => k !== i) })} aria-label={`Remove vehicle ${i + 1}`} title="Remove this vehicle">
                <Trash2 size={14} />
              </button>
              <div className="ve-notes">
                <input type="text" className="form-input" value={v.notes || ''} maxLength={VEHICLE_LIMITS.notes} placeholder="Notes about this vehicle (optional), e.g. with driver, luggage space" aria-label={`Notes for vehicle ${i + 1}`} onChange={(e) => setVehicle(i, { notes: e.target.value })} />
              </div>
            </div>
          ))}
        </div>
        <div className="ve-total">
          <span>Total for the trip</span>
          <strong aria-live="polite">{total > 0 ? money(total) : '—'}</strong>
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="trip-priceNote">Price note</label>
          <input id="trip-priceNote" type="text" className="form-input" value={trip.priceNote || ''} maxLength={VEHICLE_LIMITS.priceNote} placeholder="e.g. GST extra; toll and parking as actuals" onChange={(e) => setTrip('priceNote', e.target.value)} />
        </div>
      </section>

      <section aria-labelledby="ve-incl">
        <div className="ve-head">
          <h4 id="ve-incl" className="ve-heading">Vehicle inclusions ({inclusions.length})</h4>
          <span className="ve-tools">
            <button type="button" className="btn btn-outline btn-sm" onClick={() => onChange({ vehicleInclusions: [...DEFAULT_VEHICLE_INCLUSIONS] })} title="Replace the list with the standard inclusions">
              <RotateCcw size={13} /> <span>Reset to standard</span>
            </button>
            <button type="button" className="btn btn-outline-azure btn-sm" onClick={() => onChange({ vehicleInclusions: [...inclusions, ''] })}>
              <Plus size={14} /> <span>Add an inclusion</span>
            </button>
          </span>
        </div>
        <p className="ve-hint">What the price covers. Press a line to change it or to use bold, colour, highlight or a bigger size.</p>
        <div className="ve-incl-list">
          {inclusions.map((item, i) => (
            <div className="ve-incl" key={i}>
              <span className="ve-tick" aria-hidden="true">✓</span>
              <FormattedLine value={item} placeholder="e.g. Fuel, driver allowance, toll and parking" ariaLabel={`Vehicle inclusion ${i + 1}`} onChange={(value) => setInclusion(i, value)} />
              <button type="button" className="btn btn-danger btn-sm btn-icon" onClick={() => onChange({ vehicleInclusions: inclusions.filter((_, k) => k !== i) })} aria-label={`Remove vehicle inclusion ${i + 1}`} title="Remove this inclusion">
                <Trash2 size={13} />
              </button>
            </div>
          ))}
          {inclusions.length === 0 && <p className="ve-hint">Nothing listed. Add what the price includes, or reset to the standard list.</p>}
        </div>
      </section>
    </div>
  );
};

export default VehiclesEditor;
