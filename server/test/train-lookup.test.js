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

test("train lookup accepts plain numbers and supplied service prefixes without guessing", () => {
  for (const [input, expected] of [
    ["515", "515"],
    [" ic 515 ", "IC515"],
    ["BE.NMBS.OTC1000", "OTC1000"],
    ["S10 4522", "S104522"],
    ["s41 5369", "S415369"],
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

test("chosen time marks the next stop using expected times, dates and cancellations", () => {
  const stops = [
    stop("2026-10-10T10:00:00Z", { departureDelay: 600 }),
    stop("2026-10-10T10:20:00Z", { departureCanceled: "1" }),
    stop("2026-10-10T10:30:00Z"),
  ];
  assert.equal(nextStopIndex(stops, { date: "2026-10-10", time: "12:05" }), 0);
  assert.equal(nextStopIndex(stops, { date: "2026-10-10", time: "12:15" }), 2);
  assert.equal(nextStopIndex(stops, { date: "2026-10-10", time: "12:31" }), -1);
  assert.equal(nextStopIndex(stops, { date: "2026-10-09", time: "12:31" }), 0);
  assert.equal(nextStopIndex(stops, { date: "invalid", time: "12:31" }), -1);
  const overnight = [stop("2026-10-10T22:10:00Z")];
  assert.equal(
    nextStopIndex(overnight, { date: "2026-10-10", time: "23:55" }),
    0,
  );
  assert.equal(
    nextStopIndex(overnight, { date: "2026-10-11", time: "00:11" }),
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
      date: "2026-10-10",
      time: "12:00",
      live: true,
      now: seconds("2026-10-10T10:00:00Z"),
    }),
    1,
  );
  assert.equal(
    nextStopIndex(stops, {
      date: "2026-10-10",
      time: "12:11",
      live: true,
      now: seconds("2026-10-10T10:11:00Z"),
    }),
    -1,
  );
});
