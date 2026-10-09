// index.js
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { readFileSync } from "node:fs";
import { publicOrigin, renderPage } from "./social.js";

import { MemoryCache } from "./cache.js";
import { fetchIRailJSON, buildUserAgent } from "./irail.js";
import { extractStations, buildSearchIndex } from "./stationIndex.js";
import { createSimpleRateLimiter, pruneLimiterMap } from "./rateLimit.js";

const app = express();
// Preserve scalar query validation when upgrading from Express 4 to Express 5.
app.set("query parser", "extended");
const PORT = Number(process.env.PORT || 8080);

const APP_NAME = process.env.APP_NAME || "Stationsbord";
const APP_VERSION = process.env.APP_VERSION || "0.9.1";
const APP_WEBSITE = process.env.APP_WEBSITE || "https://example.invalid";
const APP_EMAIL = process.env.APP_EMAIL || "hello@example.invalid";

const USER_AGENT = buildUserAgent({
  appName: APP_NAME,
  appVersion: APP_VERSION,
  website: APP_WEBSITE,
  email: APP_EMAIL,
});

app.disable("x-powered-by");
// Fly has one trusted ingress hop. Leave direct/self-hosted installs untrusted.
if (process.env.FLY_APP_NAME) app.set("trust proxy", 1);
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
  );
  next();
});
const cache = new MemoryCache();
const pending = new Map();
async function sharedFetch(key, pathQ, options) {
  if (!pending.has(key)) {
    const promise = fetchIRailJSON(pathQ, options).finally(() =>
      pending.delete(key),
    );
    pending.set(key, promise);
  }
  return pending.get(key);
}

const takeGlobalToken = createSimpleRateLimiter({ perSecond: 3, burst: 5 });

const ipBuckets = new Map();
function getIp(req) {
  return String(req.ip || req.socket?.remoteAddress || "unknown");
}
function takeIpToken(req) {
  const ip = getIp(req);
  let bucket = ipBuckets.get(ip);
  if (!bucket) {
    bucket = createSimpleRateLimiter({ perSecond: 1.5, burst: 3 });
    ipBuckets.set(ip, bucket);
  }
  return bucket();
}

const cleanup = setInterval(() => {
  cache.pruneExpired();
  pruneLimiterMap(ipBuckets);
}, 60_000);
cleanup.unref();
const stationIndexes = new Map();
function getStationIndex(lang) {
  return stationIndexes.get(lang) || buildSearchIndex([]);
}
function setStationIndex(lang, stations) {
  stationIndexes.set(lang, buildSearchIndex(stations));
}

/* Resolve paths */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* Helpers */
function isTransientUpstreamError(e) {
  const status = Number(e?.status || 0);
  const msg = String(e?.message || "").toLowerCase();
  return (
    status === 429 ||
    status >= 500 ||
    msg.includes("timeout") ||
    msg.includes("fetch failed")
  );
}

/** Keep cache keys stable even if param insertion order changes later */
function stableParamsKey(params) {
  // URLSearchParams -> sorted key string
  const entries = [];
  for (const [k, v] of params.entries()) entries.push([k, v]);
  entries.sort((a, b) =>
    a[0] === b[0]
      ? String(a[1]).localeCompare(String(b[1]))
      : a[0].localeCompare(b[0]),
  );
  return entries.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
}

function normalizeLang(raw) {
  const v = String(raw || "en")
    .toLowerCase()
    .trim();
  // Keep it strict so we don't fragment the cache with nonsense
  const allowed = new Set(["en", "nl", "fr", "de"]);
  return allowed.has(v) ? v : "en";
}

function normalizeArrdep(raw) {
  const v = String(raw || "departure")
    .toLowerCase()
    .trim();
  const allowed = new Set(["departure", "arrival"]);
  return allowed.has(v) ? v : "departure";
}

function normalizeAlerts(raw) {
  const v = String(raw ?? "false")
    .toLowerCase()
    .trim();
  return v === "true" ? "true" : "false";
}

function normalizeDateDDMMYY(raw) {
  if (raw == null || raw === "") return null;
  const s = String(raw).trim();
  if (!/^\d{6}$/.test(s)) return null;
  const day = Number(s.slice(0, 2)),
    month = Number(s.slice(2, 4)),
    year = 2000 + Number(s.slice(4));
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? s
    : null;
}

function normalizeTimeHHMM(raw) {
  if (raw == null || raw === "") return null;
  const s = String(raw).trim();
  if (!/^\d{4}$/.test(s)) return null;
  const hh = Number(s.slice(0, 2));
  const mm = Number(s.slice(2, 4));
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return s;
}

