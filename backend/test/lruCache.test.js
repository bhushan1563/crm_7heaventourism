import './helpers.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { LruCache } from '../src/utils/lruCache.js';

test('remembers what it was given and forgets the least recently used first', () => {
  const cache = new LruCache(100);
  cache.set('a', 'A', 40);
  cache.set('b', 'B', 40);
  assert.equal(cache.get('a'), 'A'); // a is now the most recent
  cache.set('c', 'C', 40); // over budget: b (least recent) goes
  assert.equal(cache.get('b'), undefined);
  assert.equal(cache.get('a'), 'A');
  assert.equal(cache.get('c'), 'C');
  assert.equal(cache.bytes, 80);
});

test('replacing a key does not double count, and an item bigger than the whole cache is never kept', () => {
  const cache = new LruCache(100);
  cache.set('a', 1, 60);
  cache.set('a', 2, 30);
  assert.equal(cache.bytes, 30);
  assert.equal(cache.get('a'), 2);
  cache.set('huge', 'x', 101);
  assert.equal(cache.get('huge'), undefined);
  assert.equal(cache.bytes, 30);
  cache.delete('a');
  assert.deepEqual([cache.bytes, cache.size], [0, 0]);
});

test('property: it never holds more than its budget, and the byte count always matches what is stored', () => {
  const op = fc.record({ key: fc.integer({ min: 0, max: 12 }), size: fc.integer({ min: 0, max: 80 }), kind: fc.constantFrom('set', 'set', 'get', 'delete') });
  fc.assert(
    fc.property(fc.array(op, { maxLength: 200 }), (ops) => {
      const cache = new LruCache(150);
      const sizes = new Map();
      for (const { key, size, kind } of ops) {
        if (kind === 'set') { cache.set(key, key, size); }
        else if (kind === 'get') cache.get(key);
        else cache.delete(key);
        assert.ok(cache.bytes <= 150);
        assert.ok(cache.bytes >= 0);
      }
      let sum = 0;
      for (const [, entry] of cache.map) sum += entry.size;
      assert.equal(sum, cache.bytes);
      void sizes;
    }),
    { numRuns: 400 }
  );
});
