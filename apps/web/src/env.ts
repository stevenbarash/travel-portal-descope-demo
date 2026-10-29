import { z } from "zod";

const WebEnvSchema = z.object({
  VITE_DESCOPE_PROJECT_ID: z
    .string()
    .min(1, "required: your Descope project ID"),
  /** Descope API host override, e.g. a custom CNAME domain or a regional/non-prod endpoint. */
  VITE_DESCOPE_BASE_URL: z.url().optional(),
  VITE_DESCOPE_FLOW_ID: z.string().default("tp-sign-up-or-in"),
  VITE_DESCOPE_STEP_UP_FLOW_ID: z.string().default("demo-step-up"),
  /** Optional Descope style ID (console → Styles) applied to hosted flows. Overrides brand.descopeStyleId. */
  VITE_DESCOPE_STYLE_ID: z.string().optional(),
  /** Optional style ID for embedded widgets. Overrides brand.descopeWidgetStyleId; defaults to VITE_DESCOPE_STYLE_ID. */
  VITE_DESCOPE_WIDGET_STYLE_ID: z.string().optional(),
  /** Descope's User Profile widget on /me (every project ships `user-profile-widget`). */
  VITE_DESCOPE_USER_PROFILE_WIDGET_ID: z
    .string()
    .default("user-profile-widget"),
  /** Session JWT in the DS cookie instead of JS storage + Bearer header. Must match the API's setting. */
  VITE_SESSION_VIA_COOKIE: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
});

export type WebEnv = z.infer<typeof WebEnvSchema>;

export type EnvResult =
  | { ok: true; env: WebEnv }
  | { ok: false; issues: { path: string; message: string }[] };

/** Validates VITE_ variables without throwing, so main.tsx can render a setup screen instead. */
export function parseWebEnv(source: Record<string, unknown>): EnvResult {
  // `FOO=` in .env arrives as "": treat it as unset so defaults apply and optional fields pass.
  const cleaned = Object.fromEntries(
    Object.entries(source).filter(([, v]) => v !== undefined && v !== ""),
  );
  const result = WebEnvSchema.safeParse(cleaned);
  if (result.success) return { ok: true, env: result.data };
  return {
    ok: false,
    issues: result.error.issues.map((i) => ({
      path: i.path.join("."),
      message: i.message,
    })),
  };
}

export const envResult = parseWebEnv(import.meta.env);
