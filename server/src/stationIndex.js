// stationIndex.js
function normalizeStation(s) {
  // iRail uses both "id" and "@id", and sometimes name/standardname
  return {
    id: s.id ?? null,
    uri: s["@id"] ?? null,
    name: s.name ?? s.standardname ?? null,
    standardname: s.standardname ?? s.name ?? null,
    locationX: s.locationX ?? null,
    locationY: s.locationY ?? null
  };
}

export function extractStations(payload) {
  // Docs example shows station: { ... } but in reality could be:
  // - station: { ... }
  // - station: [ ... ]
  // - stations: { station: [...] } (depending on format/version)
  const raw =
    payload?.station ??
    payload?.stations?.station ??
    payload?.stations ??
    null;

  if (!raw) return [];

  if (Array.isArray(raw)) return raw.map(normalizeStation).filter(s => s.id && s.name);
  if (typeof raw === "object") return [normalizeStation(raw)].filter(s => s.id && s.name);

  return [];
}

export function buildSearchIndex(stations) {
  // Simple in-memory list; for v0 we don’t need fancy trie/fuse.
  const list = stations.slice().sort((a, b) => a.name.localeCompare(b.name));
  return {
    all: list,
    search(q, limit = 15) {
      const needle = String(q || "").trim().toLowerCase();
      if (!needle) return [];
      const hits = [];
      for (const s of list) {
        const n = (s.name || "").toLowerCase();
        const sn = (s.standardname || "").toLowerCase();
        if (n.includes(needle) || sn.includes(needle)) {
          hits.push(s);
          if (hits.length >= limit) break;
        }
      }
      return hits;
    }
  };
}
