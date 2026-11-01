// Land service quotations: vehicle only, with an itinerary and a price. Pure functions (no network, no React) so every rule
// can be tested. The price IS the vehicles: each line is a vehicle type, how many, and the rate for the whole trip.

export const LAND_SERVICE = 'Land Service';
export const isLandService = (quotation) => (quotation?.quotationType || '') === LAND_SERVICE;

export const VEHICLE_LIMITS = { vehicles: 20, type: 80, notes: 200, seats: 100, quantity: 99, route: 200, point: 120, km: 150, priceNote: 200 };

/** One-click suggestions for the vehicle type (the field itself accepts anything: the list is editable by typing). */
export const VEHICLE_TYPE_SUGGESTIONS = [
  'Hatchback (Swift / WagonR)',
  'Sedan (Dzire / Etios)',
  'SUV (Ertiga / Innova)',
  'SUV (Innova Crysta)',
  'Tempo Traveller (9 seater)',
  'Tempo Traveller (12 seater)',
  'Tempo Traveller (17 seater)',
  'Mini Bus (26 seater)',
  'Coach (35 seater)',
  'Coach (45 seater)'
];

/** What a new land service quotation starts with in the "Vehicle inclusions" list (every line can be changed or removed). */
export const DEFAULT_VEHICLE_INCLUSIONS = ['Fuel', 'Driver charges and driver allowance', 'Toll taxes and parking fees', 'State and inter-state taxes and permits'];

export const AC_CHOICES = [
  { value: 'AC', label: 'AC' },
  { value: 'Non-AC', label: 'Non-AC' }
];

export const blankVehicle = () => ({ vehicleType: '', seats: '', quantity: 1, acType: 'AC', rate: '', notes: '' });

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** What one line costs: how many vehicles times the rate of one for the whole trip. */
export const lineAmount = (vehicle) => round2((Number(vehicle.quantity) || 0) * (Number(vehicle.rate) || 0));

/** The price of the quotation: the sum of its lines. */
export const vehicleTotal = (vehicles) => round2((vehicles || []).reduce((sum, v) => sum + lineAmount(v), 0));

/** "SUV (Innova Crysta) × 2" */
export const vehicleLabel = (vehicle) => `${vehicle.vehicleType || 'Vehicle'}${Number(vehicle.quantity) > 1 ? ` × ${vehicle.quantity}` : ''}`;

/** What the quotation looks like when the user turns it into a land service quotation (nothing already typed is lost). */
export const startLandService = (quotation) => ({
  vehicles: quotation.vehicles?.length ? quotation.vehicles : [blankVehicle()],
  vehicleInclusions: quotation.vehicleInclusions?.length ? quotation.vehicleInclusions : [...DEFAULT_VEHICLE_INCLUSIONS]
});

/**
 * What stops a land service quotation from being saved, in plain words, or null: at least one vehicle, each with a type,
 * a sensible number and a rate. (The server repeats these checks.)
 */
export const landServiceProblem = (quotation) => {
  if (!isLandService(quotation)) return null;
  const vehicles = quotation.vehicles || [];
  if (!vehicles.length) return 'A land service quotation needs at least one vehicle. On the "Vehicles & Rates" tab, add the vehicle and its rate.';
  for (const [i, v] of vehicles.entries()) {
    const n = i + 1;
    if (!String(v.vehicleType || '').trim()) return `Please enter the vehicle type for vehicle ${n}, or remove that line.`;
    const quantity = Number(v.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > VEHICLE_LIMITS.quantity) return `The number of vehicles in line ${n} must be a whole number from 1 to ${VEHICLE_LIMITS.quantity}.`;
    if (v.seats !== '' && v.seats !== undefined && (!Number.isInteger(Number(v.seats)) || Number(v.seats) < 0 || Number(v.seats) > VEHICLE_LIMITS.seats)) return `The number of seats of vehicle ${n} must be a whole number from 0 to ${VEHICLE_LIMITS.seats}.`;
    if (!(Number(v.rate) > 0)) return `Please enter the rate of vehicle ${n} (${v.vehicleType.trim()}) for the whole trip.`;
  }
  return null;
};

/** The vehicles as the server wants them (numbers as numbers, blanks as defaults). */
export const vehiclesPayload = (vehicles) =>
  (vehicles || []).map((v) => ({
    vehicleType: String(v.vehicleType || '').trim(),
    seats: v.seats === '' || v.seats === undefined ? 0 : Number(v.seats),
    quantity: Number(v.quantity) || 1,
    acType: v.acType ?? 'AC',
    rate: Number(v.rate) || 0,
    notes: v.notes || ''
  }));
