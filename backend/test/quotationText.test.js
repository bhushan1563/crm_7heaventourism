import './helpers.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { TEXT_LIMITS as L, normalizeQuotationText, richLine, richParagraph } from '../src/utils/quotationText.js';
import { looksLikeHtml, richToText } from '../src/utils/richText.js';

const ok = (r) => {
  assert.equal(r.ok, true, r.message);
  return r.value ?? r;
};
const bad = (r) => {
  assert.equal(r.ok, false, 'expected a validation error');
  assert.ok(typeof r.message === 'string' && r.message.length > 8);
  return r.message;
};

test('plain text is kept as typed, tidied like any one-line field', () => {
  assert.equal(ok(richLine('  Per   person (incl. GST) ', 'the price note', 100)), 'Per person (incl. GST)');
  assert.equal(ok(richLine('Rs 5 < 6 & more', 'the price note', 100)), 'Rs 5 < 6 & more', 'text that merely contains symbols is not markup');
  assert.equal(ok(richLine(undefined, 'x', 10)), '');
  assert.equal(ok(richLine(null, 'x', 10)), '');
  assert.equal(ok(richLine('', 'x', 10)), '');
});

test('formatted text is kept, and cleaned of anything that is not formatting', () => {
  assert.equal(ok(richLine('<p>Pay <strong>50%</strong> now</p>', 'the note', 100)), '<p>Pay <strong>50%</strong> now</p>');
  assert.equal(ok(richLine('<p onclick="x()"><span style="color:#dc2626;position:fixed">Hot</span></p><script>alert(1)</script>', 'the note', 100)), '<p><span style="color:#dc2626">Hot</span></p>');
  assert.equal(ok(richLine('<p></p>', 'the note', 100)), '');
});

test('the limit counts visible characters, not markup, and the message says so in plain words', () => {
  assert.equal(ok(richLine(`<p><strong>${'x'.repeat(100)}</strong></p>`, 'the note', 100)).includes('xxx'), true);
  assert.match(bad(richLine('x'.repeat(101), 'the price note', 100)), /^The price note is too long \(101 characters; the limit is 100\)/);
  assert.match(bad(richLine(`<p>${'x'.repeat(101)}</p>`, 'the price note', 100)), /too long/);
  assert.match(bad(richLine(42, 'the price note', 100)), /The price note must be text/);
  assert.match(bad(richLine({ $gt: '' }, 'the price note', 100)), /must be text/);
});

test('a paragraph keeps its line breaks when it is plain text', () => {
  assert.equal(ok(richParagraph('Line one\nLine two  ', 'the notes', 100)), 'Line one\nLine two');
  assert.equal(ok(richParagraph('<ul><li>One</li></ul>', 'the notes', 100)), '<ul><li>One</li></ul>');
});

test('a request that carries none of these texts changes nothing', () => {
  assert.deepEqual(normalizeQuotationText({ status: 'Sent', pricing: { grandTotal: 5 }, packageDetails: { hotels: [] } }), { ok: true });
  assert.deepEqual(normalizeQuotationText({}), { ok: true });
});

test('the price line, pricing notes, room allocation, flight note and end-of-tour banner are all cleaned', () => {
  const r = normalizeQuotationText({
    pricing: { totalCostNote: '<p><strong>Rs 60,000</strong> per person</p>', notes: 'GST extra\nTolls extra', grandTotal: 9 },
    packageDetails: { roomInfo: ' 1 Double + 1 Twin ', hotels: [] },
    flightTicketNote: '<p><mark style="background-color:#fde047">As per ticket</mark></p>',
    endOfTourNote: '***End of the Tour***'
  });
  assert.equal(r.ok, true);
  assert.deepEqual(r.pricing, { totalCostNote: '<p><strong>Rs 60,000</strong> per person</p>', notes: 'GST extra\nTolls extra' });
  assert.equal(r.roomInfo, '1 Double + 1 Twin');
  assert.equal(r.flightTicketNote, '<p><mark style="background-color:#fde047">As per ticket</mark></p>');
  assert.equal(r.endOfTourNote, '***End of the Tour***');
});

test('every problem is explained in plain words', () => {
  assert.match(bad(normalizeQuotationText({ pricing: { totalCostNote: 'x'.repeat(L.totalCostNote + 1) } })), /The price line is too long/);
  assert.match(bad(normalizeQuotationText({ pricing: { notes: 'x'.repeat(L.pricingNotes + 1) } })), /pricing notes/i);
  assert.match(bad(normalizeQuotationText({ packageDetails: { roomInfo: 'x'.repeat(L.roomInfo + 1) } })), /room allocation is too long/);
  assert.match(bad(normalizeQuotationText({ flightTicketNote: 12 })), /flight ticket note must be text/i);
  assert.match(bad(normalizeQuotationText({ endOfTourNote: 'x'.repeat(L.endOfTourNote + 1) })), /end-of-tour note is too long/);
  assert.match(bad(normalizeQuotationText({ pricing: { totalCostNote: { a: 1 } } })), /must be text/);
});

test('property: whatever arrives, the answer is a clear message or text that obeys the limit and is already clean', () => {
  const text = fc.oneof(fc.string({ maxLength: 60 }), fc.constantFrom('<p>x</p>', '<script>x</script>', '<p onclick="x">y</p>', '<span style="color:red">z</span>', '\u0000', 'x'.repeat(500), ''), fc.integer(), fc.constant(null));
  fc.assert(
    fc.property(text, fc.integer({ min: 5, max: 200 }), (value, max) => {
      const r = richLine(value, 'the note', max);
      if (!r.ok) {
        assert.equal(typeof r.message, 'string');
        return;
      }
      assert.ok(richToText(r.value).length <= max);
      assert.deepEqual(richLine(r.value, 'the note', max), { ok: true, value: r.value }); // cleaning twice changes nothing
      if (looksLikeHtml(r.value)) assert.ok(!/<script|onclick|javascript:/i.test(r.value)); // formatted text is clean; plain text is kept literally and always shown as text
    }),
    { numRuns: 400 }
  );
});
