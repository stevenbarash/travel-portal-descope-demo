import type { ApiError } from "@kit/contracts";
import { createDescopeServer, type DescopeServer } from "@kit/descope/server";
import cookieParser from "cookie-parser";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { cors } from "./auth/middleware";
import type { Env } from "./env";
import {
  type BookingsRepo,
  InMemoryBookingsRepo,
} from "./features/bookings/repo";
import { bookingsRouter } from "./features/bookings/routes";
import { connectorsRouter } from "./features/connectors/routes";
import { familyRouter } from "./features/family/routes";
import { serviceRouter } from "./features/service/routes";
import { healthRouter } from "./routes/health";
import { whoamiRouter } from "./routes/whoami";

export interface AppDeps {
  descope: DescopeServer;
  bookings: BookingsRepo;
  /**
   * Restore every in-memory store to its boot state. Called by POST /api/demo/reset, which e2e
   * hits before each run: a reused dev server otherwise keeps the previous run's changes.
   * Every slice with in-memory state adds its reset here.
   */
  resetDemoData?: () => void;
}

export function createDeps(env: Env): AppDeps {
  // Demo data resets on restart by design. The returning guest's history is created on first read.
  const bookings = new InMemoryBookingsRepo();
  return {
    descope: createDescopeServer({
      projectId: env.DESCOPE_PROJECT_ID,
      managementKey: env.DESCOPE_MANAGEMENT_KEY,
      baseUrl: env.DESCOPE_BASE_URL,
    }),
    bookings,
    resetDemoData: () => bookings.reset(),
  };
}

/** Build the Express app. Deps are injectable so tests can fake Descope. */
export function createApp(env: Env, deps: AppDeps = createDeps(env)) {
  const app = express();
  app.disable("x-powered-by");
  app.use(cors(env.WEB_ORIGIN));
  app.use(express.json());
  app.use(cookieParser());

  app.use("/api/health", healthRouter());
  if (env.KIT_DEMO_RESET ?? process.env.NODE_ENV !== "production") {
    app.post("/api/demo/reset", (_req, res) => {
      deps.resetDemoData?.();
      res.status(204).end();
    });
  }
  // Called by Descope connectors from a flow (shared secret), not by the browser.
  app.use("/api/connectors", connectorsRouter(env.CONNECTOR_SECRET));
  app.use("/api/whoami", whoamiRouter(deps.descope));
  app.use("/api/bookings", bookingsRouter(deps.descope, deps.bookings));
  app.use("/api/family", familyRouter(deps.descope, deps.bookings));
  app.use("/api/service", serviceRouter(deps.descope, deps.bookings));

  app.use((req, res) => {
    const body: ApiError = {
      error: "not_found",
      message: `No route for ${req.method} ${req.path}`,
    };
    res.status(404).json(body);
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    // Body-parser errors are client mistakes, not API failures. Do not log their bodies.
    if (
      err &&
      typeof err === "object" &&
      "status" in err &&
      typeof err.status === "number" &&
      err.status >= 400 &&
      err.status < 500
    ) {
      const body: ApiError = {
        error: "bad_request",
        message: "Invalid request body",
      };
      res.status(err.status).json(body);
      return;
    }
    console.error(err);
    const body: ApiError = { error: "internal_error" };
    res.status(500).json(body);
  });

  return app;
}
