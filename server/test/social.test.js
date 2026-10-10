import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  publicOrigin,
  pageMetadata,
  metadataMarkup,
  renderPage,
} from "../src/social.js";

const origin = "https://stationsbord.example";

test("social metadata covers all languages with absolute image and canonical URLs", () => {
  for (const [lang, locale] of [
    ["nl", "nl_BE"],
    ["fr", "fr_BE"],
    ["de", "de_BE"],
    ["en", "en_GB"],
  ]) {
    const meta = pageMetadata(`lang=${lang}`, origin);
    assert.equal(meta.lang, lang);
    assert.equal(meta.locale, locale);
    assert.equal(meta.title, "Stationsbord · It’s on the board");
    assert.ok(meta.description.length > 40);
    assert.equal(new URL(meta.image).origin, origin);
    assert.equal(new URL(meta.url).origin, origin);
    const markup = metadataMarkup(meta);
    assert.match(markup, /name="twitter:card" content="summary_large_image"/);
    assert.match(markup, /property="og:image:type" content="image\/png"/);
    assert.match(markup, /property="og:image:width" content="1200"/);
    assert.match(markup, /property="og:image:height" content="630"/);
    assert.equal((markup.match(/og:locale:alternate/g) || []).length, 3);
  }
});

test("station previews preserve direction, language and planned Belgian date/time without tracking parameters", () => {
  const meta = pageMetadata(
    "station=BE.NMBS.008892007&name=Gent-Sint-Pieters&mode=arrival&lang=en&date=2026-10-08&time=14%3A30&utm_source=chat",
    origin,
  );
  assert.equal(meta.title, "Gent-Sint-Pieters · Arrivals | Stationsbord");
  assert.match(meta.description, /2026/);
  assert.match(meta.description, /14:30/);
  assert.doesNotMatch(meta.description, /current train/);
  const url = new URL(meta.url);
  assert.equal(url.searchParams.get("station"), "BE.NMBS.008892007");
  assert.equal(url.searchParams.get("name"), "Gent-Sint-Pieters");
  assert.equal(url.searchParams.get("mode"), "arrival");
  assert.equal(url.searchParams.get("lang"), "en");
  assert.equal(url.searchParams.get("date"), "2026-10-08");
  assert.equal(url.searchParams.get("time"), "14:30");
  assert.equal(url.searchParams.has("utm_source"), false);
});

test("invalid, repeated and oversized parameters produce safe fallback previews", () => {
  assert.equal(pageMetadata("lang=__proto__&name=Ignored", origin).lang, "nl");
  assert.equal(pageMetadata("station=A&station=B", origin).url, `${origin}/`);
  assert.equal(
    pageMetadata(`station=${"x".repeat(151)}`, origin).url,
    `${origin}/`,
  );
  const badDate = pageMetadata(
    "station=Gent&date=2026-02-30&time=25:00",
    origin,
  );
  assert.equal(new URL(badDate.url).searchParams.has("date"), false);
  assert.match(badDate.description, /actuele treinen/);
  assert.equal(
    pageMetadata("station=BE.NMBS.008892007&lang=en", origin).title,
    "Departures | Stationsbord",
  );
});

test("query text is escaped in HTML and cannot break out of metadata or replacement markers", () => {
  const value = '"><script>alert(1)</script>&$&';
  const search = new URLSearchParams({
    station: "Gent",
    name: value,
    lang: "en",
  }).toString();
  const html = renderPage(
    '<html lang="nl"><head><!-- page-meta:start -->old<!-- page-meta:end --></head><body>Board</body></html>',
    search,
    origin,
  );
  assert.doesNotMatch(html, /<script\b/i);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /&quot;/);
  assert.match(html, /<html lang="en">/);
  assert.equal((html.match(/page-meta:start/g) || []).length, 1);
  assert.match(html, /<body>Board<\/body>/);
});

test("public origin is configured explicitly and rejects unsafe or ambiguous URL values", () => {
  assert.equal(publicOrigin(), "https://stationsbord.fly.dev");
  assert.equal(publicOrigin(`${origin}/`), origin);
  for (const value of [
    "javascript:alert(1)",
    "//evil.example",
    "https://user:secret@example.com",
    `${origin}/path`,
    `${origin}/?x=1`,
    `${origin}/#hash`,
  ]) {
    assert.throws(() => publicOrigin(value), /PUBLIC_BASE_URL/);
  }
});

test("HTTP pages expose station previews to crawlers without iRail, and serve the PNG", async () => {
  const reservation = http.createServer();
  await new Promise((resolve) => reservation.listen(0, "127.0.0.1", resolve));
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  const child = spawn(process.execPath, ["src/index.js"], {
    cwd: fileURLToPath(new URL("../", import.meta.url)),
    env: {
      ...process.env,
      PORT: String(port),
      PUBLIC_BASE_URL: origin,
      IRAIL_BASE_URL: "http://127.0.0.1:1",
    },
    stdio: "ignore",
  });
  const base = `http://127.0.0.1:${port}`;
  try {
    let ready = false;
    for (let i = 0; i < 80; i++) {
      try {
        await fetch(`${base}/health`);
        ready = true;
        break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
    }
    assert.ok(ready, "server started");
    for (const path of ["/", "/index.html"]) {
      const response = await fetch(
        `${base}${path}?station=Gent-Sint-Pieters&lang=en&mode=arrival`,
        {
          headers: {
            "User-Agent": "Twitterbot/1.0",
            Host: "untrusted.example",
            "X-Forwarded-Host": "untrusted.example",
          },
        },
      );
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("cache-control"), "no-cache");
      const html = await response.text();
      assert.match(
        html,
        /<title>Gent-Sint-Pieters · Arrivals \| Stationsbord<\/title>/,
      );
      assert.match(
        html,
        /property="og:image" content="https:\/\/stationsbord.example\/social-card.png/,
      );
      assert.doesNotMatch(html, /untrusted.example/);
      assert.equal((html.match(/<title>/g) || []).length, 1);
      assert.equal((html.match(/name="description"/g) || []).length, 1);
      assert.match(html, /id="boardContent"/);
    }
    const image = await fetch(`${base}/social-card.png?v=0.9.2`);
    assert.equal(image.status, 200);
    assert.equal(image.headers.get("content-type"), "image/png");
    const bytes = Buffer.from(await image.arrayBuffer());
    assert.equal(bytes.subarray(1, 4).toString(), "PNG");
    assert.equal(bytes.readUInt32BE(16), 1200);
    assert.equal(bytes.readUInt32BE(20), 630);
  } finally {
    child.kill();
    await new Promise((resolve) => child.once("exit", resolve));
  }
});
