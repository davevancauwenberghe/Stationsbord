// server/src/cache.js
export class MemoryCache {
  constructor() {
    /** @type {Map<string, { expiresAt: number, etag?: string, value?: any }>} */
    this.map = new Map();
  }

  get(key) {
    const v = this.map.get(key);
    if (!v) return null;
    if (Date.now() > v.expiresAt) {
      this.map.delete(key);
      return null;
    }
    return v;
  }

  set(key, { ttlMs, etag, value }) {
    this.map.set(key, {
      expiresAt: Date.now() + ttlMs,
      etag,
      value
    });
  }

  peek(key) {
    return this.map.get(key) ?? null;
  }
}

export function parseMaxAgeSeconds(cacheControl) {
  const m = cacheControl.match(/max-age=(\d+)/i);
  if (!m) return null;
  const s = Number(m[1]);
  return Number.isFinite(s) ? s : null;
}

export function ttlFromHeaders(headers, fallbackSeconds = 30) {
  const cc = headers.get("cache-control");
  const maxAge = parseMaxAgeSeconds(cc);
  const seconds = (maxAge != null ? maxAge : fallbackSeconds);
  return Math.max(1, seconds) * 1000;
}
