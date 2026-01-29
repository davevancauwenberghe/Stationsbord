// rateLimit.js

export function createSimpleRateLimiter({ perSecond = 3, burst = 5 } = {}) {
  perSecond = Math.max(0, Number(perSecond) || 0);
  burst = Math.max(0, Number(burst) || 0);

  // Token bucket
  const capacity = perSecond + burst;
  let tokens = capacity;
  let lastRefill = Date.now();

  const meta = {
    createdAt: Date.now(),
    lastSeenAt: Date.now(),
  };

  function refill() {
    const now = Date.now();
    const elapsed = (now - lastRefill) / 1000;
    if (elapsed <= 0) return;

    tokens = Math.min(capacity, tokens + elapsed * perSecond);
    lastRefill = now;
  }

  function touch() {
    meta.lastSeenAt = Date.now();
  }

  function takeToken() {
    touch();
    refill();
    if (tokens >= 1) {
      tokens -= 1;
      return true;
    }
    return false;
  }

  // Optional helpers (safe to ignore)
  takeToken.touch = touch;
  takeToken.meta = meta;
  takeToken.peek = () => ({
    tokens,
    capacity,
    perSecond,
    burst,
    lastRefill,
    createdAt: meta.createdAt,
    lastSeenAt: meta.lastSeenAt,
  });

  return takeToken;
}

export function pruneLimiterMap(
  map,
  { ttlMs = 30 * 60 * 1000, maxSize = 5000 } = {}
) {
  if (!map || typeof map.size !== "number") return;

  const now = Date.now();
  ttlMs = Math.max(0, Number(ttlMs) || 0);
  maxSize = Math.max(0, Number(maxSize) || 0);

  // TTL prune (drop idle limiters)
  if (ttlMs > 0) {
    for (const [key, limiter] of map.entries()) {
      const lastSeenAt = limiter?.meta?.lastSeenAt;
      if (typeof lastSeenAt === "number" && now - lastSeenAt > ttlMs) {
        map.delete(key);
      }
    }
  }

  // Hard cap prune (drop oldest)
  if (maxSize > 0 && map.size > maxSize) {
    const entries = Array.from(map.entries()).map(([key, limiter]) => ({
      key,
      lastSeenAt: limiter?.meta?.lastSeenAt ?? 0,
    }));

    entries.sort((a, b) => a.lastSeenAt - b.lastSeenAt);

    const toDrop = map.size - maxSize;
    for (let i = 0; i < toDrop; i++) {
      map.delete(entries[i].key);
    }
  }
}
