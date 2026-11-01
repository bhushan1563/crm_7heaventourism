import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { DEFAULT_VEHICLE_INCLUSIONS, VEHICLE_LIMITS, blankVehicle, isLandService, landServiceProblem, lineAmount, startLandService, vehicleLabel, vehicleTotal, vehiclesPayload } from './landService';

const suv = (over = {}) => ({ vehicleType: 'SUV (Innova Crysta)', seats: 7, quantity: 2, acType: 'AC', rate: 18500, notes: '', ...over });
const land = (vehicles) => ({ quotationType: 'Land Service', vehicles });

describe('prices', () => {
  it('a line is the number of vehicles times the rate of one; the quotation is the sum of its lines', () => {
    expect(lineAmount(suv())).toBe(37000);
    expect(lineAmount({ quantity: 3, rate: '1000.50' })).toBe(3001.5);
    expect(lineAmount(blankVehicle())).toBe(0);
    expect(vehicleTotal([suv(), suv({ quantity: 1, rate: 32000 })])).toBe(69000);
    expect(vehicleTotal([])).toBe(0);
    expect(vehicleTotal(undefined)).toBe(0);
  });
  it('is exact to the paisa', () => {
    expect(vehicleTotal([{ quantity: 3, rate: 0.1 }, { quantity: 1, rate: 0.2 }])).toBe(0.5);
  });
  it('reads naturally on screen and in documents', () => {
    expect(vehicleLabel(suv())).toBe('SUV (Innova Crysta) × 2');
    expect(vehicleLabel(suv({ quantity: 1 }))).toBe('SUV (Innova Crysta)');
    expect(vehicleLabel({})).toBe('Vehicle');
  });
});

describe('starting a land service quotation', () => {
  it('begins with one blank vehicle and the standard inclusions, which can all be changed', () => {
    const start = startLandService({});
    expect(start.vehicles).toEqual([blankVehicle()]);
    expect(start.vehicleInclusions).toEqual(DEFAULT_VEHICLE_INCLUSIONS);
    start.vehicleInclusions.push('x');
    expect(DEFAULT_VEHICLE_INCLUSIONS).toHaveLength(4); // the standard list itself is never changed by editing a quotation
  });
  it('never replaces what was already typed', () => {
    const start = startLandService({ vehicles: [suv()], vehicleInclusions: ['Only this'] });
    expect(start.vehicles).toHaveLength(1);
    expect(start.vehicleInclusions).toEqual(['Only this']);
  });
});

describe('landServiceProblem', () => {
  it('has nothing to say about other quotation types, or a complete land service quotation', () => {
    expect(landServiceProblem({ quotationType: 'Package' })).toBeNull();
    expect(landServiceProblem({})).toBeNull();
    expect(landServiceProblem(land([suv()]))).toBeNull();
    expect(isLandService(land([]))).toBe(true);
    expect(isLandService({ quotationType: 'Only Hotel' })).toBe(false);
  });
  it('asks for a vehicle, then a type, a sensible number and a rate, naming the vehicle', () => {
    expect(landServiceProblem(land([]))).toMatch(/needs at least one vehicle.*Vehicles & Rates/);
    expect(landServiceProblem(land([suv(), suv({ vehicleType: '  ' })]))).toBe('Please enter the vehicle type for vehicle 2, or remove that line.');
    expect(landServiceProblem(land([suv({ quantity: 0 })]))).toMatch(/number of vehicles in line 1 must be a whole number from 1 to 99/);
    expect(landServiceProblem(land([suv({ quantity: 1.5 })]))).toMatch(/line 1/);
    expect(landServiceProblem(land([suv({ seats: 'many' })]))).toMatch(/seats of vehicle 1/);
    expect(landServiceProblem(land([suv({ rate: '' })]))).toBe('Please enter the rate of vehicle 1 (SUV (Innova Crysta)) for the whole trip.');
    expect(landServiceProblem(land([suv({ rate: -5 })]))).toMatch(/rate of vehicle 1/);
    expect(landServiceProblem(land([suv({ seats: '' })]))).toBeNull(); // seats are optional
  });
});

describe('vehiclesPayload', () => {
  it('sends numbers as numbers and fills in blanks the way the server expects', () => {
    expect(vehiclesPayload([{ vehicleType: ' Sedan ', seats: '', quantity: '2', rate: '9000', acType: 'Non-AC', notes: undefined }])).toEqual([{ vehicleType: 'Sedan', seats: 0, quantity: 2, acType: 'Non-AC', rate: 9000, notes: '' }]);
    expect(vehiclesPayload(undefined)).toEqual([]);
  });
});

describe('property', () => {
  it('the total is never negative and equals the sum of the lines, whatever the vehicles are', () => {
    const v = fc.record({ quantity: fc.integer({ min: 0, max: VEHICLE_LIMITS.quantity }), rate: fc.oneof(fc.double({ min: 0, max: 1e7, noNaN: true }), fc.constant(''), fc.constant(undefined)) });
    fc.assert(
      fc.property(fc.array(v, { maxLength: 20 }), (vehicles) => {
        const total = vehicleTotal(vehicles);
        expect(total).toBeGreaterThanOrEqual(0);
        expect(Math.abs(total - vehicles.reduce((s, x) => s + lineAmount(x), 0))).toBeLessThan(0.01 * vehicles.length + 0.01);
      }),
      { numRuns: 300 }
    );
  });
});
