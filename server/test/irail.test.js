import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

test("upstream deadline covers a stalled body after headers have arrived", async () => {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.write("{");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  process.env.IRAIL_BASE_URL = `http://127.0.0.1:${server.address().port}`;
  const { fetchIRailJSON } = await import("../src/irail.js");
  try {
    await assert.rejects(
      fetchIRailJSON("/slow", {
        timeoutMs: 80,
        userAgent: "Stationsbord/test",
      }),
      (e) => e.status === 504,
    );
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
