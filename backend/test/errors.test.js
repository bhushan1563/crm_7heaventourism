import './helpers.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import GuestModel from '../src/models/Guest.js';
import QuotationModel from '../src/models/Quotation.js';
import { friendlyMessage } from '../src/utils/errors.js';

test('missing required fields read like sentences, not driver output', async () => {
  const error = await new QuotationModel({}).validate().catch((e) => e);
  const message = friendlyMessage(error, 'Failed to create quotation');
  assert.match(message, /^Failed to create quotation: /);
  assert.match(message, /Client name is required\./);
  assert.match(message, /Destination is required\./);
  assert.ok(!/Path `|validation failed/i.test(message), `raw text leaked: ${message}`);
});

test('invalid enum and number / date values are explained', async () => {
  const bad = await new QuotationModel({ clientName: 'x', destination: 'y', status: 'Bogus' }).validate().catch((e) => e);
  assert.match(friendlyMessage(bad), /Status has an invalid value\./);

  const guest = await new GuestModel({ srNo: '1', guestNames: 'a', contactNumber: '1', destination: 'd', travelDate: '2027-01-01', sales: 's', ops: 'o', createdBy: 'x', paxCount: 'many' }).validate().catch((e) => e);
  assert.match(friendlyMessage(guest), /Pax count has an invalid number\./);
});

test('a bad id (CastError) and a duplicate key are translated', () => {
  const cast = new mongoose.Error.CastError('ObjectId', 'nope', '_id');
  assert.match(friendlyMessage(cast), /has an invalid value/);
  const duplicate = Object.assign(new Error('E11000 duplicate key error collection: x index: srNo_1 dup key: { srNo: "2026-001" }'), { code: 11000, keyPattern: { srNo: 1 } });
  assert.equal(friendlyMessage(duplicate, 'Failed to create guest inquiry'), 'Failed to create guest inquiry: Sr No already exists.');
});

test('unexpected errors keep their message in development', () => {
  const quiet = console.error;
  console.error = () => {};
  try {
    assert.equal(friendlyMessage(new Error('boom'), 'Failed'), 'Failed: boom');
  } finally {
    console.error = quiet;
  }
});
