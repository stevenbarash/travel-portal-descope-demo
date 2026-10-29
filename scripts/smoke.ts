import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import {
  localEnvironment,
  printDiagnostics,
  repoRoot,
} from "./lib/local-environment";
import { portDiagnostics } from "./lib/ports";

/**
 * `npm run e2e [-- playwright args]`: run the doctor checks, then Playwright. Fails fast on a
 * blocked environment so a missing .env or busy port is reported plainly, not as test timeouts.
 */
const { diagnostics } = localEnvironment();
const rows = [...diagnostics, ...(await portDiagnostics())];
printDiagnostics(rows);
if (rows.some((row) => row.status === "blocked")) process.exit(1);
// Resolve Playwright's CLI from node_modules and run it with this Node, so no global install or
// npx lookup is needed and extra args pass straight through.
const result = spawnSync(
  process.execPath,
  [
    createRequire(import.meta.url).resolve("@playwright/test/cli"),
    "test",
    ...process.argv.slice(2),
  ],
  { cwd: repoRoot, stdio: "inherit" },
);
process.exit(result.status ?? 1);