async function cachedProxy(
  req,
  res,
  { keyPrefix, pathQ, params, timeoutMs, transformJson },
) {
  const stableKey = stableParamsKey(params);
  const key = `${keyPrefix}:${stableKey}`;

  const cached = cache.get(key);
  const peek = cache.peek(key);
  if (cached?.value) {
    res.setHeader("X-Cache", "HIT");
    return res.json(cached.value);
  }

  const etag = peek?.etag;

  // fairness + upstream protection
  if (!pending.has(key) && (!takeIpToken(req) || !takeGlobalToken())) {
    if (peek?.value) {
      res.setHeader("X-Cache", "STALE(local-rate-limit)");
      return res.json(peek.value);
    }
    res.setHeader("Retry-After", "2");
    return res.status(429).json({ error: "Local rate limit reached" });
  }

  let out;
  try {
    out = await sharedFetch(key, pathQ, {
      userAgent: USER_AGENT,
      etag,
      ...(timeoutMs ? { timeoutMs } : {}),
    });
  } catch (e) {
    if (isTransientUpstreamError(e) && peek?.value) {
      const status = Number(e?.status || 0);
      res.setHeader("X-Cache", `STALE(upstream-${status || "err"})`);
      return res.json(peek.value);
    }
    throw e;
  }

  const { status, etag: newEtag, ttlMs, json } = out;
  const responseJson =
    typeof transformJson === "function" ? transformJson(json) : json;

  if (status === 304 && peek?.value) {
    cache.set(key, { ttlMs, etag: newEtag ?? etag, value: peek.value });
    res.setHeader("X-Cache", "REVALIDATED(304)");
    return res.json(peek.value);
  }

  cache.set(key, { ttlMs, etag: newEtag, value: responseJson });
  res.setHeader("X-Cache", "MISS");
  return res.json(responseJson);
}

/* Health */
app.get("/health", (_req, res) =>
  res.json({ ok: true, name: APP_NAME, version: APP_VERSION }),
);

// Reject arrays/objects and oversized query values before building upstream URLs.
app.use("/api", (req, res, next) => {
  for (const value of Object.values(req.query)) {
    if (typeof value !== "string" || value.length > 200) {
      return res.status(400).json({ error: "Invalid query parameter" });
    }
  }
  next();
});

/* Stations: fetch + cache */
async function getStationsFresh(lang = "en") {
  const safeLang = normalizeLang(lang);
  const key = `stations:all:${safeLang}`;
  const cached = cache.get(key);
  const peek = cache.peek(key);

  if (cached?.value) return cached.value;

  const etag = peek?.etag;

  if (!pending.has(key) && !takeGlobalToken())
    throw Object.assign(new Error("Local rate limit reached"), { status: 429 });

  const {
    status,
    etag: newEtag,
    ttlMs,
    json,
  } = await sharedFetch(key, `/stations/?format=json&lang=${safeLang}`, {
    userAgent: USER_AGENT,
    etag,
  });

  if (status === 304 && peek?.value) {
    cache.set(key, { ttlMs, etag: newEtag ?? etag, value: peek.value });
    return peek.value;
  }

  const stations = extractStations(json);
  cache.set(key, { ttlMs, etag: newEtag, value: stations });
  setStationIndex(safeLang, stations);
  return stations;
}

