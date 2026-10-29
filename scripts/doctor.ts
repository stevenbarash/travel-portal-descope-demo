import { localEnvironment, printDiagnostics } from "./lib/local-environment";
import { portDiagnostics } from "./lib/ports";

/**
 * `npm run doctor`: offline preflight of .env, tooling and local ports. Run before `npm run dev`
 * or seed when something will not start. `--json` prints machine-readable rows; exits 1 if blocked.
 */
const { diagnostics } = localEnvironment();
const rows = [...diagnostics, ...(await portDiagnostics())];
if (process.argv.includes("--json")) console.log(JSON.stringify(rows, null, 2));
else printDiagnostics(rows);
process.exitCode = rows.some((row) => row.status === "blocked") ? 1 : 0;
