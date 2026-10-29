import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import {
  localEnvironment,
  printDiagnostics,
  repoRoot,
} from "./lib/local-environment";
import { portDiagnostics } from "./lib/ports";

const { diagnostics } = localEnvironment();
const rows = [...diagnostics, ...(await portDiagnostics())];
printDiagnostics(rows);
if (rows.some((row) => row.status === "blocked")) process.exit(1);
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