app.get("/api/stations/refresh", async (_req, res) => {
  try {
    res.setHeader("Cache-Control", "no-store");
    const lang = normalizeLang(_req.query.lang);
    const stations = await getStationsFresh(lang);
    res.json({ count: stations.length, lang });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

app.get("/api/stations/search", async (req, res) => {
  try {
    res.setHeader("Cache-Control", "no-store");

    const lang = normalizeLang(req.query.lang);
    let stationIndex = getStationIndex(lang);
    if (!stationIndex.all.length) {
      await getStationsFresh(lang);
      stationIndex = getStationIndex(lang);
    }
    const q = String(req.query.q || "");
    const limit = Math.max(
      1,
      Math.min(50, Math.floor(Number(req.query.limit)) || 15),
    );
    res.json({ q, lang, results: stationIndex.search(q, limit) });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

/* Liveboard proxy (cached) */
app.get("/api/liveboard", async (req, res) => {
  try {
    res.setHeader("Cache-Control", "no-store");

    const id = req.query.id;
    const station = req.query.station;

    if (id && station)
      return res
        .status(400)
        .json({ error: "Use either id OR station, not both." });
    if (!id && !station)
      return res
        .status(400)
        .json({ error: "Missing required parameter: id or station" });

    const lang = normalizeLang(req.query.lang);
    const arrdep = normalizeArrdep(req.query.arrdep);
    const alerts = normalizeAlerts(req.query.alerts);

    const date = normalizeDateDDMMYY(req.query.date);
    if (req.query.date && !date) {
      return res
        .status(400)
        .json({ error: "Invalid date format. Expected DDMMYY." });
    }

    const timeNorm = normalizeTimeHHMM(req.query.time);
    if (req.query.time && !timeNorm) {
      return res
        .status(400)
        .json({ error: "Invalid time format. Expected HHMM." });
    }

    const params = new URLSearchParams();
    params.set("format", "json");
    params.set("lang", lang);
    params.set("arrdep", arrdep);
    params.set("alerts", alerts);

    if (id) params.set("id", String(id));
    if (station) params.set("station", String(station));
    if (date) params.set("date", String(date));
    if (timeNorm) params.set("time", timeNorm);

    const pathQ = `/liveboard/?${params.toString()}`;

    return await cachedProxy(req, res, {
      keyPrefix: "liveboard",
      pathQ,
      params,
      timeoutMs: undefined,
    });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

/* Disturbances proxy (cached) */
app.get("/api/disturbances", async (req, res) => {
  try {
    res.setHeader("Cache-Control", "no-store");

    const lang = normalizeLang(req.query.lang);

    // (1) fixed: only send when non-empty
    const lbcRaw = req.query.lineBreakCharacter;
    const lbc = lbcRaw != null ? String(lbcRaw) : "";

    const params = new URLSearchParams();
    params.set("format", "json");
    params.set("lang", lang);

    if (lbc && lbc.trim().length) {
      params.set("lineBreakCharacter", lbc);
    }

    const pathQ = `/disturbances/?${params.toString()}`;

    return await cachedProxy(req, res, {
      keyPrefix: "disturbances",
      pathQ,
      params,
      timeoutMs: undefined,
    });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

/* Vehicle proxy (cached, on-demand) */
app.get("/api/vehicle", async (req, res) => {
  try {
    res.setHeader("Cache-Control", "no-store");

    const id = req.query.id;
    if (!id)
      return res.status(400).json({ error: "Missing required parameter: id" });

    const lang = normalizeLang(req.query.lang);
    const alerts = normalizeAlerts(req.query.alerts);

    const date = normalizeDateDDMMYY(req.query.date);
    if (req.query.date && !date) {
      return res
        .status(400)
        .json({ error: "Invalid date format. Expected DDMMYY." });
    }

    const params = new URLSearchParams();
    params.set("format", "json");
    params.set("lang", lang);
    params.set("alerts", alerts);
    params.set("id", String(id));
    if (date) params.set("date", date);

    const pathQ = `/vehicle/?${params.toString()}`;

    return await cachedProxy(req, res, {
      keyPrefix: "vehicle",
      pathQ,
      params,
      // Vehicle is often slower: give it extra time.
      timeoutMs: 25000,
    });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

/* Composition proxy (cached, on-demand) */
app.get("/api/composition", async (req, res) => {
  try {
    res.setHeader("Cache-Control", "no-store");

    const id = req.query.id;
    if (!id)
      return res.status(400).json({ error: "Missing required parameter: id" });

    const lang = normalizeLang(req.query.lang);
    const data = String(req.query.data || "")
      .toLowerCase()
      .trim();
    if (data && data !== "all") {
      return res
        .status(400)
        .json({ error: "Invalid data parameter. Expected empty or all." });
    }

    const params = new URLSearchParams();
    params.set("format", "json");
    params.set("lang", lang);
    params.set("id", String(id));
    if (data === "all") params.set("data", "all");

    const pathQ = `/composition/?${params.toString()}`;

    return await cachedProxy(req, res, {
      keyPrefix: "composition",
      pathQ,
      params,
      // Composition is new and can be slower/less predictable.
      timeoutMs: 25000,
    });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// Social crawlers receive the complete preview without running JavaScript or
// requesting live data. Use the configured public origin for every crawler.
const PUBLIC_ORIGIN = publicOrigin(process.env.PUBLIC_BASE_URL);
const pageTemplate = readFileSync(
  path.join(__dirname, "public/index.html"),
  "utf8",
);
app.get(["/", "/index.html"], (req, res) => {
  const query = req.originalUrl.split("?").slice(1).join("?");
  res.setHeader("Cache-Control", "no-cache");
  res.type("html").send(renderPage(pageTemplate, query, PUBLIC_ORIGIN));
});

/* Static frontend (public/) — keep LAST */
app.use(
  express.static(path.join(__dirname, "public"), {
    setHeaders(res, filePath) {
      const isHTML = filePath.endsWith(".html");

      if (isHTML) {
        // always revalidate HTML
        res.setHeader("Cache-Control", "no-cache");
        return;
      }

      // aggressive cache for assets (best with versioned filenames or ?v=...)
      res.setHeader("Cache-Control", "public, max-age=3600, must-revalidate");
    },
  }),
);

app.listen(PORT, () => {
  console.log(`[${APP_NAME}] listening on :${PORT}`);
  console.log(`[${APP_NAME}] version: ${APP_VERSION}`);
  console.log(`[${APP_NAME}] User-Agent: ${USER_AGENT}`);
  console.log(`[${APP_NAME}] IRAIL_BASE_URL: ${process.env.IRAIL_BASE_URL}`);
});
