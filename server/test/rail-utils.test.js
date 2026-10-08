import test from "node:test";
import assert from "node:assert/strict";
import {
  belgianParts,
  validDate,
  validTime,
  apiDate,
  fmtTime,
  safeLink,
  serviceDate,
  departures,
  disturbances,
  isPlanned,
  delayMinutes,
} from "../src/public/rail-utils.js";
import { messages } from "../src/public/i18n.js";
import { buildSearchIndex } from "../src/stationIndex.js";

test("Belgian time is consistent across midnight and daylight saving changes", () => {
  assert.deepEqual(belgianParts(new Date("2026-07-01T22:30:00Z")), {
    date: "2026-07-02",
    time: "00:30",
  });
  assert.deepEqual(belgianParts(new Date("2026-01-01T22:30:00Z")), {
    date: "2026-01-01",
    time: "23:30",
  });
  assert.deepEqual(belgianParts(new Date("2026-03-29T01:30:00Z")), {
    date: "2026-03-29",
    time: "03:30",
  });
  assert.equal(
    fmtTime(Date.parse("2026-07-01T22:30:00Z") / 1000, "en"),
    "00:30",
  );
});
test("date conversion rejects impossible dates and out-of-range times", () => {
  assert.equal(apiDate("2028-02-29"), "290228");
  for (const value of [
    "2026-02-29",
    "2026-04-31",
    "2026-13-01",
    "2026-00-01",
    "1999-12-31",
    "invalid",
  ])
    assert.equal(validDate(value), false, value);
  assert.equal(validTime("23:59"), true);
  for (const value of ["24:00", "11:60", "1:30", ""])
    assert.equal(validTime(value), false, value);
});
test("train details use the service date from the connection rather than midnight calendar date", () => {
  assert.equal(
    serviceDate(
      {
        departureConnection:
          "http://irail.be/connections/8892007/20260701/IC1800",
      },
      "2026-07-02",
    ),
    "2026-07-01",
  );
  assert.equal(
    serviceDate(
      {
        arrivalConnection:
          "http://irail.be/connections/8892007/20260230/IC1800",
      },
      "2026-03-01",
    ),
    "2026-03-01",
  );
});
test("links allow only HTTP(S), including encoded iRail links", () => {
  assert.equal(safeLink("javascript:alert(1)"), "");
  assert.equal(safeLink("data:text/html,<h1>bad</h1>"), "");
  assert.equal(
    safeLink("https%3A%2F%2Fwww.belgiantrain.be%2Ftest"),
    "https://www.belgiantrain.be/test",
  );
});
test("arrival/departure extraction supports singleton responses and sorts scheduled times", () => {
  assert.deepEqual(
    departures({ arrivals: { arrival: { time: "2" } } }, "arrival"),
    [{ time: "2" }],
  );
  assert.deepEqual(
    departures(
      { departures: { departure: [{ time: 3 }, { time: 1 }] } },
      "departure",
    ).map((r) => r.time),
    [1, 3],
  );
  assert.deepEqual(departures({}, "departure"), []);
});
test("network classification uses the type field, not incidental words in descriptions", () => {
  const values = disturbances({
    disturbances: {
      disturbance: [
        { title: "A", type: "disturbance", description: "Unplanned delay" },
        { title: "B", type: "planned" },
      ],
    },
  });
  assert.equal(values.length, 2);
  assert.equal(isPlanned(values[0]), false);
  assert.equal(isPlanned(values[1]), true);
});
test("negative delays remain early, not positive delays", () => {
  assert.equal(delayMinutes(-60), -1);
  assert.equal(delayMinutes(30), 1);
  assert.equal(delayMinutes(null), null);
});
test("station search matches accents, separators and Gent/Ghent variants", () => {
  const index = buildSearchIndex([
    { id: "1", name: "Gent-Sint-Pieters", standardname: "Gent-Sint-Pieters" },
    { id: "2", name: "Liège-Guillemins", standardname: "Liège-Guillemins" },
  ]);
  assert.equal(index.search("Ghent")[0].id, "1");
  assert.equal(index.search("gent sint")[0].id, "1");
  assert.equal(index.search("liege")[0].id, "2");
});
test("all supported languages cover the complete UI vocabulary", () => {
  const keys = Object.keys(messages.en).sort();
  for (const [lang, dictionary] of Object.entries(messages))
    assert.deepEqual(Object.keys(dictionary).sort(), keys, lang);
});

test("board filtering retains original train indexes, cancellations and accent-insensitive matches", async () => {
  const { filterBoardRows } = await import("../src/public/rail-utils.js");
  const rows = [
    { station: "Brussel-Centraal", vehicle: "BE.NMBS.IC100" },
    {
      station: "Liège-Guillemins",
      vehicleinfo: { shortname: "IC 200" },
      canceled: "1",
    },
    { station: "Gent-Sint-Pieters", vehicle: "BE.NMBS.IC300" },
  ];
  assert.deepEqual(filterBoardRows(rows, "liege", "departure"), [
    { row: rows[1], index: 1 },
  ]);
  assert.deepEqual(filterBoardRows(rows, "IC 300", "departure"), [
    { row: rows[2], index: 2 },
  ]);
  assert.equal(filterBoardRows(rows, "", "arrival").length, 3);
  assert.equal(filterBoardRows(rows, "nothing", "departure").length, 0);
});

test("arrival filtering uses the origin, and departure filtering uses the displayed direction", async () => {
  const { filterBoardRows } = await import("../src/public/rail-utils.js");
  const rows = [{ station: "Gent", direction: { name: "Brugge" } }];
  assert.equal(filterBoardRows(rows, "brugge", "departure").length, 1);
  assert.equal(filterBoardRows(rows, "brugge", "arrival").length, 0);
  assert.equal(filterBoardRows(rows, "gent", "arrival").length, 1);
});
