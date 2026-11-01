import './helpers.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { VEHICLE_LIMITS as L, normalizeQuotationVehicles, vehicleTotal } from '../src/utils/quotationVehicles.js';

const ok = (body) => {
  const r = normalizeQuotationVehicles(body);
  assert.equal(r.ok, true, r.message);
  return r;
};
const bad = (body) => {
  const r = normalizeQuotationVehicles(body);
  assert.equal(r.ok, false, 'expected a validation error');
  assert.ok(typeof r.message === 'string' && r.message.length > 8);
  return r.message;
};
const suv = (over = {}) => ({ vehicleType: 'SUV (Innova Crysta)', seats: 7, quantity: 2, acType: 'AC', rate: 18500, notes: 'With driver', ...over });

test('a request that carries neither vehicles nor trip details leaves them alone', () => {
  const r = ok({ status: 'Sent' });
  assert.equal(r.vehicles, undefined);
  assert.equal(r.landService, undefined);
  assert.equal(r.total, undefined);
});

test('vehicles are tidied and the total is quantity x rate, summed', () => {
  const r = ok({ vehicles: [suv(), suv({ vehicleType: '  Tempo   Traveller (12 seater) ', seats: '12', quantity: '1', rate: '32000.456', notes: '' })] });
  assert.deepEqual(r.vehicles[0], { vehicleType: 'SUV (Innova Crysta)', seats: 7, quantity: 2, acType: 'AC', rate: 18500, notes: 'With driver' });
  assert.deepEqual([r.vehicles[1].vehicleType, r.vehicles[1].seats, r.vehicles[1].quantity, r.vehicles[1].rate], ['Tempo Traveller (12 seater)', 12, 1, 32000.46]);
  assert.equal(r.total, 69000.46, '2 x 18,500 + 1 x 32,000.46, to the paisa');
  assert.equal(vehicleTotal([]), 0);
  assert.equal(vehicleTotal(undefined), 0);
});

test('missing numbers get sensible defaults (one vehicle, AC, no rate yet)', () => {
  const [v] = ok({ vehicles: [{ vehicleType: 'Sedan' }] }).vehicles;
  assert.deepEqual([v.seats, v.quantity, v.acType, v.rate, v.notes], [0, 1, 'AC', 0, '']);
});

test('trip details are tidied', () => {
  const r = ok({ landService: { route: ' Delhi  -  Agra - Jaipur ', pickupPoint: 'IGI Airport', dropPoint: '', kmPolicy: '250 km per day', priceNote: 'GST extra' } });
  assert.deepEqual(r.landService, { route: 'Delhi - Agra - Jaipur', pickupPoint: 'IGI Airport', dropPoint: '', kmPolicy: '250 km per day', priceNote: 'GST extra' });
  assert.deepEqual(ok({ landService: {} }).landService, { route: '', pickupPoint: '', dropPoint: '', kmPolicy: '', priceNote: '' });
});

test('every problem is explained in plain language and names the vehicle', () => {
  assert.equal(bad({ vehicles: 'car' }), 'The vehicles must be a list.');
  assert.match(bad({ vehicles: Array.from({ length: L.vehicles + 1 }, () => suv()) }), /at most 20 vehicles \(there are 21\)/);
  assert.match(bad({ vehicles: [suv(), 'oops'] }), /^Vehicle 2 is not valid\./);
  assert.equal(bad({ vehicles: [suv({ vehicleType: '  ' })] }), 'Please enter the vehicle type for vehicle 1.');
  assert.match(bad({ vehicles: [suv({ vehicleType: 'x'.repeat(L.type + 1) })] }), /vehicle type for vehicle 1 is too long/i);
  assert.match(bad({ vehicles: [suv({ seats: 'many' })] }), /number of seats of vehicle 1 must be a whole number from 0 to 100/);
  assert.match(bad({ vehicles: [suv({ quantity: 0 })] }), /number of vehicles in line 1 must be a whole number from 1 to 99/);
  assert.match(bad({ vehicles: [suv({ quantity: 2.5 })] }), /number of vehicles in line 1/);
  assert.equal(bad({ vehicles: [suv(), suv({ acType: 'Heated' })] }), 'Please choose AC or Non-AC for vehicle 2.');
  assert.match(bad({ vehicles: [suv({ rate: -1 })] }), /rate of vehicle 1 must be an amount from 0 to/);
  assert.match(bad({ vehicles: [suv({ rate: { $gt: 0 } })] }), /rate of vehicle 1/);
  assert.match(bad({ vehicles: [suv({ rate: 5e12 })] }), /rate of vehicle 1/);
  assert.match(bad({ landService: 'Delhi' }), /trip details must be a set of fields/);
  assert.match(bad({ landService: { route: 'x'.repeat(L.route + 1) } }), /route is too long/i);
});

test('property: whatever arrives, the answer is a clear message or vehicles that obey every limit; the total is right; cleaning twice changes nothing', () => {
  const text = fc.oneof(fc.string({ maxLength: 30 }), fc.constantFrom('<script>x</script>', '\u0000', 'x'.repeat(300), 'AC', 'Non-AC'), fc.integer({ min: -5, max: 200 }), fc.double({ noNaN: true, min: -10, max: 1e10 }), fc.constant(null));
  const vehicle = fc.record({ vehicleType: text, seats: text, quantity: text, acType: text, rate: text, notes: text }, { requiredKeys: [] });
  fc.assert(
    fc.property(fc.record({ vehicles: fc.oneof(text, fc.array(vehicle, { maxLength: 4 })), landService: fc.oneof(text, fc.record({ route: text, priceNote: text }, { requiredKeys: [] })) }, { requiredKeys: [] }), (body) => {
      const r = normalizeQuotationVehicles(body);
      if (!r.ok) {
        assert.equal(typeof r.message, 'string');
        return;
      }
      for (const v of r.vehicles || []) {
        assert.ok(v.vehicleType.length > 0 && v.vehicleType.length <= L.type);
        assert.ok(Number.isInteger(v.seats) && v.seats >= 0 && v.seats <= L.seats);
        assert.ok(Number.isInteger(v.quantity) && v.quantity >= 1 && v.quantity <= L.quantity);
        assert.ok(['AC', 'Non-AC', ''].includes(v.acType));
        assert.ok(Number.isFinite(v.rate) && v.rate >= 0 && v.rate <= L.maxRate);
      }
      if (r.vehicles) {
        assert.equal(r.total, vehicleTotal(r.vehicles));
        assert.ok(r.total >= 0);
        assert.deepEqual(normalizeQuotationVehicles({ vehicles: r.vehicles }).vehicles, r.vehicles);
      }
      if (r.landService) assert.deepEqual(normalizeQuotationVehicles({ landService: r.landService }).landService, r.landService);
    }),
    { numRuns: 400 }
  );
});
