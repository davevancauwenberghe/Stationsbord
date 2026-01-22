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

// ---- Stations ----
async function getStationsFresh() {
  const key = "stations:all";
  const cached = cache.get(key);
  const peek = cache.peek(key);

  if (cached?.value) return cached.value;

  const etag = peek?.etag;
  if (!takeToken()) throw Object.assign(new Error("Local rate limit reached"), { status: 429 });

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

// ---- Liveboard ----
app.get("/api/liveboard", async (req, res) => {
  try {
    const { id, station, date, time, arrdep = "departure", lang = "en", alerts = "false" } = req.query;

    if (id && station) return res.status(400).json({ error: "Use either id OR station" });
    if (!id && !station) return res.status(400).json({ error: "Missing id or station" });

    const params = new URLSearchParams();
    params.set("format", "json");
    params.set("lang", lang);
    params.set("arrdep", arrdep);
    params.set("alerts", alerts);
    if (id) params.set("id", id);
    if (station) params.set("station", station);
    if (date) params.set("date", date);
    if (time) params.set("time", time);

    const key = `liveboard:${params.toString()}`;
    const path = `/liveboard/?${params.toString()}`;

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
    res.json(json);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// ---- Disturbances ----
app.get("/api/disturbances", async (req, res) => {
  try {
    const params = new URLSearchParams({
      format: "json",
      lang: String(req.query.lang || "en"),
      lineBreakCharacter: String(req.query.lineBreakCharacter ?? "")
    });

    const key = `disturbances:${params.toString()}`;
    const path = `/disturbances/?${params.toString()}`;

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
    res.json(json);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// ---- Frontend ----
app.get("/", (_req, res) => {
res.type("html").send(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>Stationsbord</title>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>
:root{--bg:#0b1020;--card:#0f1733;--text:#eef1ff;--muted:#9aa3c7;--line:#1f2a5a;--red:#d23b3b;}
body{background:var(--bg);color:var(--text);font-family:system-ui,monospace;margin:20px}
input,select,button{padding:8px;border-radius:8px;border:1px solid var(--line);background:#111a3a;color:var(--text)}
.row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.board{margin-top:14px;border:1px solid var(--line);border-radius:12px;padding:12px;background:var(--card)}
.dep{display:grid;grid-template-columns:90px 1fr 80px;gap:10px;padding:6px 0;border-bottom:1px dashed var(--line)}
.dep:last-child{border-bottom:none}
.when{font-weight:900}
.platform{font-size:22px;font-weight:900;text-align:right}
.delay{color:var(--red);font-weight:900}
.pill{border:1px solid var(--line);padding:2px 8px;border-radius:999px;font-size:12px}
.pill.red{background:rgba(210,59,59,.15);border-color:var(--red);color:#ffb3b3}
.muted{color:var(--muted)}

/* overlay */
.overlay-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.55);display:none;z-index:50}
.overlay-backdrop.open{display:block}
.overlay{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:12px;max-width:900px;margin:40px auto}
.overlay-header{display:flex;justify-content:space-between;align-items:center}
.overlay-close{cursor:pointer}
.dist-item{border:1px solid var(--line);border-radius:10px;padding:8px;margin-top:8px}
</style>
</head>
<body>

<h1>Stationsbord</h1>

<div class="row">
<input id="q" placeholder="Search station"/>
<button id="search">Search</button>
<select id="results"></select>
<button id="load">Search</button>

<span class="pill" id="distPill">disturbances: —</span>
</div>

<div class="board" id="board">
<div class="muted">Search a station, pick it, then load departures.</div>
</div>

<div class="overlay-backdrop" id="distOverlayBackdrop">
<div class="overlay">
<div class="overlay-header">
<strong>Network disturbances</strong>
<button class="overlay-close" id="distOverlayClose">✕</button>
</div>
<div id="distOverlaySub" class="muted"></div>
<div id="distOverlayList"></div>
</div>
</div>

<script>
const q=document.getElementById('q'),searchBtn=document.getElementById('search'),results=document.getElementById('results');
const loadBtn=document.getElementById('load'),board=document.getElementById('board');
const distPill=document.getElementById('distPill');
const distOverlayBackdrop=document.getElementById('distOverlayBackdrop');
const distOverlayClose=document.getElementById('distOverlayClose');
const distOverlaySub=document.getElementById('distOverlaySub');
const distOverlayList=document.getElementById('distOverlayList');

let selected=null,lastDisturbances=[];

function escapeHtml(s){return String(s||'').replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\\"":"&quot;"}[c]))}

async function searchStations(){
const term=q.value.trim();results.innerHTML='';selected=null;if(!term)return;
const r=await fetch('/api/stations/search?q='+encodeURIComponent(term));
const d=await r.json();
for(const s of d.results){
const o=document.createElement('option');
o.value=s.id;o.textContent=s.name;o.dataset.name=s.name;
results.appendChild(o);
}
if(results.options.length){
results.selectedIndex=0;
selected={id:results.value,name:results.options[0].dataset.name};
}
}

results.onchange=()=>{const o=results.options[results.selectedIndex];selected={id:o.value,name:o.dataset.name}};
searchBtn.onclick=searchStations;
q.onkeydown=e=>e.key==='Enter'&&searchStations();

function fmtTime(u){return new Date(u*1000).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}

loadBtn.onclick=async()=>{
if(!selected)return alert('Pick station');
board.innerHTML='Loading…';
const r=await fetch('/api/liveboard?id='+encodeURIComponent(selected.id));
const d=await r.json();
const deps=d.departures?.departure||[];
let h='<strong>'+ (d.station||selected.name) +'</strong><hr>';
for(const x of deps.slice(0,20)){
const delay=Math.round((x.delay||0)/60);
h+=\`<div class="dep"><div class="when">\${fmtTime(x.time)}</div><div>to \${escapeHtml(x.station||'')}</div><div class="platform">\${x.platform||''} \${delay>0?'<span class="delay">+'+delay+'m</span>':''}</div></div>\`;
}
board.innerHTML=h||'No departures';
};

async function fetchDisturbances(){
try{
const r=await fetch('/api/disturbances');
const d=await r.json();
const items=Array.isArray(d.disturbance)?d.disturbance:[];
lastDisturbances=items;
distPill.textContent='disturbances: '+items.length;
distPill.classList.toggle('red',items.length>0);
}catch{distPill.textContent='disturbances: ?'}
}

function openOverlay(){distOverlayBackdrop.classList.add('open')}
function closeOverlay(){distOverlayBackdrop.classList.remove('open')}

distPill.onclick=async()=>{
openOverlay();
distOverlaySub.textContent='Loading…';
distOverlayList.innerHTML='';
const items=lastDisturbances.length?lastDisturbances:await fetchDisturbances()||[];
distOverlaySub.textContent=items.length+' item(s)';
for(const it of items){
const div=document.createElement('div');
div.className='dist-item';
div.innerHTML='<strong>'+escapeHtml(it.title)+'</strong><div>'+escapeHtml(it.description||'')+'</div>';
distOverlayList.appendChild(div);
}
};

distOverlayClose.onclick=closeOverlay;
distOverlayBackdrop.onclick=e=>e.target===distOverlayBackdrop&&closeOverlay();
document.onkeydown=e=>e.key==='Escape'&&closeOverlay();

fetchDisturbances();
</script>

</body>
</html>`);
});

app.listen(PORT, () => {
  console.log("[stationbord] listening on :" + PORT);
  console.log("[stationbord] User-Agent: " + USER_AGENT);
});
