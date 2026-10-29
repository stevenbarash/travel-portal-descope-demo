import { z } from "zod";

const WebEnvSchema = z.object({
  VITE_DESCOPE_PROJECT_ID: z
    .string()
    .min(1, "required: your Descope project ID"),
  VITE_DESCOPE_BASE_URL: z.url().optional(),
  VITE_DESCOPE_FLOW_ID: z.string().default("tp-sign-up-or-in"),
  VITE_DESCOPE_STEP_UP_FLOW_ID: z.string().default("demo-step-up"),
  /** Optional Descope style ID (console → Styles) applied to hosted flows. Overrides brand.descopeStyleId. */
  VITE_DESCOPE_STYLE_ID: z.string().optional(),
  /** Prefills the Organization field on /login (tenant-isolated projects need a tenant for org logins). */
  VITE_DESCOPE_TENANT_ID: z.string().optional(),
  /** Which login option is preselected: consumer (no tenant) or organization. `?tenant=` forces org. */
  VITE_LOGIN_DEFAULT: z.enum(["personal", "org"]).default("personal"),
  VITE_AUTH_MODE: z.enum(["flow", "sdk"]).default("flow"),
  /**
   * Descope admin widgets on /admin (projects ship `user-management-widget` and
   * `audit-management-widget`). Unset hides the widget; the API-driven members table stays.
   */
  VITE_DESCOPE_USER_MGMT_WIDGET_ID: z.string().optional(),
  VITE_DESCOPE_AUDIT_WIDGET_ID: z.string().optional(),
  /** Descope's User Profile widget on /me (every project ships `user-profile-widget`). */
  VITE_DESCOPE_USER_PROFILE_WIDGET_ID: z
    .string()
    .default("user-profile-widget"),
  VITE_SESSION_VIA_COOKIE: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
});

export type WebEnv = z.infer<typeof WebEnvSchema>;

export type EnvResult =
  | { ok: true; env: WebEnv }
  | { ok: false; issues: { path: string; message: string }[] };

export function parseWebEnv(source: Record<string, unknown>): EnvResult {
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
