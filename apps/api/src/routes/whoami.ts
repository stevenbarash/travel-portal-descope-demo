import type { DescopeServer } from "@kit/descope/server";
import { Router } from "express";
import { authOf, requireAuth } from "../auth/middleware";

/** Protected route exemplar: returns the normalized claims of the calling session. */
export function whoamiRouter(descope: DescopeServer) {
  const router = Router();
  router.get("/", requireAuth(descope), (req, res) => {
    res.json(descope.toClaims(authOf(req)));
  });
  return router;
}
