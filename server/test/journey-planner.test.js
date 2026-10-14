import test from "node:test";
import assert from "node:assert/strict";
import {
  journeys,
  journeyCursor,
  renderJourneys,
  journeyDuration,
} from "../src/public/journey-planner.js";
import { messages, languages } from "../src/public/i18n.js";
import { matchesBoardStop } from "../src/public/train-lookup.js";

const t = (key) => messages.nl[key] || key;
const stamp = (iso) => Date.parse(iso) / 1000;
const stations = {
  a: { id: "BE.NMBS.008892007", name: "Gent-Sint-Pieters" },
  b: { id: "BE.NMBS.008821006", name: "Antwerpen-Centraal" },
  c: { id: "BE.NMBS.008812005", name: "Brussel-Centraal" },
  d: { id: "BE.NMBS.008811007", name: "Brussel-Zuid" },
};
const event = (station, time, train = "IC 510", extra = {}) => ({
  station: stations[station].name,
  stationinfo: stations[station],
  time: stamp(time),
  delay: "0",
  platform: "4",
  platforminfo: { name: "4", normal: "1" },
  vehicle: `BE.NMBS.${train.replace(" ", "")}`,
  vehicleinfo: { name: `BE.NMBS.${train.replace(" ", "")}`, shortname: train },
  ...extra,
});
const direct = () => ({
  departure: event("a", "2026-10-14T08:00:00Z"),
  arrival: event("b", "2026-10-14T09:00:00Z"),
  duration: "3600",
});
const transfer = () => ({
  departure: event("a", "2026-10-14T08:00:00Z"),
  arrival: event("c", "2026-10-14T10:00:00Z", "IC 69"),
  vias: {
    via: {
      station: stations.b.name,
      stationinfo: stations.b,
      arrival: event("b", "2026-10-14T09:00:00Z"),
      departure: event("b", "2026-10-14T09:10:00Z", "IC 69"),
    },
  },
});

test("planner normalizes direct routes, singleton vias and stationless transfer endpoints", () => {
  const connection = transfer();
  delete connection.vias.via.arrival.station;
  delete connection.vias.via.arrival.stationinfo;
  delete connection.vias.via.departure.stationinfo;
  const [journey] = journeys({ connection });
  assert.equal(journey.changes, 1);
  assert.equal(journey.legs.length, 2);
  assert.deepEqual(journey.legs[0].to.station, stations.b);
  assert.deepEqual(journey.legs[1].from.station, stations.b);
  assert.equal(journey.transfers[0].wait, 600);
  assert.equal(journey.missed, false);
  assert.equal(journeys({ connection: direct() })[0].changes, 0);
});

test("planner also accepts the current converter's object station/vehicle/platform fields", () => {
  const connection = transfer();
  connection.via = [connection.vias.via];
  delete connection.vias;
  for (const item of [
    connection.departure,
    connection.arrival,
    connection.via[0].arrival,
    connection.via[0].departure,
  ]) {
    item.station = item.stationinfo;
    delete item.stationinfo;
    item.vehicle = item.vehicleinfo;
    delete item.vehicleinfo;
    item.platform = { name: "8", normal: "0" };
    delete item.platforminfo;
  }
  const [journey] = journeys({ connection });
  assert.equal(journey.from.station.id, stations.a.id);
  assert.equal(journey.legs[0].vehicle, "BE.NMBS.IC510");
  assert.equal(journey.legs[0].label, "IC 510");
  assert.equal(journey.from.platform, "8");
  assert.equal(journey.from.platformChanged, true);
});

test("planner deduplicates identical routes and orders departure and arrival searches", () => {
  const first = direct(),
    second = direct();
  second.departure.time += 3600;
  second.arrival.time += 3600;
  const data = { connection: [second, first, structuredClone(first)] };
  assert.equal(journeys(data).length, 2);
  assert.equal(journeys(data)[0].from.planned, first.departure.time);
  assert.equal(journeys(data, "arrival")[0].to.planned, second.arrival.time);
});

test("expected transfer times detect missed and short connections without hiding journeys", () => {
  const connection = transfer();
  connection.vias.via.arrival.delay = 900;
  const [missed] = journeys({ connection });
  assert.equal(missed.transfers[0].wait, -300);
  assert.equal(missed.missed, true);
  connection.vias.via.departure.delay = 420;
  const [tight] = journeys({ connection });
  assert.equal(tight.missed, false);
  assert.equal(tight.tight, true);
  assert.equal(tight.transfers[0].wait, 120);
});

