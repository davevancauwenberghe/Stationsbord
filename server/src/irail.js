// irail.js
import { ttlFromHeaders } from "./cache.js";

const IRAIL_BASE = process.env.IRAIL_BASE_URL;

if (!IRAIL_BASE) {
  throw new Error("Missing required environment variable: IRAIL_BASE_URL");
}

const BASE = IRAIL_BASE.replace(/\/+$/, "");

// Default timeout (vehicle can override per-request)
const IRAIL_TIMEOUT_MS = Number(process.env.IRAIL_TIMEOUT_MS || 25000);

export function buildUserAgent({ appName, appVersion, website, email }) {
  const safe = (s) => String(s || "").replace(/[()]/g, "").trim();
  return `${safe(appName)}/${safe(appVersion)} (${safe(website)}; ${safe(email)})`;
}

function snippet(text, max = 240) {
  return String(text || "").replace(/\s+/g, " ").trim().slice(0, max);
}

export async function fetchIRailJSON(path, { userAgent, etag, timeoutMs } = {}) {
  const url = `${BASE}${path}`;

  const headers = {
    Accept: "application/json",
    "User-Agent": userAgent,
  };
  if (etag) headers["If-None-Match"] = etag;

  // Timeout support (override per-call)
  const effectiveTimeout = Number(timeoutMs || IRAIL_TIMEOUT_MS);

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), effectiveTimeout);

  let res;
  try {
    res = await fetch(url, { headers, signal: controller.signal });
  } catch (err) {
    if (err?.name === "AbortError") {
      const e = new Error(`iRail timeout after ${effectiveTimeout}ms for ${path}`);
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

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const ctHint = contentType ? ` (${contentType})` : "";
    const e = new Error(
      `iRail error ${res.status}${ctHint} for ${path}: ${snippet(text, 300)}`
    );
    e.status = res.status;
    throw e;
  }

  // OK but not JSON (yes, it happens)
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
