// server/src/irail.js
import { ttlFromHeaders } from "./cache.js";

const IRAIL_BASE = process.env.IRAIL_BASE_URL;

if (!IRAIL_BASE) {
  throw new Error(
    "Missing required environment variable: IRAIL_BASE_URL"
  );
}

const BASE = IRAIL_BASE.replace(/\/+$/, "");

export function buildUserAgent({ appName, appVersion, website, email }) {
  const safe = (s) => String(s || "").replace(/[()]/g, "").trim();
  return `${safe(appName)}/${safe(appVersion)} (${safe(website)}; ${safe(email)})`;
}

export async function fetchIRailJSON(path, { userAgent, etag } = {}) {
  const url = `${BASE}${path}`;

  const headers = {
    "Accept": "application/json",
    "User-Agent": userAgent
  };
  if (etag) headers["If-None-Match"] = etag;

  const res = await fetch(url, { headers });

  const resEtag = res.headers.get("etag") || undefined;
  const ttlMs = ttlFromHeaders(res.headers, 30);

  if (res.status === 304) {
    return { status: 304, etag: resEtag ?? etag, ttlMs, json: null };
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const err = new Error(`iRail error ${res.status} for ${path}: ${text.slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }

  const json = await res.json();
  return { status: res.status, etag: resEtag, ttlMs, json };
}