test("a delayed inbound train still needs the walking time between different stations", () => {
  const connection = {
    departure: event("a", "2026-10-14T08:00:00Z"),
    arrival: event("d", "2026-10-14T10:00:00Z", "S 8013"),
    vias: {
      via: [
        {
          stationinfo: stations.b,
          arrival: event("b", "2026-10-14T09:00:00Z", "IC 510", { delay: 600 }),
          departure: event("b", "2026-10-14T09:01:00Z", "WALK", {
            walking: "1",
          }),
        },
        {
          stationinfo: stations.c,
          arrival: event("c", "2026-10-14T09:06:00Z", "WALK", {
            walking: true,
          }),
          departure: event("c", "2026-10-14T09:12:00Z", "S 8013"),
        },
      ],
    },
  };
  const [journey] = journeys({ connection });
  assert.equal(journey.legs.length, 3);
  assert.equal(journey.changes, 1);
  assert.equal(journey.legs[1].walking, true);
  assert.equal(journey.transfers[1].wait, -180);
  assert.equal(journey.missed, true);
  const html = renderJourneys([journey], t);
  assert.equal((html.match(/data-planner-leg=/g) || []).length, 2);
  assert.ok(html.includes("Te voet"));
  assert.ok(
    !html.includes(">BE.NMBS.WALK<"),
    "Walking IDs are never shown as train labels",
  );
});

test("arrival and departure cancellations remain distinct and cancelled routes remain visible", () => {
  const connection = direct();
  connection.arrival.canceled = "1";
  connection.arrival.delay = "600";
  const [journey] = journeys({ connection });
  assert.equal(journey.from.cancelled, false);
  assert.equal(journey.to.cancelled, true);
  assert.equal(journey.cancelled, true);
  const html = renderJourneys([journey], t, { date: "2026-10-14" });
  assert.ok(html.includes("Afgeschafte trein in deze reis"));
  assert.ok(html.includes("11:00"));
  assert.ok(
    !html.includes("11:10"),
    "Cancelled arrival never receives an expected arrival time",
  );
  assert.equal(
    (html.match(/class="journey-cancelled"/g) || []).length,
    2,
    "Cancellation appears on summary arrival and leg arrival only",
  );
});

test("overnight trips show the next calendar day and keep the exact train-detail departure instant", () => {
  const connection = {
    departure: event("b", "2026-10-14T21:36:00Z", "IC 723"),
    arrival: event("a", "2026-10-14T22:24:00Z", "IC 723", { delay: 300 }),
  };
  const [journey] = journeys({ connection });
  const html = renderJourneys([journey], t, { date: "2026-10-14" });
  assert.ok(html.includes("23:36"));
  assert.ok(html.includes("00:24"));
  assert.ok(html.includes("00:29"));
  assert.ok(html.includes("+5 min"));
  assert.ok(html.includes("15 oktober"));
  assert.ok(html.includes("<del>"));
  assert.equal(
    matchesBoardStop(
      {
        stops: {
          stop: [
            {
              ...connection.departure,
              scheduledDepartureTime: connection.departure.time,
            },
          ],
        },
      },
      journey.legs[0].row,
      { stationId: stations.b.id },
    ),
    true,
  );
});

test("earlier/later cursors cross midnight using scheduled moments, unaffected by delays", () => {
  const connection = {
    departure: event("a", "2026-10-14T21:59:00Z", "IC 69", { delay: 3600 }),
    arrival: event("b", "2026-10-14T22:00:00Z", "IC 69"),
  };
  const list = journeys({ connection });
  assert.deepEqual(journeyCursor(list, "later"), {
    date: "2026-10-15",
    time: "00:00",
    timesel: "departure",
    live: false,
  });
  assert.deepEqual(journeyCursor(list, "earlier"), {
    date: "2026-10-14",
    time: "23:59",
    timesel: "arrival",
    live: false,
  });
  assert.equal(journeyCursor([], "later"), null);
});

test("planner ignores malformed routes and out-of-range timestamps safely", () => {
  const bad = direct();
  bad.arrival.time = 1e100;
  const backwards = direct();
  backwards.arrival.time = backwards.departure.time - 60;
  const missingVia = transfer();
  delete missingVia.vias.via.arrival;
  assert.deepEqual(
    journeys({ connection: [null, {}, bad, backwards, missingVia] }),
    [],
  );
  assert.deepEqual(journeys(null), []);
});

test("route notices are deduplicated, decoded as display text and escaped with all other API text", () => {
  const connection = direct();
  const alert = {
    header: "&lt;img src=x onerror=alert(1)&gt;",
    lead: "<p>Test &amp; more</p>",
    link: "javascript:alert(1)",
  };
  connection.alerts = { alert: [alert, alert] };
  connection.departure.alert = [alert];
  connection.departure.station = '<img src=x onerror="alert(1)">';
  connection.departure.platform = '5" onmouseover="evil';
  delete connection.departure.platforminfo;
  const [journey] = journeys({ connection });
  const html = renderJourneys([journey], t);
  assert.ok(!html.includes("<img"));
  assert.ok(!html.includes('href="javascript:'));
  assert.ok(html.includes("&lt;img"));
  assert.equal((html.match(/Test &amp; more/g) || []).length, 1);
});

test("all planner labels exist in all four languages and durations remain readable", () => {
  const plannerKeys = Object.keys(messages.nl).slice(
    0,
    Object.keys(messages.nl).indexOf("trainProgress"),
  );
  for (const lang of languages)
    for (const key of plannerKeys)
      assert.ok(messages[lang][key], `${lang}: ${key}`);
  assert.equal(journeyDuration(65 * 60, t), "1 u 5 min");
  assert.equal(journeyDuration(3600, t), "1 u");
  assert.equal(journeyDuration(600, t), "10 min");
});
