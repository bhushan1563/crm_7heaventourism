import { line } from './itineraryInput.js';

// The vehicles of a land service quotation (vehicle only, with itinerary and pricing): each has a type, seats, AC or not, a
// quantity and a rate for the whole trip; the price of the quotation is the sum of quantity x rate. Pure logic (no database),
// so it can be tested exhaustively.

export const VEHICLE_LIMITS = { vehicles: 20, type: 80, notes: 200, seats: 100, quantity: 99, maxRate: 1_000_000_000, route: 200, point: 120, km: 150, priceNote: 200 };
export const AC_TYPES = ['AC', 'Non-AC', ''];

const fail = (message) => ({ ok: false, message });
const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const round2 = (n) => Math.round(n * 100) / 100;

const whole = (raw, { label, min, max, fallback }) => {
  if (raw === undefined || raw === null || raw === '') return { ok: true, value: fallback };
  const n = typeof raw === 'number' || typeof raw === 'string' ? Number(raw) : Number.NaN;
  if (!Number.isInteger(n) || n < min || n > max) return fail(`${label} must be a whole number from ${min} to ${max}.`);
  return { ok: true, value: n };
};

/** What the vehicles cost in total: the sum of quantity x rate. */
export const vehicleTotal = (vehicles) => round2((vehicles || []).reduce((sum, v) => sum + (Number(v.quantity) || 0) * (Number(v.rate) || 0), 0));

/**
 * @param {object} body what the client sent
 * @returns {{ ok: true, vehicles?: object[], landService?: object, total?: number } | { ok: false, message: string }}
 *   Only what the request carries is returned (an update that sends neither leaves them alone).
 */
export const normalizeQuotationVehicles = (body) => {
  const L = VEHICLE_LIMITS;
  const out = { ok: true };

  if (body.vehicles !== undefined) {
    if (!Array.isArray(body.vehicles)) return fail('The vehicles must be a list.');
    if (body.vehicles.length > L.vehicles) return fail(`A quotation can have at most ${L.vehicles} vehicles (there are ${body.vehicles.length}).`);
    const vehicles = [];
    for (const [index, raw] of body.vehicles.entries()) {
      const n = index + 1;
      if (!isPlainObject(raw)) return fail(`Vehicle ${n} is not valid.`);
      const type = line(raw.vehicleType, `the vehicle type for vehicle ${n}`, L.type, { required: true });
      if (!type.ok) return type;
      const seats = whole(raw.seats, { label: `The number of seats of vehicle ${n}`, min: 0, max: L.seats, fallback: 0 });
      if (!seats.ok) return seats;
      const quantity = whole(raw.quantity, { label: `The number of vehicles in line ${n}`, min: 1, max: L.quantity, fallback: 1 });
      if (!quantity.ok) return quantity;
      const acType = raw.acType === undefined || raw.acType === null ? 'AC' : raw.acType;
      if (!AC_TYPES.includes(acType)) return fail(`Please choose AC or Non-AC for vehicle ${n}.`);
      const rawRate = raw.rate === undefined || raw.rate === null || raw.rate === '' ? 0 : typeof raw.rate === 'number' || typeof raw.rate === 'string' ? Number(raw.rate) : Number.NaN;
      if (!Number.isFinite(rawRate) || rawRate < 0 || rawRate > L.maxRate) return fail(`The rate of vehicle ${n} must be an amount from 0 to ${L.maxRate.toLocaleString('en-IN')}.`);
      const notes = line(raw.notes, `the notes of vehicle ${n}`, L.notes);
      if (!notes.ok) return notes;
      vehicles.push({ vehicleType: type.value, seats: seats.value, quantity: quantity.value, acType, rate: round2(rawRate), notes: notes.value });
    }
    out.vehicles = vehicles;
    out.total = vehicleTotal(vehicles);
  }

  if (body.landService !== undefined) {
    if (!isPlainObject(body.landService)) return fail('The trip details must be a set of fields.');
    const fields = [['route', 'the route', L.route], ['pickupPoint', 'the pick-up point', L.point], ['dropPoint', 'the drop point', L.point], ['kmPolicy', 'the kilometre policy', L.km], ['priceNote', 'the price note', L.priceNote]];
    const landService = {};
    for (const [key, label, max] of fields) {
      const r = line(body.landService[key], label, max);
      if (!r.ok) return r;
      landService[key] = r.value;
    }
    out.landService = landService;
  }
  return out;
};
