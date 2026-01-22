// cache.js
export class MemoryCache {
  constructor() {
    /** @type {Map<string, { expiresAt: number, etag?: string, value?: any }>} */
    this.map = new Map();
  }

  // Fresh-only read. Keeps stale around for peek()/stale serving.
  get(key) {
    const v = this.map.get(key);
    if (!v) return null;
    if (Date.now() > v.expiresAt) return null;
    return v;
  }

  set(key, { ttlMs, etag, value }) {
    const safeTtl = Number.isFinite(ttlMs) ? ttlMs : 30_000;
    this.map.set(key, {
      expiresAt: Date.now() + Math.max(1, safeTtl),
      etag,
      value,
    });
  }

  // Returns even expired entries (stale).
  peek(key) {
    return this.map.get(key) ?? null;
  }

  // Optional: manual cleanup if you ever want it
  pruneExpired() {
    const now = Date.now();
    for (const [k, v] of this.map) {
      if (now > v.expiresAt) this.map.delete(k);
    }
  }
}

export function parseMaxAgeSeconds(cacheControl) {
  if (!cacheControl) return null;
  const m = String(cacheControl).match(/max-age=(\d+)/i);
  if (!m) return null;
  const s = Number(m[1]);
  return Number.isFinite(s) ? s : null;
}

export function ttlFromHeaders(headers, fallbackSeconds = 30) {
  const cc = headers.get("cache-control");
  const maxAge = parseMaxAgeSeconds(cc);
  const seconds = (maxAge != null ? maxAge : fallbackSeconds);
  return Math.max(1, Number(seconds) || fallbackSeconds) * 1000;
}
