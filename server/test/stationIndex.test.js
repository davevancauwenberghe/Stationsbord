import test from "node:test";
import assert from "node:assert/strict";
import { extractStations, buildSearchIndex } from "../src/stationIndex.js";

test("station catalogue ignores malformed entries without losing valid stations", () => {
  const station = { id: "BE.NMBS.1", name: "Gent-Sint-Pieters" };
  const result = extractStations({
    station: [null, false, "invalid", [], {}, { id: 7, name: "bad" }, station],
  });
  assert.equal(result.length, 1);
  assert.equal(result[0].name, station.name);
  assert.deepEqual(extractStations({ station: null }), []);
});

test("station search ranks exact and prefix matches before substrings and limits afterwards", () => {
  const stations = [
    "Aalst-Gent",
    "Gentbrugge",
    "Gent",
    "Gent-Sint-Pieters",
  ].map((name, id) => ({ id: String(id), name }));
  const index = buildSearchIndex(stations);
  assert.deepEqual(
    index.search("gent", 2).map((s) => s.name),
    ["Gent", "Gent-Sint-Pieters"],
  );
  assert.deepEqual(
    index.search("pieters gent").map((s) => s.name),
    ["Gent-Sint-Pieters"],
  );
  assert.deepEqual(
    index.search("ghent sint").map((s) => s.name),
    ["Gent-Sint-Pieters"],
  );
  assert.deepEqual(index.search("  "), []);
});

test("station search preserves translated standard names and accent folding", () => {
  const index = buildSearchIndex([
    { id: "1", name: "Liège-Guillemins", standardname: "Luik-Guillemins" },
  ]);
  assert.equal(index.search("liege").length, 1);
  assert.equal(index.search("luik").length, 1);
});
