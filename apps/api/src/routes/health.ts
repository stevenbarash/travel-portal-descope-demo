import { HealthResponse } from "@kit/contracts";
import { Router } from "express";

export function healthRouter() {
  const router = Router();
  router.get("/", (_req, res) => {
    const body = HealthResponse.parse({
      ok: true,
      service: "api",
      time: new Date().toISOString(),
    });
    res.json(body);
  });
  return router;
}
