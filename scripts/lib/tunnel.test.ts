import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import {
  connectorBaseUrl,
  createConnectorProxy,
  isConnectorPath,
  parseTunnelUrl,
} from "./tunnel";

test("only /api/connectors/* is forwarded", () => {
  assert.equal(isConnectorPath("/api/connectors/lookup"), true);
  assert.equal(isConnectorPath("/api/connectors/lookup?x=1"), true);
  for (const blocked of [
    undefined,
    "/",
    "/api/whoami",
    "/api/connectors",
    "/api/connectorsX/lookup",
    "/api/demo/reset",
    "/api/connectors/../whoami",
    "/api/connectors/%2e%2e/whoami",
    "/api/connectors/%2E%2E/demo/reset",
    "/api/connectors/./lookup",
    "/api/connectors/..%2fwhoami",
    "/api/connectors/%5c..%5cwhoami",
    "/api/connectors/%zz",
    "http://evil.example/api/connectors/lookup",
  ])
    assert.equal(isConnectorPath(blocked), false, String(blocked));
});

test("finds the quick-tunnel URL in cloudflared output", () => {
  const line =
    "2026-09-30T12:00:00Z INF |  https://mathematical-min-opponent-dana.trycloudflare.com  |";
  assert.equal(
    parseTunnelUrl(line),
    "https://mathematical-min-opponent-dana.trycloudflare.com",
  );
  assert.equal(parseTunnelUrl("INF Starting tunnel"), undefined);
  assert.equal(
    connectorBaseUrl("https://a-b.trycloudflare.com/"),
    "https://a-b.trycloudflare.com/api/connectors",
  );
});

test("the proxy forwards connector calls and nothing else", async () => {
  const seen: string[] = [];
  const api = createServer((req, res) => {
    seen.push(`${req.method} ${req.url} ${req.headers["x-connector-secret"]}`);
    res.writeHead(200, { "content-type": "application/json" });
    req.pipe(res);
  });
  await new Promise<void>((r) => api.listen(0, "127.0.0.1", r));
  const proxy = createConnectorProxy((api.address() as AddressInfo).port);
  await new Promise<void>((r) => proxy.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${(proxy.address() as AddressInfo).port}`;
  try {
    const ok = await fetch(`${base}/api/connectors/lookup`, {
      method: "POST",
      headers: {
        "x-connector-secret": "s",
        "content-type": "application/json",
      },
      body: JSON.stringify({ email: "ada@example.com" }),
    });
    assert.equal(ok.status, 200);
    assert.deepEqual(await ok.json(), { email: "ada@example.com" });
    for (const path of [
      "/api/whoami",
      "/api/demo/reset",
      "/api/connectors/../whoami",
    ])
      assert.equal(
        (await fetch(`${base}${path}`, { method: "POST" })).status,
        404,
        path,
      );
    assert.deepEqual(seen, ["POST /api/connectors/lookup s"]);
  } finally {
    proxy.close();
    api.close();
  }
});
