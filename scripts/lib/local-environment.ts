import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "dotenv";
import { type Diagnostic, diagnose } from "./doctor";
export const repoRoot = resolve(import.meta.dirname, "../..");
export function localEnvironment(root = repoRoot) {
  const file = resolve(root, ".env");
  const hasFile = existsSync(file);
  const env: Record<string, string | undefined> = hasFile
    ? parse(readFileSync(file))
    : {};
  const diagnostics = diagnose(env, hasFile);
  const overrides = Object.keys({ ...env, ...process.env }).some(
    (key) =>
      /^(DESCOPE_|VITE_|PORT$|WEB_ORIGIN$)/.test(key) &&
      process.env[key] !== undefined &&
      process.env[key] !== env[key],
  );
  if (overrides)
    diagnostics.push({
      id: "shell-overrides",
      status: "blocked",
      message:
        "Shell configuration overrides root .env. Unset target/auth overrides so scripts and Vite use the same configuration.",
    });
  const viteOverrides = [
    ".env.local",
    ".env.development",
    ".env.development.local",
    ".env.test",
    ".env.test.local",
  ].some((name) => existsSync(resolve(root, name)));
  if (viteOverrides)
    diagnostics.push({
      id: "vite-overrides",
      status: "blocked",
      message:
        "Additional Vite environment files exist. Consolidate auth/target settings into root .env before smoke testing.",
    });
  return { env, diagnostics };
}
export function printDiagnostics(rows: Diagnostic[]) {
  for (const row of rows)
    console.log(`[${row.status}] ${row.id}: ${row.message}`);
}
