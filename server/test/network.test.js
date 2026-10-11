import test from "node:test";
import assert from "node:assert/strict";
import { renderNetwork } from "../src/public/network.js";
import { messages } from "../src/public/i18n.js";

const t = (key) => messages.en[key];

test("network issues stay visible while scheduled works are grouped in a collapsed section", () => {
  const html = renderNetwork(
    [
      { title: "Track works", type: "planned" },
      {
        title: "Unexpected failure",
        type: "disturbance",
        description: "Works may be affected",
      },
      { title: "Unclassified notice", type: "unknown" },
    ],
    t,
  );
  assert.ok(html.indexOf("Unexpected failure") < html.indexOf("Track works"));
  assert.match(
    html,
    /network-issues[\s\S]*Unexpected failure[\s\S]*Unclassified notice/,
  );
  assert.match(html, /<details class="network-works">/);
  assert.doesNotMatch(html, /<details[^>]* open/);
  assert.match(html, /Current disruptions <span class="network-count">2/);
  assert.match(html, /Engineering works <span class="network-count">1/);
});

test("works-only and stale network results retain distinct status, escaped text and safe links", () => {
  const items = [
    {
      title: '<img src=x onerror="evil">',
      type: "planned",
      link: "javascript:evil()",
      attachment: "https%3A%2F%2Fexample.com%2Fworks.pdf",
    },
  ];
  const fresh = renderNetwork(items, t);
  assert.match(fresh, /No reported disruptions/);
  assert.match(fresh, /&lt;img/);
  assert.doesNotMatch(fresh, /<img|javascript:/);
  assert.match(fresh, /https:\/\/example.com\/works.pdf/);
  const stale = renderNetwork(items, t, true);
  assert.doesNotMatch(stale, /No reported disruptions/);
  assert.match(stale, /Network status unavailable/);
  assert.match(stale, /may be out of date/);
});

test("train detail network context separates general incidents from train-specific notices and works", async () => {
  const { renderRouteNetwork } = await import("../src/public/network.js");
  const items = [
    { title: "Gent-Dampoort: people on tracks", type: "disturbance" },
    { title: "Planned works", type: "planned" },
  ];
  const html = renderRouteNetwork(
    items,
    (key) => messages.en[key],
    false,
    "trainNetworkTitle",
  );
  assert.match(html, /These notices are not always linked to this train/);
  assert.match(html, /people on tracks/);
  assert.match(html, /network-works/);
  assert.match(html, /id="trainNetworkTitle"/);
  assert.doesNotMatch(html, /id="networkIssuesTitle"/);
  assert.match(
    renderRouteNetwork(null, (key) => messages.en[key]),
    /notice/,
  );
});
