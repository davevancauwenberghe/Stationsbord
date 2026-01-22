// index.js
import express from "express";
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
  email: APP_EMAIL
});

const cache = new MemoryCache();
const takeToken = createSimpleRateLimiter({ perSecond: 3, burst: 5 });

let stationIndex = buildSearchIndex([]);

// Health
app.get("/health", (_req, res) => res.json({ ok: true, name: APP_NAME, version: APP_VERSION }));

// ---- Stations: fetch + cache ----
async function getStationsFresh() {
  const key = "stations:all";
  const cached = cache.get(key);
  const peek = cache.peek(key);

  if (cached?.value) return cached.value;

  const etag = peek?.etag;
  if (!takeToken()) throw Object.assign(new Error("Local rate limit reached"), { status: 429 });

  const { status, etag: newEtag, ttlMs, json } = await fetchIRailJSON(`/stations/?format=json&lang=en`, {
    userAgent: USER_AGENT,
    etag
  });

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

// ---- Liveboard proxy (cached) ----
app.get("/api/liveboard", async (req, res) => {
  try {
    const { id, station, date, time, arrdep = "departure", lang = "en", alerts = "false" } = req.query;

    if (id && station) return res.status(400).json({ error: "Use either id OR station, not both." });
    if (!id && !station) return res.status(400).json({ error: "Missing required parameter: id or station" });

    const params = new URLSearchParams();
    params.set("format", "json");
    params.set("lang", String(lang));
    params.set("arrdep", String(arrdep));
    params.set("alerts", String(alerts));

    if (id) params.set("id", String(id));
    if (station) params.set("station", String(station));
    if (date) params.set("date", String(date)); // DDMMYY
    if (time) params.set("time", String(time)); // HHMM

    const path = `/liveboard/?${params.toString()}`;
    const key = `liveboard:${params.toString()}`;

    const cached = cache.get(key);
    const peek = cache.peek(key);

    if (cached?.value) return res.json(cached.value);

    const etag = peek?.etag;
    if (!takeToken()) return res.status(429).json({ error: "Local rate limit reached" });

    const { status, etag: newEtag, ttlMs, json } = await fetchIRailJSON(path, { userAgent: USER_AGENT, etag });

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

// ---- Vehicle proxy (cached, on-demand) ----
// Request-friendly: ONLY used when user clicks a row in the UI.
app.get("/api/vehicle", async (req, res) => {
  try {
    const { id, date, lang = "en", alerts = "false" } = req.query;

    if (!id) return res.status(400).json({ error: "Missing required parameter: id" });

    // date optional, ddmmyy
    if (date && !/^\d{6}$/.test(String(date))) {
      return res.status(400).json({ error: "Invalid date format. Expected DDMMYY." });
    }

    const params = new URLSearchParams();
    params.set("format", "json");
    params.set("lang", String(lang));
    params.set("alerts", String(alerts));
    params.set("id", String(id));
    if (date) params.set("date", String(date));

    const path = `/vehicle/?${params.toString()}`;
    const key = `vehicle:${params.toString()}`;

    const cached = cache.get(key);
    const peek = cache.peek(key);
    if (cached?.value) return res.json(cached.value);

    const etag = peek?.etag;
    if (!takeToken()) return res.status(429).json({ error: "Local rate limit reached" });

    const { status, etag: newEtag, ttlMs, json } = await fetchIRailJSON(path, { userAgent: USER_AGENT, etag });

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

// ---- Tiny frontend ----
app.get("/", (_req, res) => {
  res.type("html").send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>stationbord</title>
  <style>
    :root{
      --bg:#0b1020; --line:rgba(255,255,255,.12);
      --text:rgba(255,255,255,.92); --muted:rgba(255,255,255,.65);
      --accent:#2f7dff; --danger:#ff3b30;
    }
    *{box-sizing:border-box}
    body{
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
      margin:0; padding:22px;
      background: radial-gradient(1200px 600px at 20% -20%, rgba(47,125,255,.25), transparent 60%),
                  radial-gradient(900px 500px at 100% 0%, rgba(255,159,10,.12), transparent 60%),
                  var(--bg);
      color:var(--text);
    }
    h1{margin:0 0 14px 0; font-size:22px; letter-spacing:.3px;}

    input, select, button{
      font:inherit; padding:10px 10px; border-radius:10px;
      border:1px solid var(--line); background:rgba(255,255,255,.06);
      color:var(--text); outline:none;
    }
    input::placeholder{color:rgba(255,255,255,.45)}
    button{
      cursor:pointer; background:rgba(47,125,255,.18);
      border-color:rgba(47,125,255,.35);
      white-space: nowrap;
    }
    button:hover{background:rgba(47,125,255,.25)}
    .btn-ghost{background:rgba(255,255,255,.06); border-color:rgba(255,255,255,.14)}
    .btn-ghost:hover{background:rgba(255,255,255,.10)}

    .row{display:flex; gap:10px; flex-wrap:wrap; align-items:center;}
    .spacer{flex:1}

    .board{
      margin-top:16px; border:1px solid var(--line); border-radius:14px;
      padding:14px; background:rgba(255,255,255,.04); backdrop-filter: blur(8px);
    }
    .muted{color:var(--muted)}
    .pill{
      padding:2px 10px; border:1px solid var(--line); border-radius:999px;
      font-size:12px; color:var(--muted); display:inline-flex; align-items:center;
      gap:6px; height:22px;
    }

    /* Autocomplete */
    .autocomplete{position:relative; min-width:280px; flex:1; max-width:520px;}
    .stationRow{display:flex; gap:10px; align-items:center;}
    .stationRow input{flex:1; min-width: 220px;}

    .dropdown{
      position:absolute; top:calc(100% + 6px); left:0; right:0;
      background:rgba(15,23,51,.98);
      border:1px solid var(--line);
      border-radius:12px; overflow:hidden;
      box-shadow:0 14px 40px rgba(0,0,0,.45);
      display:none; z-index:50;
    }
    .dropdown.open{display:block}
    .dd-item{
      padding:10px 10px; border-bottom:1px solid rgba(255,255,255,.06);
      cursor:pointer; display:flex; justify-content:space-between;
      gap:10px; align-items:center;
    }
    .dd-item:last-child{border-bottom:none}
    .dd-item:hover{background:rgba(255,255,255,.06)}
    .dd-name{font-weight:800}
    .dd-id{font-size:12px; color:rgba(255,255,255,.55)}

    /* Controls */
    .controls{
      margin-top:10px; display:flex; gap:10px; flex-wrap:wrap; align-items:end;
    }
    .controls label{
      font-size:12px; color:rgba(255,255,255,.65);
      display:grid; gap:6px;
    }
    .small{width:160px}

    /* Board layout */
    .headerline{display:flex; flex-wrap:wrap; gap:10px; align-items:center; margin-bottom:10px;}
    .title{font-size:18px; font-weight:900; letter-spacing:.3px;}
    .deps{margin-top:8px}
    .dep{
      display:grid; grid-template-columns:110px 1fr 120px;
      gap:12px; padding:12px 8px; border-bottom:1px solid rgba(255,255,255,.08);
      align-items:center;
    }
    .dep:last-child{border-bottom:none}
    .when{font-size:28px; font-weight:900; letter-spacing:.5px;}
    .meta{font-size:12px; color:rgba(255,255,255,.6); margin-top:3px;}
    .to{font-size:18px; font-weight:800;}
    .right{justify-self:end; text-align:right; display:grid; gap:6px; justify-items:end;}
    .platform-badge{
      display:inline-grid; place-items:center;
      border:2px solid rgba(255,255,255,.85);
      border-radius:12px; width:66px; height:54px;
      background:rgba(255,255,255,.04);
    }
    .platform-badge .label{font-size:10px; color:rgba(255,255,255,.65); margin-top:-2px;}
    .platform-badge .num{font-size:26px; font-weight:1000; margin-top:-4px;}
    .delay{
      color:var(--danger); font-weight:1000;
      border:1px solid rgba(255,59,48,.45);
      background:rgba(255,59,48,.12);
    }
    .occ-low{border-color:rgba(52,199,89,.45); background:rgba(52,199,89,.12); color:rgba(255,255,255,.85);}
    .occ-med{border-color:rgba(255,159,10,.55); background:rgba(255,159,10,.12); color:rgba(255,255,255,.85);}
    .occ-high{border-color:rgba(255,59,48,.55); background:rgba(255,59,48,.12); color:rgba(255,255,255,.85);}
    .occ-unk{opacity:.7}

    /* Clickable destination */
    .toBtn{
      display:inline-flex;
      align-items:center;
      gap:8px;
      padding:0;
      border:none;
      background:transparent;
      color:var(--text);
      font:inherit;
      text-align:left;
      cursor:pointer;
    }
    .toBtn:hover{ text-decoration: underline; }
    .chev{opacity:.65; font-weight:900}

    /* Overlay modal */
    .overlay{
      position:fixed; inset:0;
      background:rgba(0,0,0,.55);
      display:none;
      z-index:200;
      padding:18px;
    }
    .overlay.open{display:block}
    .modal{
      max-width:820px;
      margin:0 auto;
      border:1px solid var(--line);
      border-radius:16px;
      background:rgba(15,23,51,.96);
      box-shadow:0 18px 60px rgba(0,0,0,.55);
      overflow:hidden;
    }
    .modalHeader{
      display:flex;
      align-items:center;
      gap:10px;
      padding:12px 14px;
      border-bottom:1px solid rgba(255,255,255,.10);
      background:rgba(255,255,255,.04);
    }
    .modalTitle{
      font-weight:1000;
      letter-spacing:.2px;
    }
    .closeBtn{
      margin-left:auto;
      padding:8px 10px;
      border-radius:12px;
      border:1px solid rgba(255,255,255,.14);
      background:rgba(255,255,255,.06);
      cursor:pointer;
      color:var(--text);
      font:inherit;
    }
    .closeBtn:hover{background:rgba(255,255,255,.10)}
    .modalBody{
      padding:14px;
    }
    .stops{
      margin-top:10px;
      border:1px solid rgba(255,255,255,.10);
      border-radius:14px;
      overflow:hidden;
      background:rgba(255,255,255,.03);
    }
    .stopRow{
      display:grid;
      grid-template-columns:120px 1fr 100px;
      gap:12px;
      padding:10px 12px;
      border-bottom:1px solid rgba(255,255,255,.08);
      align-items:center;
    }
    .stopRow:last-child{border-bottom:none}
    .stopTime{font-weight:1000}
    .stopStation{font-weight:900}
    .stopMeta{margin-top:4px; font-size:12px; color:rgba(255,255,255,.65); display:flex; gap:8px; flex-wrap:wrap; align-items:center;}
    .miniPill{
      padding:1px 8px;
      border:1px solid var(--line);
      border-radius:999px;
      font-size:12px;
      color:var(--muted);
      height:20px;
      display:inline-flex;
      align-items:center;
      gap:6px;
      background:rgba(255,255,255,.02);
    }
    .miniDelay{
      color:var(--danger);
      border-color:rgba(255,59,48,.45);
      background:rgba(255,59,48,.12);
      font-weight:1000;
    }
    .miniOk{
      border-color:rgba(52,199,89,.35);
      background:rgba(52,199,89,.10);
      color:rgba(255,255,255,.82);
    }
    .miniWarn{
      border-color:rgba(255,159,10,.45);
      background:rgba(255,159,10,.12);
      color:rgba(255,255,255,.82);
    }
    .miniExtra{
      border-color:rgba(47,125,255,.45);
      background:rgba(47,125,255,.12);
      color:rgba(255,255,255,.88);
    }

    @media (max-width:720px){
      .dep{grid-template-columns:92px 1fr 92px;}
      .when{font-size:22px;}
      .platform-badge{width:56px; height:48px;}
      .platform-badge .num{font-size:22px;}
      .to{font-size:16px;}
      .stopRow{grid-template-columns:90px 1fr 84px;}
    }
  </style>
</head>
<body>
  <h1>stationbord</h1>

  <div class="row">
    <div class="autocomplete">
      <div class="stationRow">
        <input id="q" placeholder="Type a station (e.g. Gent, Ghent, Bruxelles)" autocomplete="off" />
        <button id="searchBtn" title="Search liveboard">Search</button>
      </div>
      <div class="dropdown" id="dropdown"></div>
    </div>

    <div class="spacer"></div>
    <span class="pill" id="statusPill">ready</span>
  </div>

  <div class="controls">
    <label>
      Mode
      <select id="arrdep">
        <option value="departure" selected>Departures</option>
        <option value="arrival">Arrivals</option>
      </select>
    </label>

    <label>
      Date (DD/MM/YYYY)
      <input class="small" id="datePretty" placeholder="DD/MM/YYYY" inputmode="numeric" />
    </label>

    <label>
      Time (HH:MM)
      <input class="small" id="timePretty" placeholder="HH:MM" inputmode="numeric" />
    </label>

    <button class="btn-ghost" id="btnNow" title="Set to current time (local)">Now</button>
    <button class="btn-ghost" id="btnPlus1h" title="Add one hour from the currently selected time">+1h</button>

    <span class="muted">Leave date/time empty for “now”.</span>
  </div>

  <div class="board" id="board">
    <div class="muted">Start typing a station name. Pick from the dropdown. Then hit Search.</div>
  </div>

  <!-- Overlay -->
  <div class="overlay" id="overlay" aria-hidden="true">
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
      <div class="modalHeader">
        <div class="modalTitle" id="modalTitle">Train details</div>
        <span class="pill" id="modalPill">vehicle</span>
        <button class="closeBtn" id="overlayClose" type="button" aria-label="Close">✕</button>
      </div>
      <div class="modalBody" id="modalBody">
        <div class="muted">Loading…</div>
      </div>
    </div>
  </div>

<script>
const q = document.getElementById('q');
const dropdown = document.getElementById('dropdown');
const searchBtn = document.getElementById('searchBtn');
const board = document.getElementById('board');
const statusPill = document.getElementById('statusPill');

const arrdepEl = document.getElementById('arrdep');
const datePrettyEl = document.getElementById('datePretty'); // DD/MM/YYYY
const timePrettyEl = document.getElementById('timePretty'); // HH:MM
const btnNow = document.getElementById('btnNow');
const btnPlus1h = document.getElementById('btnPlus1h');

const overlay = document.getElementById('overlay');
const overlayClose = document.getElementById('overlayClose');
const modalTitle = document.getElementById('modalTitle');
const modalPill = document.getElementById('modalPill');
const modalBody = document.getElementById('modalBody');

let selected = null;
let lastResults = [];
let activeIdx = -1;
let typingTimer = null;
let inFlight = null;

// vehicle overlay fetch controller (abort on close)
let vehicleController = null;

function setStatus(text, kind = "normal") {
  statusPill.textContent = text;
  statusPill.className = "pill";
  if (kind === "loading") statusPill.style.borderColor = "rgba(47,125,255,.45)";
  else if (kind === "error") statusPill.style.borderColor = "rgba(255,59,48,.55)";
  else statusPill.style.borderColor = "var(--line)";
}

function openDropdown(){ dropdown.classList.add('open'); }
function closeDropdown(){ dropdown.classList.remove('open'); activeIdx = -1; }

function renderDropdown(results) {
  dropdown.innerHTML = '';
  if (!results.length) { closeDropdown(); return; }
  for (let i = 0; i < results.length; i++) {
    const s = results[i];
    const div = document.createElement('div');
    div.className = 'dd-item';
    div.dataset.idx = String(i);
    div.innerHTML =
      '<div><div class="dd-name">' + escapeHtml(s.name) + '</div></div>' +
      '<div class="dd-id">' + escapeHtml(s.id) + '</div>';
    div.addEventListener('mousedown', (e) => { e.preventDefault(); pickResult(i); });
    dropdown.appendChild(div);
  }
  openDropdown();
}

function highlightActive() {
  const items = dropdown.querySelectorAll('.dd-item');
  items.forEach((el, idx) => {
    el.style.background = (idx === activeIdx) ? 'rgba(255,255,255,.08)' : '';
  });
}

function pickResult(idx) {
  const s = lastResults[idx];
  if (!s) return;
  selected = { id: s.id, name: s.name };
  q.value = s.name;
  closeDropdown();
  setStatus('selected');
}

function escapeHtml(str) {
  return String(str || '')
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'","&#039;");
}

function fmtTime(unixSeconds) {
  const d = new Date(unixSeconds * 1000);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function normalizeOccName(occ) {
  const n = String(occ || 'unknown').toLowerCase();
  if (n.includes('low')) return { label: 'low', cls: 'occ-low' };
  if (n.includes('medium')) return { label: 'medium', cls: 'occ-med' };
  if (n.includes('high')) return { label: 'high', cls: 'occ-high' };
  return { label: 'unknown', cls: 'occ-unk' };
}

/* ---- Pretty input formatting ---- */
function formatDatePrettyOnInput() {
  const digits = datePrettyEl.value.replace(/\\D/g,'').slice(0,8);
  let out = '';
  for (let i = 0; i < digits.length; i++) {
    out += digits[i];
    if (i === 1 || i === 3) out += '/';
  }
  datePrettyEl.value = out;
}

function formatTimePrettyOnInput() {
  const digits = timePrettyEl.value.replace(/\\D/g,'').slice(0,4);
  let out = '';
  for (let i = 0; i < digits.length; i++) {
    out += digits[i];
    if (i === 1) out += ':';
  }
  timePrettyEl.value = out;
}

function prettyToIRailDate(ddmmyyyy) {
  const m = String(ddmmyyyy || '').match(/^(\\d{2})\\/(\\d{2})\\/(\\d{4})$/);
  if (!m) return '';
  const dd = m[1], mm = m[2], yyyy = m[3];
  return dd + mm + yyyy.slice(2);
}

function prettyToIRailTime(hhmm) {
  const m = String(hhmm || '').match(/^(\\d{2}):(\\d{2})$/);
  if (!m) return '';
  return m[1] + m[2];
}

function isValidTimePretty(v) {
  if (!/^\\d{2}:\\d{2}$/.test(v)) return false;
  const hh = Number(v.slice(0,2));
  const mm = Number(v.slice(3,5));
  return hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59;
}

/* ---- Now + +1h based on selected moment ---- */
function getSelectedMomentLocal() {
  const now = new Date();

  let year, month, day;
  const dm = datePrettyEl.value.trim().match(/^(\\d{2})\\/(\\d{2})\\/(\\d{4})$/);
  if (dm) {
    day = Number(dm[1]);
    month = Number(dm[2]);
    year = Number(dm[3]);
  } else {
    day = now.getDate();
    month = now.getMonth() + 1;
    year = now.getFullYear();
  }

  let hh, mm;
  const tm = timePrettyEl.value.trim().match(/^(\\d{2}):(\\d{2})$/);
  if (tm) {
    hh = Number(tm[1]);
    mm = Number(tm[2]);
  } else {
    hh = now.getHours();
    mm = now.getMinutes();
  }

  return new Date(year, month - 1, day, hh, mm, 0, 0);
}

function setMomentLocal(d) {
  const dd = String(d.getDate()).padStart(2,'0');
  const mm = String(d.getMonth()+1).padStart(2,'0');
  const yyyy = String(d.getFullYear());
  const hh = String(d.getHours()).padStart(2,'0');
  const mi = String(d.getMinutes()).padStart(2,'0');

  datePrettyEl.value = dd + '/' + mm + '/' + yyyy;
  timePrettyEl.value = hh + ':' + mi;
}

function setNow() { setMomentLocal(new Date()); }

datePrettyEl.addEventListener('input', formatDatePrettyOnInput);
timePrettyEl.addEventListener('input', formatTimePrettyOnInput);

btnNow.addEventListener('click', () => setNow());
btnPlus1h.addEventListener('click', () => {
  const base = getSelectedMomentLocal();
  base.setHours(base.getHours() + 1);
  setMomentLocal(base);
});

/* ---- Autocomplete ---- */
async function searchStationsAuto() {
  const term = q.value.trim();
  selected = null;
  if (term.length < 2) {
    dropdown.innerHTML = '';
    closeDropdown();
    setStatus('ready');
    return;
  }

  if (inFlight && typeof inFlight.abort === 'function') inFlight.abort();
  const controller = new AbortController();
  inFlight = controller;

  setStatus('searching…', 'loading');

  const r = await fetch('/api/stations/search?q=' + encodeURIComponent(term) + '&limit=12', {
    signal: controller.signal
  }).catch(err => {
    if (err && err.name === 'AbortError') return null;
    throw err;
  });
  if (!r) return;

  const data = await r.json();
  if (!r.ok) throw new Error(data.error || 'Search failed');

  lastResults = data.results || [];
  activeIdx = -1;
  renderDropdown(lastResults);
  setStatus(lastResults.length ? 'pick station' : 'no matches');
}

function debounceSearch() {
  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => {
    searchStationsAuto().catch(e => {
      setStatus('search error', 'error');
      closeDropdown();
      console.error(e);
    });
  }, 180);
}

q.addEventListener('input', debounceSearch);
q.addEventListener('focus', () => { if (lastResults.length) openDropdown(); });
q.addEventListener('blur', () => setTimeout(() => closeDropdown(), 120));

q.addEventListener('keydown', (e) => {
  if (!dropdown.classList.contains('open') && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
    if (lastResults.length) openDropdown();
  }

  if (dropdown.classList.contains('open')) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIdx = Math.min(lastResults.length - 1, activeIdx + 1);
      highlightActive();
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIdx = Math.max(0, activeIdx - 1);
      highlightActive();
      return;
    }
    if (e.key === 'Enter') {
      if (activeIdx >= 0) {
        e.preventDefault();
        pickResult(activeIdx);
        return;
      }
    }
    if (e.key === 'Escape') { closeDropdown(); return; }
  }

  // Enter triggers Search (if dropdown not open)
  if (e.key === 'Enter' && !dropdown.classList.contains('open')) {
    searchBtn.click();
  }
});

/* ---- Overlay helpers ---- */
function openOverlay() {
  overlay.classList.add('open');
  overlay.setAttribute('aria-hidden', 'false');
}

function closeOverlay() {
  overlay.classList.remove('open');
  overlay.setAttribute('aria-hidden', 'true');
  modalTitle.textContent = 'Train details';
  modalPill.textContent = 'vehicle';
  modalBody.innerHTML = '<div class="muted">Closed.</div>';

  if (vehicleController) {
    try { vehicleController.abort(); } catch (_e) {}
    vehicleController = null;
  }
}

overlayClose.addEventListener('click', closeOverlay);
overlay.addEventListener('mousedown', (e) => {
  // click outside modal closes
  if (e.target === overlay) closeOverlay();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && overlay.classList.contains('open')) closeOverlay();
});

function occMini(occ) {
  const o = normalizeOccName(occ);
  let cls = 'miniPill';
  if (o.label === 'low') cls += ' miniOk';
  else if (o.label === 'medium') cls += ' miniWarn';
  else if (o.label === 'high') cls += ' miniDelay';
  return '<span class="' + cls + '">occupancy: ' + o.label + '</span>';
}

function delayMini(seconds) {
  const mins = Math.round((Number(seconds || 0)) / 60);
  if (!mins) return '';
  return '<span class="miniPill miniDelay">+' + mins + 'm</span>';
}

function cancelledMini(flag) {
  return String(flag || '0') === '1' ? '<span class="miniPill miniDelay">cancelled</span>' : '';
}

function extraStopMini(flag) {
  return String(flag || '0') === '1' ? '<span class="miniPill miniExtra">extra stop</span>' : '';
}

async function loadVehicleDetails(vehicleId) {
  const prettyDate = datePrettyEl.value.trim();
  const dateIRail = prettyDate ? prettyToIRailDate(prettyDate) : '';

  modalTitle.textContent = 'Train details';
  modalPill.textContent = 'loading…';
  modalBody.innerHTML = '<div class="muted">Loading…</div>';
  openOverlay();

  if (vehicleController) {
    try { vehicleController.abort(); } catch (_e) {}
  }
  vehicleController = new AbortController();

  let url = '/api/vehicle?id=' + encodeURIComponent(vehicleId) + '&lang=en&alerts=false';
  if (dateIRail) url += '&date=' + encodeURIComponent(dateIRail);

  const r = await fetch(url, { signal: vehicleController.signal });
  const data = await r.json();

  if (!r.ok) {
    throw new Error(data.error || 'Vehicle request failed');
  }

  const vinfo = data.vehicleinfo || {};
  const short = vinfo.shortname || vinfo.name || data.vehicle || vehicleId;

  modalTitle.textContent = short;
  modalPill.textContent = 'stops';

  const stops = (data.stops && data.stops.stop) ? data.stops.stop : [];
  if (!stops.length) {
    modalBody.innerHTML =
      '<div class="muted">No stop list available for this vehicle.</div>' +
      '<div class="muted" style="margin-top:6px;">Tip: if you hit an iRail edge case, try a date closer to “now”.</div>';
    return;
  }

  let html = '';
  html += '<div class="row" style="gap:8px; align-items:center;">';
  html += '<span class="pill">vehicle</span>';
  html += '<span class="pill">' + escapeHtml(String(stops.length)) + ' stops</span>';
  if (data.timestamp) {
    html += '<span class="muted">updated: ' + new Date(data.timestamp * 1000).toLocaleString() + '</span>';
  }
  html += '</div>';

  html += '<div class="stops">';
  for (const s of stops) {
    const station = s.station || (s.stationinfo && (s.stationinfo.name || s.stationinfo.standardname)) || 'Unknown';
    const t = s.time != null ? fmtTime(s.time) : '--:--';
    const platform = (s.platform != null ? String(s.platform) : '?');

    const arrDelay = s.arrivalDelay != null ? s.arrivalDelay : 0;
    const depDelay = s.departureDelay != null ? s.departureDelay : 0;

    const anyDelay = Math.max(Number(arrDelay || 0), Number(depDelay || 0));

    const occ = (s.occupancy && (s.occupancy.name || s.occupancy['@id'])) ? (s.occupancy.name || 'unknown') : 'unknown';

    const p = '<span class="miniPill">pl ' + escapeHtml(platform) + '</span>';

    html += '<div class="stopRow">';
    html +=   '<div>';
    html +=     '<div class="stopTime">' + escapeHtml(t) + '</div>';
    html +=     '<div class="stopMeta">';
    html +=       p + delayMini(anyDelay) + cancelledMini(s.canceled) + cancelledMini(s.arrivalCanceled) + cancelledMini(s.departureCanceled) + extraStopMini(s.isExtraStop);
    html +=     '</div>';
    html +=   '</div>';

    html +=   '<div>';
    html +=     '<div class="stopStation">' + escapeHtml(station) + '</div>';
    html +=     '<div class="stopMeta">' + occMini(occ) + '</div>';
    html +=   '</div>';

    html +=   '<div style="justify-self:end; text-align:right;">';
    html +=     '<span class="miniPill">stop</span>';
    html +=   '</div>';
    html += '</div>';
  }
  html += '</div>';

  modalBody.innerHTML = html;
}

/* ---- Search liveboard ---- */
searchBtn.addEventListener('click', async () => {
  try {
    if (!selected && lastResults.length) pickResult(0);
    if (!selected) return alert('Pick a station from the dropdown first');

    const arrdep = arrdepEl.value;

    const prettyDate = datePrettyEl.value.trim();
    const dateIRail = prettyDate ? prettyToIRailDate(prettyDate) : '';

    const prettyTime = timePrettyEl.value.trim();
    const timeIRail = prettyTime ? prettyToIRailTime(prettyTime) : '';

    if (prettyTime && !isValidTimePretty(prettyTime)) {
      return alert('Time must be HH:MM (e.g. 07:30, 23:15).');
    }

    board.innerHTML = '<div class="muted">Loading…</div>';
    setStatus('loading…', 'loading');

    let url = '/api/liveboard?id=' + encodeURIComponent(selected.id)
      + '&arrdep=' + encodeURIComponent(arrdep)
      + '&lang=en&alerts=false';

    if (dateIRail) url += '&date=' + encodeURIComponent(dateIRail);
    if (timeIRail) url += '&time=' + encodeURIComponent(timeIRail);

    const r = await fetch(url);
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Liveboard failed');

    const deps = (data.departures && data.departures.departure) ? data.departures.departure : [];
    const title = data.station || selected.name || 'Station';
    const modeLabel = arrdep === 'arrival' ? 'arrivals' : 'departures';

    let momentLabel = '';
    if (prettyDate || prettyTime) {
      momentLabel = (prettyDate || '').trim() + (prettyTime ? (' ' + prettyTime) : '');
      momentLabel = momentLabel.trim();
    }

    let html = '<div class="headerline">'
      + '<div class="title">' + escapeHtml(title) + '</div>'
      + '<span class="pill">' + modeLabel + '</span>'
      + (momentLabel ? '<span class="pill">at ' + escapeHtml(momentLabel) + '</span>' : '')
      + '<span class="muted">updated: ' + new Date(data.timestamp * 1000).toLocaleString() + '</span>'
      + '</div>';

    if (!deps.length) {
      html += '<div class="muted" style="margin-top:10px;">No ' + modeLabel + ' found for this moment.</div>'
           + '<div class="muted" style="margin-top:6px;">Tip: if you hit an iRail 500 edge case, try a time closer to “now”.</div>';
      board.innerHTML = html;
      setStatus('no results');
      return;
    }

    html += '<div class="deps">';
    for (const d of deps.slice(0, 24)) {
      const when = fmtTime(d.time);
      const delayMin = Math.round((d.delay || 0) / 60);
      const delayPill = delayMin > 0 ? ('<span class="pill delay">+' + delayMin + 'm</span>') : '';

      const platform = (d.platform != null ? String(d.platform) : '?');
      const to = d.station || '';
      const trainShort = (d.vehicleinfo && (d.vehicleinfo.shortname || d.vehicleinfo.name))
        ? (d.vehicleinfo.shortname || d.vehicleinfo.name)
        : (d.vehicle || '');

      // Vehicle id for drill-down
      const vehicleId = (d.vehicleinfo && d.vehicleinfo.name) ? d.vehicleinfo.name : (d.vehicle || '');

      const occName = d.occupancy && (d.occupancy.name || d.occupancy["@id"]) ? (d.occupancy.name || '') : 'unknown';
      const occ = normalizeOccName(occName);

      const cancelled = String(d.canceled || '0') === '1';
      const cancelledPill = cancelled ? '<span class="pill delay">cancelled</span>' : '';

      html += '<div class="dep">'
        + '<div>'
        +   '<div class="when">' + escapeHtml(when) + '</div>'
        +   '<div class="meta">' + escapeHtml(trainShort) + (delayPill ? ' ' + delayPill : '') + (cancelledPill ? ' ' + cancelledPill : '') + '</div>'
        + '</div>'
        + '<div>'
        +   '<div class="to">'
        +     '<button class="toBtn" type="button" data-vehicle="' + escapeHtml(vehicleId) + '" title="Open train details">'
        +       escapeHtml(to) + ' <span class="chev">›</span>'
        +     '</button>'
        +   '</div>'
        +   '<div class="meta"><span class="pill ' + occ.cls + '">occupancy: ' + occ.label + '</span></div>'
        + '</div>'
        + '<div class="right">'
        +   '<div class="platform-badge">'
        +     '<div class="label">PLATFORM</div>'
        +     '<div class="num">' + escapeHtml(platform) + '</div>'
        +   '</div>'
        + '</div>'
        + '</div>';
    }
    html += '</div>';

    board.innerHTML = html;

    // Attach click handlers to destination buttons (request-friendly: one fetch per click)
    const btns = board.querySelectorAll('.toBtn');
    btns.forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          const vid = btn.getAttribute('data-vehicle') || '';
          if (!vid) return;
          await loadVehicleDetails(vid);
        } catch (e) {
          modalPill.textContent = 'error';
          modalBody.innerHTML = '<div class="muted">Error: ' + escapeHtml(e.message) + '</div>';
          openOverlay();
        }
      });
    });

    setStatus('ok');
  } catch (e) {
    board.innerHTML = '<div class="muted">Error: ' + escapeHtml(e.message) + '</div>';
    setStatus('error', 'error');
  }
});

/* ---- Init ---- */
setNow();
setStatus('ready');
</script>
</body>
</html>`);
});

app.listen(PORT, () => {
  console.log(`[stationbord] listening on :${PORT}`);
  console.log(`[stationbord] User-Agent: ${USER_AGENT}`);
});
