import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test("proxy coalesces requests, revalidates ETags, labels stale data and validates input", async () => {
  let calls = 0,
    upstreamMode = "fresh",
    conditionalHeader;
  const payload = {
    station: "Gent-Sint-Pieters",
    timestamp: 123,
    departures: { departure: [] },
  };
  const upstream = http.createServer(async (req, res) => {
    calls++;
    conditionalHeader = req.headers["if-none-match"];
    await wait(40);
    if (upstreamMode === "failure") {
      res.writeHead(503, { "content-type": "text/plain" });
      return res.end("Unavailable");
    }
    if (upstreamMode === "unchanged") {
      res.writeHead(304, { etag: '"fixture"', "cache-control": "max-age=0" });
      return res.end();
    }
    res.writeHead(200, {
      "content-type": "application/json",
      "cache-control": "max-age=0",
      etag: '"fixture"',
    });
    res.end(JSON.stringify(payload));
  });
  await new Promise((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  const reservation = http.createServer();
  await new Promise((resolve) => reservation.listen(0, "127.0.0.1", resolve));
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  const child = spawn(process.execPath, ["src/index.js"], {
    cwd: fileURLToPath(new URL("../", import.meta.url)),
    env: {
      ...process.env,
      PORT: String(port),
      APP_NAME: "Stationsbord-test",
      IRAIL_BASE_URL: `http://127.0.0.1:${upstream.address().port}`,
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
        await wait(25);
      }
    }
    assert.ok(ready, "Server started");
    const url = `${base}/api/liveboard?id=BE.NMBS.008892007&lang=nl`;
    const responses = await Promise.all(
      Array.from({ length: 6 }, () => fetch(url)),
    );
    for (const response of responses) {
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), payload);
    }
    assert.equal(
      calls,
      1,
      "Concurrent identical queries produce one upstream request",
    );
    await wait(10);
    upstreamMode = "unchanged";
    const revalidated = await fetch(url);
    assert.equal(revalidated.headers.get("x-cache"), "REVALIDATED(304)");
    assert.equal(conditionalHeader, '"fixture"');
    assert.deepEqual(await revalidated.json(), payload);
    await wait(10);
    upstreamMode = "failure";
    const stale = await fetch(url);
    assert.equal(stale.status, 200);
    assert.match(stale.headers.get("x-cache"), /^STALE/);
    assert.deepEqual(await stale.json(), payload);
    assert.equal(stale.headers.get("cache-control"), "no-store");
    const before = calls;
    for (const query of [
      "id=a&id=b",
      "id=a&date=310426",
      "id=a&time=2460",
      "id=a&station=b",
      "id=a&lang[x]=nl",
    ]) {
      assert.equal(
        (await fetch(`${base}/api/liveboard?${query}`)).status,
        400,
        query,
      );
    }
    assert.equal(
      (await fetch(`${base}/api/stations/search?q[x]=test`)).status,
      400,
    );
    assert.equal(calls, before, "Invalid queries never reach upstream");
    const page = await fetch(base);
    assert.equal(page.status, 200);
    assert.match(
      page.headers.get("content-security-policy"),
      /script-src 'self'/,
    );
    assert.equal(page.headers.get("x-powered-by"), null);
    const script = await fetch(`${base}/app.js?v=0.6.0`);
    assert.ok(!script.headers.get("cache-control").includes("immutable"));
  } finally {
    child.kill();
    upstream.closeAllConnections();
    await new Promise((resolve) => upstream.close(resolve));
  }
});

test("composition dates reach upstream, isolate cache entries and reject invalid dates before fetching", async () => {
  const queries = [];
  const upstream = http.createServer((req, res) => {
    const query = new URL(req.url, "http://fixture").searchParams;
    queries.push(query.get("date"));
    res.writeHead(200, {
      "content-type": "application/json",
      "cache-control": "max-age=600",
    });
    res.end(JSON.stringify({ date: query.get("date"), composition: {} }));
  });
  await new Promise((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  const reservation = http.createServer();
  await new Promise((resolve) => reservation.listen(0, "127.0.0.1", resolve));
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  const child = spawn(process.execPath, ["src/index.js"], {
    cwd: fileURLToPath(new URL("../", import.meta.url)),
    env: {
      ...process.env,
      PORT: String(port),
      APP_NAME: "Stationsbord-test",
      IRAIL_BASE_URL: `http://127.0.0.1:${upstream.address().port}`,
    },
    stdio: "ignore",
  });
  const base = `http://127.0.0.1:${port}`;
  try {
    for (let i = 0; i < 80; i++) {
      try {
        await fetch(`${base}/health`);
        break;
      } catch {
        await wait(25);
      }
    }
    const defaultDate = (
      await (await fetch(`${base}/api/composition?id=IC1830`)).json()
    ).date;
    assert.match(defaultDate, /^\d{6}$/);
    const explicit = await fetch(
      `${base}/api/composition?id=IC1830&date=${defaultDate}`,
    );
    assert.equal(explicit.headers.get("x-cache"), "HIT");
    for (const date of ["111126", "121126"]) {
      const result = await fetch(
        `${base}/api/composition?id=IC1830&date=${date}`,
      );
      assert.equal(result.status, 200);
      assert.equal((await result.json()).date, date);
    }
    assert.deepEqual(queries, [defaultDate, "111126", "121126"]);
    for (const date of ["310426", "", "tomorrow", "111126&date=121126"]) {
      assert.equal(
        (await fetch(`${base}/api/composition?id=IC1830&date=${date}`)).status,
        400,
      );
    }
    assert.equal(queries.length, 3);
  } finally {
    child.kill();
    upstream.closeAllConnections();
    await new Promise((resolve) => upstream.close(resolve));
  }
});
