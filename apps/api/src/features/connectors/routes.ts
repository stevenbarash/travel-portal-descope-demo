import { createHash, timingSafeEqual } from "node:crypto";
import {
  type ApiError,
  ConnectorLookupRequest,
  ConnectorLookupResponse,
} from "@kit/contracts";
import { type RequestHandler, Router } from "express";
import { type DirectoryEntry, lookup, SAMPLE_DIRECTORY } from "./directory";

/**
 * Routes a Descope HTTP connector calls from inside a flow — server to server, so there is no
 * session. They are authenticated by a shared secret instead:
 *   POST /api/connectors/lookup   header x-connector-secret: <CONNECTOR_SECRET>
 * Nothing from the request body is logged or echoed: flows often send personal data.
 */
export const CONNECTOR_SECRET_HEADER = "x-connector-secret";

const digest = (v: string) => createHash("sha256").update(v).digest();

/** Constant-time check of the shared secret; 503 until CONNECTOR_SECRET is set. */
export function connectorAuth(secret: string | undefined): RequestHandler {
  const expected = secret ? digest(secret) : undefined;
  return (req, res, next) => {
    if (!expected) {
      const body: ApiError = {
        error: "not_configured",
        message: "Set CONNECTOR_SECRET in .env to enable connector routes",
      };
      res.status(503).json(body);
      return;
    }
    const got = req.get(CONNECTOR_SECRET_HEADER);
    // Hash both sides so the comparison is constant-time whatever the lengths.
    if (!got || !timingSafeEqual(digest(got), expected)) {
      const body: ApiError = { error: "unauthenticated" };
      res.status(401).json(body);
      return;
    }
    next();
  };
}

export function connectorsRouter(
  secret: string | undefined,
  directory: readonly DirectoryEntry[] = SAMPLE_DIRECTORY,
) {
  const router = Router();
  router.use(connectorAuth(secret));
  router.post("/lookup", (req, res) => {
    const parsed = ConnectorLookupRequest.safeParse(req.body);
    if (!parsed.success) {
      // Field names only, never values.
      const fields = [
        ...new Set(parsed.error.issues.map((i) => i.path.join("."))),
      ];
      const body: ApiError = {
        error: "bad_request",
        message: `Invalid fields: ${fields.join(", ")}`,
      };
      res.status(400).json(body);
      return;
    }
    res.json(ConnectorLookupResponse.parse(lookup(directory, parsed.data)));
  });
  return router;
}
