import './helpers.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defaultRightsTable } from '../src/config/rights.js';

// docs/RIGHTS.md shows the built-in defaults. It is generated from the code, so it can never say something the system does not do.

test('the defaults table in docs/RIGHTS.md matches the code', () => {
  const doc = fs.readFileSync(fileURLToPath(new URL('../../docs/RIGHTS.md', import.meta.url)), 'utf8').replace(/\r\n/g, '\n');
  const match = doc.match(/<!-- rights-table:start -->\n([\s\S]*?)\n<!-- rights-table:end -->/);
  assert.ok(match, 'docs/RIGHTS.md has lost its rights-table markers');
  assert.equal(match[1], defaultRightsTable(), 'docs/RIGHTS.md is out of date: paste the output of defaultRightsTable() between the markers');
});

test('the table covers every module and every role, and promises delete to Admin only', () => {
  const table = defaultRightsTable();
  for (const word of ['guest_list', 'hotels', 'itineraries', 'confirmations', 'Viewer']) assert.ok(table.includes(word), word);
  const rows = table.split('\n').slice(2);
  for (const row of rows) {
    const [, , sales, ops, viewer] = row.split('|').map((c) => c.trim());
    for (const cell of [sales, ops, viewer]) assert.ok(!/delete/.test(cell), `a non-Admin default includes delete: ${row}`);
  }
});
