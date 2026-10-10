import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeTrainId,
  trainStops,
  matchesServiceDate,
  nextStopIndex,
} from "../src/public/train-lookup.js";

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
