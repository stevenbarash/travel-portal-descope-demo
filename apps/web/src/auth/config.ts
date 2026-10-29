import { brand } from "@kit/brand";
import type { WebEnv } from "../env";

/** Client-side Descope settings. Everything here is public (it ships in the bundle); secrets live on the API. */
export interface AuthConfig {
  projectId: string;
  /** Custom domain / CNAME for the Descope API; unset uses the default Descope host. */
  baseUrl?: string;
  /** Sign-up-or-in flow rendered on /login. */
  flowId: string;
  /** Flow that re-verifies an existing session; on success Descope sets `su` in the session JWT. */
  stepUpFlowId: string;
  /** Descope style ID for hosted flows, if the project has one for this brand. */
  styleId?: string;
  /** Descope style ID for embedded widgets; see authConfigFromEnv for the precedence. */
  widgetStyleId?: string;
  /** light/dark for embedded flows: brand.descopeTheme. */
  descopeTheme: "os" | "light";
  /** Store the session JWT in the DS cookie (sent to the API automatically) instead of localStorage. */
  sessionViaCookie: boolean;
  /** Descope User Profile widget ID for /me. */
  userProfileWidgetId: string;
}

/** Build AuthConfig from validated Vite env, with brand defaults where the env leaves a gap. */
export function authConfigFromEnv(env: WebEnv): AuthConfig {
  return {
    projectId: env.VITE_DESCOPE_PROJECT_ID,
    baseUrl: env.VITE_DESCOPE_BASE_URL,
    flowId: env.VITE_DESCOPE_FLOW_ID,
    stepUpFlowId: env.VITE_DESCOPE_STEP_UP_FLOW_ID,
    styleId: env.VITE_DESCOPE_STYLE_ID ?? brand.descopeStyleId,
    // Styles live in the Descope project, not the code, so env wins over the brand: a project with
    // its own styles (e.g. a customer's) sets them in .env. Widgets can need a different style than
    // flows (e.g. flat containers), hence a separate ID; when only VITE_DESCOPE_STYLE_ID is set, widgets
    // follow it rather than falling back to a brand widget style the project may not have.
    widgetStyleId:
      env.VITE_DESCOPE_WIDGET_STYLE_ID ??
      env.VITE_DESCOPE_STYLE_ID ??
      brand.descopeWidgetStyleId ??
      brand.descopeStyleId,
    descopeTheme: brand.descopeTheme,
    sessionViaCookie: env.VITE_SESSION_VIA_COOKIE,
    userProfileWidgetId: env.VITE_DESCOPE_USER_PROFILE_WIDGET_ID,
  };
}
