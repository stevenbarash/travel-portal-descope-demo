import { defineConfig } from "@playwright/test";
import { localEnvironment } from "./scripts/lib/local-environment";

const blocked = localEnvironment().diagnostics.filter(
  (row) => row.status === "blocked",
);
if (blocked.length)
  throw new Error(
    `Live smoke unavailable: ${blocked.map((row) => row.message).join(" ")}`,
  );

/**
 * Smoke tests against dev servers Playwright starts itself. Logs in as seeded Descope test users
 * with management-generated OTPs (or DESCOPE_TEST_OTP), so no inbox is needed. Requires .env with
 * a management key and `pnpm seed` (or `npm run seed`) to have run once.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  retries: 0,
  // Specs share the same seeded test users; concurrent logins invalidate each other's OTPs.
  workers: 1,
  outputDir: "test-results",
  use: {
    baseURL: "http://localhost:5173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  // Start and check each service separately and never reuse one: a fresh Vite must never proxy
  // another checkout's API (which validates sessions against a different project).
  webServer: [
    {
      command: "npm run dev -w @kit/api",
      url: "http://localhost:3001/api/health",
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: "npm run dev -w @kit/web",
      url: "http://localhost:5173",
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
  projects: [
    { name: "reset", testMatch: /reset\.setup\.ts/ },
    {
      name: "chromium",
      use: { browserName: "chromium" },
      dependencies: ["reset"],
    },
  ],
});
