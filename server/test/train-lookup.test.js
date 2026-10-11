import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeTrainId,
  trainStops,
  matchesServiceDate,
  matchesBoardStop,
  previousServiceDate,
  journeyEndDate,
  nextStopIndex,
} from "../src/public/train-lookup.js";

const antwerp = { id: "BE.NMBS.008821006", name: "Antwerpen-Centraal" };
const dampoort = { id: "BE.NMBS.008893120", name: "Gent-Dampoort" };
// IC 723 on 11 October: Gent-Dampoort's connection URI is dated 12 October,
// while the journey starts in Antwerpen-Centraal the preceding evening.
const overnight = {
  stops: {
    stop: [
      {
        stationinfo: antwerp,
        scheduledDepartureTime: 1791754560,
        departureConnection:
          "http://irail.be/connections/8821006/20261011/IC723",
      },
      {
        stationinfo: dampoort,
        scheduledArrivalTime: 1791757320,
        scheduledDepartureTime: 1791757440,
        departureDelay: 600,
        departureConnection:
          "http://irail.be/connections/8893120/20261012/IC723",
      },
    ],
  },
};

test("midnight liveboard stops match their journey, not the following night's train", () => {
  const options = { stationId: dampoort.id, mode: "departure" };
  assert.equal(
    matchesBoardStop(overnight, { time: 1791757440 }, options),
    true,
  );
  assert.equal(
    matchesBoardStop(overnight, { time: 1791843840 }, options),
    false,
  );
  assert.equal(
    matchesBoardStop(overnight, { time: 1791758040 }, options),
    false,
    "delays do not change the scheduled matching instant",
  );
  assert.equal(
    matchesBoardStop(
      overnight,
      { time: 1791757440 },
      { stationId: antwerp.id },
    ),
    false,
  );
  assert.equal(matchesServiceDate(overnight, "2026-10-11"), true);
  assert.equal(matchesServiceDate(overnight, "2026-10-12"), false);
  assert.equal(
    journeyEndDate(trainStops(overnight), "2026-10-11"),
    "2026-10-12",
  );
});

test("overnight arrival boards and cancelled departures keep their scheduled anchor", () => {
  assert.equal(
    matchesBoardStop(
      overnight,
      { time: 1791757320 },
      { stationId: dampoort.id, mode: "arrival" },
    ),
    true,
  );
  assert.equal(
    matchesBoardStop(
      overnight,
      { time: 1791757320 },
      { stationId: dampoort.id, mode: "departure" },
    ),
    false,
  );
  const cancelled = structuredClone(overnight);
  cancelled.stops.stop[1].departureCanceled = "1";
  assert.equal(
    matchesBoardStop(
      cancelled,
      { time: 1791757440 },
      { stationId: dampoort.id },
    ),
    true,
  );
  assert.equal(
    matchesBoardStop(
      overnight,
      { time: 1791757440 },
      { stationId: "BE.NMBS.unknown" },
    ),
    false,
  );
  assert.equal(
    matchesBoardStop(overnight, {}, { stationId: dampoort.id }),
    true,
  );
});

test("previous service dates follow the calendar across DST, leap days and New Year", () => {
  for (const [date, expected] of [
    ["2026-10-12", "2026-10-11"],
    ["2026-10-26", "2026-10-25"],
    ["2026-03-30", "2026-03-29"],
    ["2024-03-01", "2024-02-29"],
    ["2026-01-01", "2025-12-31"],
    ["invalid", ""],
  ])
    assert.equal(previousServiceDate(date), expected);
});

test("service date validation uses origin timestamps when connection metadata is missing", () => {
  const data = structuredClone(overnight);
  delete data.stops.stop[0].departureConnection;
  assert.equal(matchesServiceDate(data, "2026-10-11"), true);
  assert.equal(matchesServiceDate(data, "2026-10-12"), false);
  assert.equal(journeyEndDate([], "2026-10-11"), "2026-10-11");
});

