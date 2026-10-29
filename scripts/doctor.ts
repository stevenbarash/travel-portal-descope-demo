import { localEnvironment, printDiagnostics } from "./lib/local-environment";
import { portDiagnostics } from "./lib/ports";

const { diagnostics } = localEnvironment();
const rows = [...diagnostics, ...(await portDiagnostics())];
if (process.argv.includes("--json")) console.log(JSON.stringify(rows, null, 2));
else printDiagnostics(rows);
process.exitCode = rows.some((row) => row.status === "blocked") ? 1 : 0;
