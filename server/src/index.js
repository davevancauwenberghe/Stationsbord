// index.js
import express from "express";
import path from "path";
import { fileURLToPath } from "url";

import { MemoryCache } from "./cache.js";
import { fetchIRailJSON, buildUserAgent } from "./irail.js";
import { extractStations, buildSearchIndex } from "./stationIndex.js";
import { createSimpleRateLimiter } from "./rateLimit.js";

const app = express();
const PORT = Number(process.env.PORT || 8080);

const APP_NAME = process.env.APP_NAME || "stationbord";
const APP_VERSION = process.env.APP_VERSION || "0.1.0";
const APP_WEBSITE = process.env.APP_WEBSITE || "https://example.invalid";
const APP_EMAIL = process.env.APP_EMAIL || "hello@example.invalid";

const USER_AGENT = buildUserAgent({
  appName: APP_NAME,
  appVersion: APP_VERSION,
  website: APP_WEBSITE,
  email: APP_EMAIL,
});

const cache = new MemoryCache();
const takeToken = createSimpleRateLimiter({ perSecond: 3, burst: 5 });

let stationIndex = buildSearchIndex([]);

/* Resolve paths */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* Health */
app.get("/health", (_req, res) =>
  res.json({ ok: true, name: APP_NAME, version: APP_VERSION })
);

/* Stations: fetch + cache */
async function getStationsFresh() {
  const key = "stations:all";
  const cached = cache.get(key);
  const peek = cache.peek(key);

  if (cached?.value) return cached.value;

  const etag = peek?.etag;
  if (!takeToken())
    throw Object.assign(new Error("Local rate limit reached"), { status: 429 });

  const { status, etag: newEtag, ttlMs, json } = await fetchIRailJSON(
    `/stations/?format=json&lang=en`,
    { userAgent: USER_AGENT, etag }
  );

  if (status === 304 && peek?.value) {
    cache.set(key, { ttlMs, etag: newEtag ?? etag, value: peek.value });
    return peek.value;
  }

  const stations = extractStations(json);
  cache.set(key, { ttlMs, etag: newEtag, value: stations });
  stationIndex = buildSearchIndex(stations);
  return stations;
}

app.get("/api/stations/refresh", async (_req, res) => {
  try {
    const stations = await getStationsFresh();
    res.json({ count: stations.length });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

app.get("/api/stations/search", async (req, res) => {
  try {
    if (!stationIndex.all.length) await getStationsFresh();
    const q = req.query.q || "";
    const limit = Math.min(50, Number(req.query.limit || 15));
    res.json({ q, results: stationIndex.search(q, limit) });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

/* Liveboard proxy (cached) */
app.get("/api/liveboard", async (req, res) => {
  try {
    const {
      id,
      station,
      date,
      time,
      arrdep = "departure",
      lang = "en",
      alerts = "false",
    } = req.query;

    if (id && station)
      return res
        .status(400)
        .json({ error: "Use either id OR station, not both." });
    if (!id && !station)
      return res
        .status(400)
        .json({ error: "Missing required parameter: id or station" });

    const params = new URLSearchParams();
    params.set("format", "json");
    params.set("lang", String(lang));
    params.set("arrdep", String(arrdep));
    params.set("alerts", String(alerts));

    if (id) params.set("id", String(id));
    if (station) params.set("station", String(station));
    if (date) params.set("date", String(date));
    if (time) params.set("time", String(time));

    const pathQ = `/liveboard/?${params.toString()}`;
    const key = `liveboard:${params.toString()}`;

    const cached = cache.get(key);
    const peek = cache.peek(key);
    if (cached?.value) return res.json(cached.value);

    const etag = peek?.etag;
    if (!takeToken())
      return res.status(429).json({ error: "Local rate limit reached" });

    const { status, etag: newEtag, ttlMs, json } = await fetchIRailJSON(pathQ, {
      userAgent: USER_AGENT,
      etag,
    });

    if (status === 304 && peek?.value) {
      cache.set(key, { ttlMs, etag: newEtag ?? etag, value: peek.value });
      return res.json(peek.value);
    }

    cache.set(key, { ttlMs, etag: newEtag, value: json });
    return res.json(json);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

/* Disturbances proxy (cached) */
app.get("/api/disturbances", async (req, res) => {
  try {
    const lang = String(req.query.lang || "en");
    const lineBreakCharacter = String(req.query.lineBreakCharacter ?? "");

    const params = new URLSearchParams();
    params.set("format", "json");
    params.set("lang", lang);
    params.set("lineBreakCharacter", lineBreakCharacter);

    const pathQ = `/disturbances/?${params.toString()}`;
    const key = `disturbances:${params.toString()}`;

    const cached = cache.get(key);
    const peek = cache.peek(key);
    if (cached?.value) return res.json(cached.value);

    const etag = peek?.etag;
    if (!takeToken())
      return res.status(429).json({ error: "Local rate limit reached" });

    const { status, etag: newEtag, ttlMs, json } = await fetchIRailJSON(pathQ, {
      userAgent: USER_AGENT,
      etag,
    });

    if (status === 304 && peek?.value) {
      cache.set(key, { ttlMs, etag: newEtag ?? etag, value: peek.value });
      return res.json(peek.value);
    }

    cache.set(key, { ttlMs, etag: newEtag, value: json });
    return res.json(json);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

/* Vehicle proxy (cached, on-demand) */
app.get("/api/vehicle", async (req, res) => {
  try {
    const { id, date, lang = "en", alerts = "false" } = req.query;

    if (!id)
      return res.status(400).json({ error: "Missing required parameter: id" });

    if (date && !/^\d{6}$/.test(String(date))) {
      return res
        .status(400)
        .json({ error: "Invalid date format. Expected DDMMYY." });
    }

    const params = new URLSearchParams();
    params.set("format", "json");
    params.set("lang", String(lang));
    params.set("alerts", String(alerts));
    params.set("id", String(id));
    if (date) params.set("date", String(date));

    const pathQ = `/vehicle/?${params.toString()}`;
    const key = `vehicle:${params.toString()}`;

    const cached = cache.get(key);
    const peek = cache.peek(key);
    if (cached?.value) return res.json(cached.value);

    const etag = peek?.etag;
    if (!takeToken())
      return res.status(429).json({ error: "Local rate limit reached" });

    const { status, etag: newEtag, ttlMs, json } = await fetchIRailJSON(pathQ, {
      userAgent: USER_AGENT,
      etag,
    });

    if (status === 304 && peek?.value) {
      cache.set(key, { ttlMs, etag: newEtag ?? etag, value: peek.value });
      return res.json(peek.value);
    }

    cache.set(key, { ttlMs, etag: newEtag, value: json });
    return res.json(json);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
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
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    },
  })
);

app.listen(PORT, () => {
  console.log(`[${APP_NAME}] listening on :${PORT}`);
  console.log(`[${APP_NAME}] version: ${APP_VERSION}`);
  console.log(`[${APP_NAME}] User-Agent: ${USER_AGENT}`);
  console.log(`[${APP_NAME}] IRAIL_BASE_URL: ${process.env.IRAIL_BASE_URL}`);
});