test("a service starting after midnight belongs to its actual origin date", () => {
  const data = structuredClone(overnight);
  const first = data.stops.stop[0];
  first.scheduledDepartureTime = 1791756300; // 12 October, 00:05 Brussels
  first.departureConnection =
    "http://irail.be/connections/8821006/20261012/IC723";
  assert.equal(matchesServiceDate(data, "2026-10-12"), true);
  assert.equal(matchesServiceDate(data, "2026-10-11"), false);
  assert.equal(
    matchesBoardStop(data, { time: 1791757440 }, { stationId: dampoort.id }),
    true,
  );
});

const seconds = (iso) => Date.parse(iso) / 1000;
const stop = (iso, extra = {}) => ({
  scheduledDepartureTime: seconds(iso),
  departureDelay: 0,
  ...extra,
});

test("train lookup accepts plain Belgian train numbers without a service prefix", () => {
  for (const [input, expected] of [
    ["510", "510"],
    ["8013", "8013"],
    [" 69 ", "69"],
    ["1000", "1000"],
  ])
    assert.equal(normalizeTrainId(input), expected);
  for (const input of [
    null,
    515,
    "",
    "<img src=x>",
    "IC515&date=101026",
    "../515",
    "123456789",
    "IC515",
    "BE.NMBS.OTC1000",
    "S104522",
    "51 0",
    "５１０",
    "A".repeat(41),
  ])
    assert.equal(normalizeTrainId(input), "");
});

test("service day validation rejects a wrong day and allows a journey crossing midnight", () => {
  const data = {
    stops: {
      stop: [
        {
          departureConnection:
            "http://irail.be/connections/8892007/20261010/IC515",
        },
        {
          departureConnection:
            "http://irail.be/connections/8892008/20261011/IC515",
        },
      ],
    },
  };
  assert.equal(matchesServiceDate(data, "2026-10-10"), true);
  assert.equal(matchesServiceDate(data, "2026-10-11"), false);
  assert.equal(
    matchesServiceDate({ stops: { stop: { station: "Gent" } } }, "2026-10-10"),
    true,
  );
  assert.equal(
    trainStops({ stops: { stop: [null, "bad", { station: "Gent" }] } }).length,
    1,
  );
});

test("live next stops use expected times and skip cancelled events", () => {
  const stops = [
    stop("2026-10-10T10:00:00Z", { departureDelay: 600 }),
    stop("2026-10-10T10:20:00Z", { departureCanceled: "1" }),
    stop("2026-10-10T10:30:00Z"),
  ];
  assert.equal(
    nextStopIndex(stops, { now: seconds("2026-10-10T10:05:00Z") }),
    0,
  );
  assert.equal(
    nextStopIndex(stops, { now: seconds("2026-10-10T10:15:00Z") }),
    2,
  );
  assert.equal(
    nextStopIndex(stops, { now: seconds("2026-10-10T10:31:00Z") }),
    -1,
  );
  const overnight = [stop("2026-10-10T22:10:00Z")];
  assert.equal(
    nextStopIndex(overnight, { now: seconds("2026-10-10T21:55:00Z") }),
    0,
  );
  assert.equal(
    nextStopIndex(overnight, { now: seconds("2026-10-10T22:11:00Z") }),
    -1,
  );
});

test("live next-stop selection respects actual instants and departure flags", () => {
  const stops = [
    stop("2026-10-10T10:05:00Z", { left: "1" }),
    stop("2026-10-10T10:10:00Z"),
  ];
  assert.equal(
    nextStopIndex(stops, {
      now: seconds("2026-10-10T10:00:00Z"),
    }),
    1,
  );
  assert.equal(
    nextStopIndex(stops, {
      now: seconds("2026-10-10T10:11:00Z"),
    }),
    -1,
  );
});

test("lookup headings show the resolved train type without adding a prefix to search input", async () => {
  const { trainLabel } = await import("../src/public/train-lookup.js");
  assert.equal(
    trainLabel({ vehicleinfo: { shortname: "IC 510" } }, "510"),
    "IC 510",
  );
  assert.equal(
    trainLabel({ vehicleinfo: { type: "OTC", number: "1000" } }, "1000"),
    "OTC 1000",
  );
  assert.equal(trainLabel({ vehicle: "BE.NMBS.S104522" }, "4522"), "S104522");
  assert.equal(trainLabel(null, "69"), "69");
  assert.equal(normalizeTrainId("510"), "510");
});
