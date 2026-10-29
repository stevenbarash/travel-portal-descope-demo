import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";
import { z } from "zod";

// One .env at the repo root serves both apps.
const repoRoot = resolve(fileURLToPath(import.meta.url), "../../../..");
loadDotenv({ path: resolve(repoRoot, ".env"), quiet: true });

const EnvSchema = z.object({
  DESCOPE_PROJECT_ID: z.string().min(1, "required: your Descope project ID"),
  DESCOPE_MANAGEMENT_KEY: z.string().optional(),
  DESCOPE_BASE_URL: z.url().optional(),
  PORT: z.coerce.number().int().positive().default(3001),
  /**
   * Browser origins allowed to call the API directly (comma-separated). Only matters without the
   * Vite dev proxy: a hosted web app, or a second app on its own origin.
   */
  WEB_ORIGIN: z
    .string()
    .default("http://localhost:5173")
    .transform((v) =>
      v
        .split(",")
        .map((o) => o.trim())
        .filter(Boolean),
    )
    .pipe(z.array(z.url()).min(1)),
  /**
   * Expose POST /api/demo/reset, which restores in-memory demo data (e2e calls it before each run).
   * Default: on unless NODE_ENV=production.
   */
  KIT_DEMO_RESET: z.stringbool().optional(),
  /**
   * Shared secret a Descope HTTP connector sends (header x-connector-secret) when a flow calls
   * /api/connectors/*. Unset: those routes answer 503. Server-only; never VITE_.
   */
  CONNECTOR_SECRET: z
    .string()
    .min(16, "use at least 16 random characters")
    .optional(),
});

export type Env = z.infer<typeof EnvSchema>;

export class EnvError extends Error {}

/** Parse and validate env. Throws EnvError naming every missing/invalid variable. */
export function parseEnv(source: NodeJS.ProcessEnv = process.env): Env {
  // Treat empty strings (from a copied .env.example) as unset.
  const cleaned = Object.fromEntries(
    Object.entries(source).filter(([, v]) => v !== undefined && v !== ""),
  );
  const result = EnvSchema.safeParse(cleaned);
  if (!result.success) {
    const lines = result.error.issues.map(
      (i) => `  ${i.path.join(".")}: ${i.message}`,
    );
    throw new EnvError(
      `Invalid environment:\n${lines.join("\n")}\n\nCopy .env.example to .env at the repo root and fill in the values.`,
    );
  }
  return result.data;
}
