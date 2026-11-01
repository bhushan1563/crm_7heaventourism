// A small least-recently-used cache with a BYTE budget (not an item count). Used to keep the hottest photos in memory so
// repeated requests for them never reach the database. Everything is lost on restart, which is fine: it is only a cache.
export class LruCache {
  constructor(maxBytes) {
    this.maxBytes = maxBytes;
    this.bytes = 0;
    this.map = new Map(); // insertion order = recency order (oldest first)
  }

  get(key) {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    this.map.delete(key);
    this.map.set(key, entry); // now the most recent
    return entry.value;
  }

  set(key, value, size) {
    if (size > this.maxBytes) return; // bigger than the whole cache: never keep it
    const existing = this.map.get(key);
    if (existing) {
      this.bytes -= existing.size;
      this.map.delete(key);
    }
    this.map.set(key, { value, size });
    this.bytes += size;
    while (this.bytes > this.maxBytes) {
      const [oldestKey, oldest] = this.map.entries().next().value;
      this.map.delete(oldestKey);
      this.bytes -= oldest.size;
    }
  }

  delete(key) {
    const entry = this.map.get(key);
    if (!entry) return;
    this.bytes -= entry.size;
    this.map.delete(key);
  }

  get size() {
    return this.map.size;
  }
}
