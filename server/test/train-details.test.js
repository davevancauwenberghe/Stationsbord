import test from "node:test";
import assert from "node:assert/strict";
import {
  renderCrowding,
  trainNotices,
  renderTrainNotices,
  stopEvents,
  renderStopList,
} from "../src/public/train-details.js";
import { messages } from "../src/public/i18n.js";

const t = (key) => messages.en[key];
const base = Date.parse("2026-10-09T20:00:00Z") / 1000;
const render = (stops, extra = {}) =>
  renderStopList(stops, {
    stationId: "gent",
    mode: "departure",
    serviceDay: "2026-10-09",
    language: "en",
    t,
    platformHTML: () => '<span class="platform">7</span>',
    ...extra,
  });

test("notices accept singleton/array wrappers, deduplicate across train and stops, and ignore empty data", () => {
  const alert = {
    header: "Works",
    lead: "Use another platform",
    link: "https%3A%2F%2Fwww.belgiantrain.be%2Fen",
  };
  const data = {
    alerts: { alert },
    stops: {
      stop: [
        { alerts: { alert: [alert, { header: "Replacement bus" }] } },
        null,
      ],
    },
  };
  const notices = trainNotices(data, {
    alerts: { alert: { ...alert, id: 100 } },
  });
  assert.equal(notices.length, 2);
  assert.equal(notices[0].link, "https://www.belgiantrain.be/en");
  for (const input of [
    null,
    {},
    { alerts: { number: "0" } },
    { alerts: { alert: [null, "text", {}] } },
  ])
    assert.equal(renderTrainNotices(input, {}, t), "");
});

test("notices preserve readable line breaks and entities, escape HTML and reject unsafe links", () => {
  const html = renderTrainNotices(
    {
      alerts: {
        alert: [
          {
            header: "Work &amp; trains &#39;A&#39;",
            lead: "<p>First<br>Second &lt;script&gt;</p><img src=x onerror=evil>",
            link: "javascript:evil()",
          },
        ],
      },
    },
    {},
    t,
  );
  assert.match(html, /Work &amp; trains &#39;A&#39;/);
  assert.match(html, /First\nSecond &lt;script&gt;/);
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes("onerror"));
  assert.ok(!html.includes("javascript:"));
  assert.ok(!html.includes("<a "));
});

test("malformed, nested and encoded notice markup remains escaped at the final rendering boundary", () => {
  for (const payload of [
    "<script",
    '<iframe src="https://example.invalid"',
    "&lt;script&gt;alert(1)&lt;/script&gt;",
    "&#x3c;img src=x onerror=alert(1)&#x3e;",
    "<scrip<script>t>alert(1)</script>",
    "<<img src=x onerror=alert(1)>script>alert(1)</script>",
  ]) {
    const html = renderTrainNotices(
      { alerts: { alert: { header: payload, lead: payload } } },
      {},
      t,
    );
    assert.ok(!/<(?:script|iframe|img)\b/i.test(html), payload);
    assert.ok(!html.includes('<iframe src="'), payload);
    assert.ok(!html.includes("<img src="), payload);
  }
  const html = renderTrainNotices(
    { alerts: { alert: { header: "&lt;script&gt;", lead: "<script" } } },
    {},
    t,
  );
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /<p>&lt;script<\/p>/);
});

test("notice cleanup preserves readable text across adjacent tags and invalid entities", () => {
  const notices = trainNotices({
    alerts: {
      alert: {
        header: "<b>Works</b>",
        lead: "<p>First</p><p>Second<br />Third &amp; final &#x110000;</p>",
      },
    },
  });
  assert.deepEqual(
    notices.map(({ header, body }) => ({ header, body })),
    [{ header: "Works", body: "First\nSecond\nThird & final &#x110000;" }],
  );
});

test("crowding uses the three API levels, excludes unknown and cancelled trains, and has a text label", () => {
  for (const [level, bars] of [
    ["low", 1],
    ["medium", 2],
    ["high", 3],
  ]) {
    const html = renderCrowding(
      { occupancy: { "@id": `http://api.irail.be/terms/${level}` } },
      t,
    );
    assert.equal((html.match(/class="filled"/g) || []).length, bars);
    assert.match(
      html,
      new RegExp(`aria-label="Occupancy: ${messages.en[level]}"`),
    );
  }
  for (const row of [
    {},
    { occupancy: { name: "unknown" } },
    { canceled: "1", occupancy: { name: "high" } },
  ])
    assert.equal(renderCrowding(row, t), "");
});

