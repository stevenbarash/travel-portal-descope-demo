import { brand } from "@kit/brand";
import type { WebEnv } from "../env";

export type AuthMode = "flow" | "sdk";

const OVERRIDE_KEY = "kit.authMode";

/** Env sets the default; a localStorage override lets you flip modes mid-demo. */
export function resolveAuthMode(
  envMode: AuthMode,
  override: string | null,
): AuthMode {
  return override === "flow" || override === "sdk" ? override : envMode;
}

export function readAuthModeOverride(): string | null {
  try {
    return window.localStorage.getItem(OVERRIDE_KEY);
  } catch {
    return null;
  }
}

export function writeAuthModeOverride(mode: AuthMode | null) {
  try {
    if (mode) window.localStorage.setItem(OVERRIDE_KEY, mode);
    else window.localStorage.removeItem(OVERRIDE_KEY);
  } catch {
    // storage unavailable (private mode); env default applies
  }
}

export interface AuthConfig {
  projectId: string;
  baseUrl?: string;
  flowId: string;
  stepUpFlowId: string;
  /** Prefill for the Organization field on /login. Optional. */
  loginTenantId?: string;
  loginDefault: "personal" | "org";
  /** Descope style ID for hosted flows, if the project has one for this brand. */
  styleId?: string;
  /** Descope style ID for embedded widgets: brand.descopeWidgetStyleId, else `styleId`. */
  widgetStyleId?: string;
  /** light/dark for embedded flows: brand.descopeTheme. */
  descopeTheme: "os" | "light";
  sessionViaCookie: boolean;
  defaultMode: AuthMode;
  /** Descope widget IDs for /admin; undefined hides that widget. */
  userManagementWidgetId?: string;
  auditWidgetId?: string;
  /** Descope User Profile widget ID for /me. */
  userProfileWidgetId: string;
}

export function authConfigFromEnv(env: WebEnv): AuthConfig {
  return {
    projectId: env.VITE_DESCOPE_PROJECT_ID,
    baseUrl: env.VITE_DESCOPE_BASE_URL,
    flowId: env.VITE_DESCOPE_FLOW_ID,
    stepUpFlowId: env.VITE_DESCOPE_STEP_UP_FLOW_ID,
    loginTenantId: env.VITE_DESCOPE_TENANT_ID,
    loginDefault: env.VITE_LOGIN_DEFAULT,
    styleId: env.VITE_DESCOPE_STYLE_ID ?? brand.descopeStyleId,
    widgetStyleId:
      brand.descopeWidgetStyleId ??
      env.VITE_DESCOPE_STYLE_ID ??
      brand.descopeStyleId,
    descopeTheme: brand.descopeTheme,
    sessionViaCookie: env.VITE_SESSION_VIA_COOKIE,
    defaultMode: env.VITE_AUTH_MODE,
    userManagementWidgetId: env.VITE_DESCOPE_USER_MGMT_WIDGET_ID,
    auditWidgetId: env.VITE_DESCOPE_AUDIT_WIDGET_ID,
    userProfileWidgetId: env.VITE_DESCOPE_USER_PROFILE_WIDGET_ID,
  };
}
