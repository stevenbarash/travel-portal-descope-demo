import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "dotenv";
import { type Diagnostic, diagnose } from "./doctor";
/** Absolute path of the monorepo root. */
export const repoRoot = resolve(import.meta.dirname, "../..");
/**
 * Parse root .env without touching process.env and run the offline diagnostics, plus checks for
 * anything that would make scripts and Vite see different settings.
 */
export function localEnvironment(root = repoRoot) {
  const file = resolve(root, ".env");
  const hasFile = existsSync(file);
  const env: Record<string, string | undefined> = hasFile
    ? parse(readFileSync(file))
    : {};
  const diagnostics = diagnose(env, hasFile);
  // dotenv never overrides an existing shell var, so an exported DESCOPE_* silently wins over .env.
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
  // Vite loads these mode files on top of .env; the scripts only read .env.
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
/** Print one `[status] id: message` line per diagnostic. */
export function printDiagnostics(rows: Diagnostic[]) {
  for (const row of rows)
    console.log(`[${row.status}] ${row.id}: ${row.message}`);
}
