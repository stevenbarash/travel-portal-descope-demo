import { createServer, request } from "node:http";

/** The only API paths `npm run tunnel` exposes publicly. */
export const CONNECTOR_PREFIX = "/api/connectors/";

/**
 * True only for a request under /api/connectors/. The raw target is checked before and after
 * URL normalization, so dot segments (`/api/connectors/../whoami`, encoded or not) and anything
 * that resolves elsewhere are refused rather than forwarded.
 */
export function isConnectorPath(rawUrl: string | undefined): boolean {
  if (!rawUrl?.startsWith(CONNECTOR_PREFIX)) return false;
  const path = rawUrl.split(/[?#]/, 1)[0] ?? "";
  let decoded: string;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    return false;
  }
  if (/(^|\/)\.\.?(\/|$)/.test(decoded) || decoded.includes("\\")) return false;
  // Any difference after WHATWG normalization means the path would resolve somewhere unexpected.
  const normalized = new URL(rawUrl, "http://proxy.invalid").pathname;
  return normalized.startsWith(CONNECTOR_PREFIX) && normalized === path;
}

/** The public URL cloudflared prints for a quick tunnel, if this output chunk contains it. */
export function parseTunnelUrl(output: string): string | undefined {
  return output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)?.[0];
}

/** What to paste into Console → Connectors → Generic HTTP → Base URL. */
export function connectorBaseUrl(tunnelUrl: string): string {
  return `${tunnelUrl.replace(/\/+$/, "")}/api/connectors`;
}

/**
 * A local HTTP proxy that forwards only /api/connectors/* to the API on `apiPort` and answers
 * 404 for everything else. The public tunnel points at this, never at the API itself.
 */
export function createConnectorProxy(apiPort: number) {
  return createServer((req, res) => {
    if (!isConnectorPath(req.url)) {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          error: "not_found",
          message: `Only ${CONNECTOR_PREFIX}* is exposed`,
        }),
      );
      return;
    }
    const upstream = request(
      {
        host: "127.0.0.1",
        port: apiPort,
        method: req.method,
        path: req.url,
        // Rewrite Host: the API sees a local request, not the trycloudflare.com hostname.
        headers: { ...req.headers, host: `localhost:${apiPort}` },
      },
      (up) => {
        res.writeHead(up.statusCode ?? 502, up.headers);
        up.pipe(res);
      },
    );
    // API down or connection reset: answer 502 if nothing was sent yet, else just close.
    upstream.on("error", () => {
      if (!res.headersSent) res.writeHead(502);
      res.end();
    });
    req.pipe(upstream);
  });
}
