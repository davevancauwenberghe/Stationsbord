// server/src/irail.js
import { ttlFromHeaders } from "./cache.js";

const IRAIL_BASE = process.env.IRAIL_BASE_URL;

if (!IRAIL_BASE) {
  throw new Error("Missing required environment variable: IRAIL_BASE_URL");
}

const BASE = IRAIL_BASE.replace(/\/+$/, "");

// You can tune this if you want. 10–15s is reasonable for iRail.
const IRAIL_TIMEOUT_MS = Number(process.env.IRAIL_TIMEOUT_MS || 12000);

export function buildUserAgent({ appName, appVersion, website, email }) {
  const safe = (s) => String(s || "").replace(/[()]/g, "").trim();
  return `${safe(appName)}/${safe(appVersion)} (${safe(website)}; ${safe(email)})`;
}

function snippet(text, max = 240) {
  return String(text || "").replace(/\s+/g, " ").trim().slice(0, max);
}

export async function fetchIRailJSON(path, { userAgent, etag } = {}) {
  const url = `${BASE}${path}`;

  const headers = {
    Accept: "application/json",
    "User-Agent": userAgent,
  };
  if (etag) headers["If-None-Match"] = etag;

  // Timeout support
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), IRAIL_TIMEOUT_MS);

  let res;
  try {
    res = await fetch(url, { headers, signal: controller.signal });
  } catch (err) {
    if (err?.name === "AbortError") {
      const e = new Error(`iRail timeout after ${IRAIL_TIMEOUT_MS}ms for ${path}`);
      e.status = 504;
      throw e;
    }
    throw err;
  } finally {
    clearTimeout(t);
  }

  const resEtag = res.headers.get("etag") || undefined;
  const ttlMs = ttlFromHeaders(res.headers, 30);
  const contentType = (res.headers.get("content-type") || "").toLowerCase();

  if (res.status === 304) {
    return { status: 304, etag: resEtag ?? etag, ttlMs, json: null };
  }

  // Non-OK: read as text (could be HTML from a proxy), and return a clean error.
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const ctHint = contentType ? ` (${contentType})` : "";
    const e = new Error(
      `iRail error ${res.status}${ctHint} for ${path}: ${snippet(text, 300)}`
    );
    e.status = res.status;
    throw e;
  }

  // OK but not JSON? (e.g. upstream returned HTML with 200, it happens)
  if (!contentType.includes("application/json")) {
    const text = await res.text().catch(() => "");
    const ctHint = contentType ? ` (${contentType})` : "";
    const e = new Error(
      `iRail returned non-JSON${ctHint} for ${path}: ${snippet(text, 300)}`
    );
    e.status = 502;
    throw e;
  }

  const json = await res.json();
  return { status: res.status, etag: resEtag, ttlMs, json };
}
