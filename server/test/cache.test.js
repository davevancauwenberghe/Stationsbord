import test from "node:test";
import assert from "node:assert/strict";
import { MemoryCache, ttlFromHeaders } from "../src/cache.js";
import { createSimpleRateLimiter, pruneLimiterMap } from "../src/rateLimit.js";

test("expired cache entries have a bounded stale lifetime and are removed afterwards", (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: 1000 });
  const cache = new MemoryCache({ staleMs: 500 });
  cache.set("a", { ttlMs: 100, value: { ok: true }, etag: "x" });
  t.mock.timers.tick(101);
  assert.equal(cache.get("a"), null);
  assert.equal(cache.peek("a").etag, "x");
  t.mock.timers.tick(500);
  assert.equal(cache.peek("a"), null);
  assert.equal(cache.map.size, 0);
});
test("cache size stays bounded and refreshing an entry keeps it most recent", () => {
  const cache = new MemoryCache({ maxEntries: 2 });
  for (const key of ["a", "b", "a", "c"])
    cache.set(key, { ttlMs: 1000, value: key });
  assert.equal(cache.map.size, 2);
  assert.equal(cache.peek("b"), null);
  assert.equal(cache.peek("a").value, "a");
});
test("max-age zero is respected rather than replaced by the fallback TTL", () => {
  assert.equal(
    ttlFromHeaders(new Headers({ "cache-control": "public, max-age=0" })),
    0,
  );
  assert.equal(
    ttlFromHeaders(new Headers({ "cache-control": "public, max-age=60" })),
    60_000,
  );
});
test("idle rate limiter entries are pruned", (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: 1000 });
  const map = new Map([["old", createSimpleRateLimiter()]]);
  t.mock.timers.tick(101);
  map.set("new", createSimpleRateLimiter());
  pruneLimiterMap(map, { ttlMs: 100 });
  assert.deepEqual([...map.keys()], ["new"]);
});
