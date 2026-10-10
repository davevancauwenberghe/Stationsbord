// cache.js
export class MemoryCache {
  constructor({ maxEntries = 500, staleMs = 5 * 60_000 } = {}) {
    this.maxEntries = maxEntries;
    this.staleMs = staleMs;
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
    this.map.delete(key);
    while (this.map.size >= this.maxEntries)
      this.map.delete(this.map.keys().next().value);
    this.map.set(key, {
      expiresAt: Date.now() + Math.max(1, safeTtl),
      etag,
      value,
    });
  }

  // Returns even expired entries (stale).
  peek(key) {
    const entry = this.map.get(key);
    if (!entry || Date.now() > entry.expiresAt + this.staleMs) {
      this.map.delete(key);
      return null;
    }
    return entry;
  }

  // Optional: manual cleanup if you ever want it
  pruneExpired() {
    const now = Date.now();
    for (const [k, v] of this.map) {
      if (now > v.expiresAt + this.staleMs) this.map.delete(k);
    }
  }
}

export function parseMaxAgeSeconds(cacheControl) {
  if (!cacheControl) return null;
  const value = String(cacheControl);
  // Responses are reused across clients: shared-cache freshness takes precedence,
  // regardless of directive order (RFC 9111 section 5.2.2.10).
  const m =
    value.match(/(?:^|,)\s*s-maxage\s*=\s*(?:"(\d+)"|(\d+))(?=\s*(?:,|$))/i) ??
    value.match(/(?:^|,)\s*max-age\s*=\s*(?:"(\d+)"|(\d+))(?=\s*(?:,|$))/i);
  if (!m) return null;
  const s = Number(m[1] ?? m[2]);
  return Number.isFinite(s) ? s : null;
}

export function ttlFromHeaders(headers, fallbackSeconds = 30) {
  const cc = headers.get("cache-control");
  const maxAge = parseMaxAgeSeconds(cc);
  const seconds = maxAge != null ? maxAge : fallbackSeconds;
  const age = Number(headers.get("age"));
  const elapsed = Number.isFinite(age) && age > 0 ? age : 0;
  return Math.max(0, seconds - elapsed) * 1000;
}
