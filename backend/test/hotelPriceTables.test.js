import './helpers.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeHotelInput } from '../src/utils/hotelInput.js';

const row = (label, over = {}) => ({ label, package: 18000, airfare: 0, visa: 0, tcs: 0, pax: 2, ...over });

test('the rules: tables are optional, tidied when sent, and explained in plain words when wrong', () => {
  const ok = (body, options) => {
    const r = normalizeHotelInput(body, options);
    assert.equal(r.ok, true, r.message);
    return r.data;
  };
  assert.equal('priceTables' in ok({ name: 'A', city: 'B' }), false, 'a hotel saved without tables has none yet');
  assert.deepEqual(ok({ priceTables: [{ name: '  Suite ', rows: [{ label: ' Adult ', package: '1000.456', pax: '2' }] }] }, { partial: true }).priceTables, [{ name: 'Suite', rows: [{ label: 'Adult', package: 1000.46, airfare: 0, visa: 0, tcs: 0, pax: 2 }] }]);
  assert.deepEqual(ok({ priceTables: [] }, { partial: true }), { priceTables: [] }, 'an emptied list is a real change');
  const bad = (priceTables) => normalizeHotelInput({ name: 'A', city: 'B', priceTables });
  assert.match(bad([{ name: 'Suite', rows: [row('Adult', { package: -1 })] }]).message, /The Package of "Adult" in Suite must be an amount/);
  assert.match(bad([{ name: 'Suite', rows: [row('Adult', { pax: 1.5 })] }]).message, /PAX of "Adult" in Suite/);
  assert.match(bad('free').message, /pricing tables must be a list/);
  assert.equal(bad(Array.from({ length: 7 }, () => ({ name: 'x', rows: [] }))).ok, false);
});
