import test from "node:test";
import assert from "node:assert/strict";
import {
  trainProgress,
  renderProgress,
  activeService,
  currentServiceDay,
} from "../src/public/train-progress.js";
import { renderStopList } from "../src/public/train-details.js";
import { messages } from "../src/public/i18n.js";

const now = Date.parse("2026-10-11T12:00:00Z") / 1000;
const stops = () =>
  [0, 1, 2].map((n) => ({
    station: ["Sint-Niklaas", "Lokeren", "Gent-Dampoort"][n],
    stationinfo: { id: String(n) },
    scheduledArrivalTime: now + n * 600 - 60,
    scheduledDepartureTime: now + n * 600,
    arrivalDelay: 0,
    departureDelay: 0,
    arrived: "0",
    left: "0",
  }));
const live = { live: true, now, timestamp: now };
const t = (key) => messages.en[key];

test("reported progress distinguishes a halting train, departure and confirmed terminus", () => {
  const route = stops();
  route[0].arrived = "1";
  assert.deepEqual(trainProgress(route, live), {
    kind: "at",
    index: 0,
    nextIndex: 1,
  });
  route[0].left = true;
  assert.deepEqual(trainProgress(route, live), {
    kind: "after",
    index: 0,
    nextIndex: 1,
  });
  route[2].arrived = "1";
  assert.deepEqual(trainProgress(route, live), {
    kind: "ended",
    index: 2,
    nextIndex: -1,
  });
});

test("clock-only progress stays an estimate, never a confirmed arrival or completed journey", () => {
  const route = stops();
  assert.deepEqual(trainProgress(route, live), {
    kind: "estimated",
    index: -1,
    nextIndex: 0,
  });
  assert.equal(
    trainProgress(route, { ...live, now: now + 1300, timestamp: now + 1300 })
      .kind,
    "unknown",
  );
  route[0].departureDelay = 600;
  assert.equal(
    trainProgress(route, { ...live, now: now + 300, timestamp: now + 300 })
      .nextIndex,
    0,
  );
});

test("cached, stale, future and undated snapshots cannot claim a live train location", () => {
  const route = stops();
  route[0].arrived = true;
  for (const options of [
    { stale: true },
    { timestamp: now - 181 },
    { timestamp: now + 61 },
    { timestamp: undefined },
  ]) {
    assert.deepEqual(trainProgress(route, { ...live, ...options }), {
      kind: "unknown",
      index: -1,
      nextIndex: -1,
    });
  }
  assert.equal(trainProgress(route, { ...live, live: false }), null);
  assert.equal(trainProgress([], live), null);
});

test("progress skips wholly cancelled stops and preserves separate selected/reported markers", () => {
  const route = stops();
  route[0].left = true;
  route[1].arrivalCanceled = true;
  route[1].departureCanceled = true;
  const progress = trainProgress(route, live);
  assert.equal(progress.nextIndex, 2);
  const html = renderStopList(route, {
    stationId: "1",
    reportedIndex: progress.index,
    nextIndex: progress.nextIndex,
    t,
    language: "en",
    platformHTML: () => "",
  });
  assert.match(html, /reported-stop/);
  assert.match(html, /stop current/);
  assert.match(html, /Your station/);
  assert.match(html, /Last reported here/);
});

test("active previous-day services remain current after midnight and through a delay", () => {
  const midnight = Date.parse("2026-10-11T22:10:00Z") / 1000;
  const route = [
    { scheduledDepartureTime: midnight - 1800, departureDelay: 0 },
    { scheduledArrivalTime: midnight - 60, arrivalDelay: 600 },
  ];
  assert.equal(activeService(route, midnight), true);
  assert.equal(currentServiceDay(route, "2026-10-11", midnight), true);
  assert.equal(currentServiceDay(route, "2026-10-11", midnight + 1000), false);
  assert.equal(activeService([], midnight), false);
  route.at(-1).arrived = true;
  assert.equal(
    activeService(route, midnight),
    false,
    "reported completion beats a predicted end time",
  );
});

test("progress labels distinguish forecasts and escape untrusted station names in every language", () => {
  const route = stops();
  route[0].station = '<img src=x onerror="bad()">';
  for (const lang of ["nl", "en", "fr", "de"]) {
    const local = (key) => messages[lang][key];
    const forecast = renderProgress(route, trainProgress(route, live), {
      t: local,
      language: lang,
      timestamp: now,
    });
    assert.match(forecast, /&lt;img/);
    assert.doesNotMatch(forecast, /<img/);
    assert.ok(forecast.includes(messages[lang].estimatedProgress));
    route[0].arrived = true;
    const reported = renderProgress(route, trainProgress(route, live), {
      t: local,
      language: lang,
      timestamp: now,
    });
    assert.ok(reported.includes(messages[lang].reportedProgress));
    route[0].arrived = false;
  }
});