test("arrival and departure retain their own delays and cancellations, even at equal scheduled times", () => {
  const stop = {
    scheduledArrivalTime: base,
    scheduledDepartureTime: base + 60,
    arrivalDelay: 120,
    departureDelay: 240,
    arrivalCanceled: "1",
    departureCanceled: "0",
  };
  let events = stopEvents(stop, 1, 3);
  assert.equal(events[0].expected, null);
  assert.equal(events[1].expected, base + 300);
  assert.equal(events[1].canceled, false);
  events = stopEvents(
    {
      ...stop,
      scheduledDepartureTime: base,
      arrivalCanceled: "0",
      departureCanceled: "1",
    },
    0,
    3,
  );
  assert.equal(
    events.length,
    2,
    "Partial cancellations must never be collapsed",
  );
  assert.equal(events[0].expected, base + 120);
  assert.equal(events[1].expected, null);
  const html = render([stop]);
  assert.match(html, /data-event="arrival"/);
  assert.match(html, /data-event="departure"/);
  assert.equal((html.match(/cancelled-event/g) || []).length, 1);
  assert.equal((html.match(/<small>Expected<\/small>/g) || []).length, 1);
});

test("endpoint duplicates, arrival-only stops and legacy fields do not invent missing events", () => {
  const duplicate = {
    scheduledArrivalTime: base,
    scheduledDepartureTime: base,
    arrivalDelay: 0,
    departureDelay: 0,
  };
  assert.deepEqual(
    stopEvents(duplicate, 0, 3).map((e) => e.kind),
    ["departure"],
  );
  assert.deepEqual(
    stopEvents(duplicate, 2, 3).map((e) => e.kind),
    ["arrival"],
  );
  assert.deepEqual(
    stopEvents(duplicate, 0, 1, "arrival").map((e) => e.kind),
    ["arrival"],
  );
  assert.equal(
    stopEvents({ scheduledArrivalTime: base, arrivalDelay: 60 }, 0, 1)[0]
      .expected,
    base + 60,
  );
  assert.equal(
    stopEvents({ time: base, delay: 90, canceled: "1" }, 0, 1)[0].canceled,
    true,
  );
  assert.equal(
    stopEvents({ ...duplicate, canceled: "1", departureCanceled: "0" }, 1, 3)[0]
      .canceled,
    false,
    "Generic cancellation must not overwrite a side-specific flag",
  );
});

test("unknown times and delays stay unknown; negative delays and midnight crossings remain clear", () => {
  for (const delay of [undefined, null, "", " ", "invalid", true]) {
    const events = stopEvents(
      { scheduledDepartureTime: base, departureDelay: delay },
      0,
      1,
    );
    assert.equal(events[0].expected, null);
    assert.match(
      render([{ scheduledDepartureTime: base, departureDelay: delay }]),
      /Expected time unknown/,
    );
  }
  assert.equal(
    stopEvents({ time: base, delay: -60 }, 0, 1)[0].expected,
    base - 60,
  );
  const midnight = Date.parse("2026-10-09T21:58:00Z") / 1000;
  const html = render([
    {
      scheduledDepartureTime: midnight,
      departureDelay: 300,
      station: '<img onerror="evil">',
    },
  ]);
  assert.match(html, /00:03/);
  assert.match(html, /stop-day/);
  assert.match(html, /October 10/);
  assert.ok(!html.includes('<img onerror="evil">'));
  const unknown = render([{}]);
  assert.ok(!unknown.includes("NaN"));
  assert.ok(!unknown.includes("On time"));
});

test("passed events, extra stops and selected station labels are preserved in every language", () => {
  const stop = {
    station: "Gent",
    stationinfo: { id: "gent" },
    scheduledArrivalTime: base,
    scheduledDepartureTime: base + 60,
    arrivalDelay: 0,
    departureDelay: 0,
    left: "1",
    arrived: "1",
    isExtraStop: "1",
  };
  for (const language of ["en", "nl", "fr", "de"]) {
    const html = render([stop], { language, t: (k) => messages[language][k] });
    assert.ok(html.includes(messages[language].arrived));
    assert.ok(html.includes(messages[language].departed));
    assert.ok(html.includes(messages[language].selectedStop));
    assert.ok(html.includes(messages[language].extraStop));
    assert.ok(!html.includes("undefined"));
  }
});
