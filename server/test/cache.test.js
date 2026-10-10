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

test("upstream Age reduces freshness and never gives expired data a fresh lifetime", () => {
  assert.equal(
    ttlFromHeaders(
      new Headers({ "cache-control": 'public, max-age="60"', age: "45" }),
    ),
    15_000,
  );
  assert.equal(
    ttlFromHeaders(new Headers({ "cache-control": "max-age=60", age: "90" })),
    0,
  );
  assert.equal(
    ttlFromHeaders(
      new Headers({
        "cache-control": "s-maxage=900, max-age=60",
        age: "invalid",
      }),
    ),
    900_000,
  );
  assert.equal(
    ttlFromHeaders(new Headers({ "cache-control": "x-max-age=900" })),
    30_000,
  );
});

test("shared cache prefers s-maxage regardless of directive order and preserves zero", () => {
  for (const control of [
    "s-maxage=900, max-age=60",
    "max-age=60, s-maxage=900",
    'public, S-MAXAGE = "900", max-age=60',
    "s-maxage=900",
  ]) {
    assert.equal(
      ttlFromHeaders(new Headers({ "cache-control": control, age: "45" })),
      855_000,
      control,
    );
  }
  for (const control of [
    "max-age=60, s-maxage=0",
    's-maxage="0", max-age=60',
  ]) {
    assert.equal(
      ttlFromHeaders(new Headers({ "cache-control": control })),
      0,
      control,
    );
  }
  assert.equal(
    ttlFromHeaders(
      new Headers({ "cache-control": "s-maxage=60, max-age=900", age: "90" }),
    ),
    0,
  );
});

test("shared cache falls back to max-age or its default without matching similar directives", () => {
  for (const control of [
    "x-s-maxage=900, max-age=60",
    "s-maxage=invalid, max-age=60",
    's-maxage="900, max-age=60',
  ]) {
    assert.equal(
      ttlFromHeaders(new Headers({ "cache-control": control })),
      60_000,
      control,
    );
  }
  assert.equal(
    ttlFromHeaders(new Headers({ "cache-control": "public" }), 12),
    12_000,
  );
});
