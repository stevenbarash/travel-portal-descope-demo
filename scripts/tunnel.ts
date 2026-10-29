import { spawn } from "node:child_process";
import type { AddressInfo } from "node:net";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";
import {
  CONNECTOR_PREFIX,
  connectorBaseUrl,
  createConnectorProxy,
  parseTunnelUrl,
} from "./lib/tunnel";

/**
 * `npm run tunnel`: give a Descope HTTP connector a public URL for the local API without exposing
 * the rest of it. A local proxy forwards only /api/connectors/* to the API; a Cloudflare quick
 * tunnel points at that proxy. Ctrl-C stops both. The URL changes on every run.
 */
const repoRoot = resolve(fileURLToPath(import.meta.url), "../..");
loadDotenv({ path: resolve(repoRoot, ".env"), quiet: true });
const apiPort = Number(process.env.PORT || 3001);
if (!process.env.CONNECTOR_SECRET)
  console.warn(
    "warning: CONNECTOR_SECRET is empty in .env; connector routes answer 503 until you set it and restart npm run dev",
  );
// Warn but keep going: the tunnel can start before the API and works as soon as it is up.
const apiUp = await fetch(`http://localhost:${apiPort}/api/health`)
  .then((r) => r.ok)
  .catch(() => false);
if (!apiUp)
  console.warn(
    `warning: no API on :${apiPort} yet; start it with npm run dev (the tunnel works once it's up)`,
  );

const proxy = createConnectorProxy(apiPort);
// Port 0 picks a free ephemeral port; bound to loopback so only cloudflared can reach it.
await new Promise<void>((r) => proxy.listen(0, "127.0.0.1", r));
const proxyPort = (proxy.address() as AddressInfo).port;

const cloudflared = spawn(
  "cloudflared",
  ["tunnel", "--no-autoupdate", "--url", `http://127.0.0.1:${proxyPort}`],
  { stdio: ["ignore", "pipe", "pipe"] },
);
// cloudflared logs the quick-tunnel URL on stderr (and may repeat it); print the banner once.
let announced = false;
const onOutput = (chunk: Buffer) => {
  const url = parseTunnelUrl(chunk.toString());
  if (!url || announced) return;
  announced = true;
  console.log(`
Tunnel up (only ${CONNECTOR_PREFIX}* is reachable): ${url}

Console → Connectors → Generic HTTP:
  Base URL:  ${connectorBaseUrl(url)}
  Header:    x-connector-secret = the CONNECTOR_SECRET value in .env (not printed here)
Then in the flow: Connector step → POST /lookup, and branch on its result.

This URL changes every run; update the connector's base URL after restarting. Ctrl-C to stop.`);
};
cloudflared.stdout.on("data", onOutput);
cloudflared.stderr.on("data", onOutput);

/** Stop cloudflared and the proxy together so neither outlives the other. */
function shutdown(code: number) {
  cloudflared.kill();
  proxy.close();
  process.exit(code);
}
cloudflared.on("error", (err: NodeJS.ErrnoException) => {
  console.error(
    err.code === "ENOENT"
      ? "cloudflared is not installed: brew install cloudflared (or see developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)"
      : `cloudflared failed to start: ${err.message}`,
  );
  shutdown(1);
});
cloudflared.on("exit", (code) => {
  if (code !== null && code !== 0)
    console.error(`cloudflared exited (${code})`);
  shutdown(code ?? 0);
});
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
