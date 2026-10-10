// stationIndex.js
function normalizeStation(s) {
  if (!s || typeof s !== "object" || Array.isArray(s)) return null;
  // iRail uses both "id" and "@id", and sometimes name/standardname
  return {
    id: s.id ?? null,
    uri: s["@id"] ?? null,
    name: s.name ?? s.standardname ?? null,
    standardname: s.standardname ?? s.name ?? null,
    locationX: s.locationX ?? null,
    locationY: s.locationY ?? null,
  };
}

export function extractStations(payload) {
  // Docs example shows station: { ... } but in reality could be:
  // - station: { ... }
  // - station: [ ... ]
  // - stations: { station: [...] } (depending on format/version)
  const raw =
    payload?.station ?? payload?.stations?.station ?? payload?.stations ?? null;

  if (!raw) return [];

  if (Array.isArray(raw))
    return raw
      .map(normalizeStation)
      .filter(
        (s) =>
          s &&
          typeof s.id === "string" &&
          typeof s.name === "string" &&
          s.id &&
          s.name,
      );
  if (typeof raw === "object")
    return [normalizeStation(raw)].filter(
      (s) =>
        s &&
        typeof s.id === "string" &&
        typeof s.name === "string" &&
        s.id &&
        s.name,
    );

  return [];
}

function fold(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/ghent/g, "gent")
    .replace(/[-/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildSearchIndex(stations) {
  // Fold once per catalogue, rather than for every keystroke and station.
  const list = stations.slice().sort((a, b) => a.name.localeCompare(b.name));
  const indexed = list.map((station) => ({
    station,
    names: [...new Set([fold(station.name), fold(station.standardname)])],
  }));
  return {
    all: list,
    search(q, limit = 15) {
      const needle = fold(q);
      if (!needle) return [];
      const words = needle.split(" ");
      return indexed
        .map(({ station, names }) => {
          const scores = names.map((name) => {
            if (name === needle) return 0;
            if (name.startsWith(needle)) return 1;
            if (name.includes(needle)) return 2;
            if (words.every((word) => name.includes(word))) return 3;
            return Infinity;
          });
          return { station, score: Math.min(...scores) };
        })
        .filter(({ score }) => Number.isFinite(score))
        .sort((a, b) => a.score - b.score)
        .slice(0, limit)
        .map(({ station }) => station);
    },
  };
}
