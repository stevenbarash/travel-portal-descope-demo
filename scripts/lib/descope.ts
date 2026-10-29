import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createDescopeServer } from "@kit/descope/server";
import { config as loadDotenv } from "dotenv";

/**
 * Shared bootstrap for scripts. Loads the root .env (the single source of truth for which
 * Descope project we talk to) and requires a management key.
 */
export function loadScriptEnv() {
  // scripts/lib/descope.ts → repo root, regardless of the cwd the script was launched from.
  const repoRoot = resolve(fileURLToPath(import.meta.url), "../../..");
  loadDotenv({ path: resolve(repoRoot, ".env"), quiet: true });
  const projectId = process.env.DESCOPE_PROJECT_ID;
  const managementKey = process.env.DESCOPE_MANAGEMENT_KEY;
  const baseUrl = process.env.DESCOPE_BASE_URL || undefined;
  const missing = [
    !projectId && "DESCOPE_PROJECT_ID",
    !managementKey && "DESCOPE_MANAGEMENT_KEY",
  ].filter(Boolean);
  if (missing.length) {
    console.error(`Missing in .env: ${missing.join(", ")}`);
    process.exit(1);
  }
  return {
    projectId: projectId as string,
    managementKey: managementKey as string,
    baseUrl,
    repoRoot,
    /** The presenter's own address; seed creates plus-addressed demo users from it. Optional. */
    demoEmail: process.env.DEMO_EMAIL?.trim() || undefined,
  };
}

/** Env plus a Descope server wrapper authenticated with the management key. */
export function managementClient() {
  const env = loadScriptEnv();
  return { env, descope: createDescopeServer(env) };
}

/** Throw with Descope's error description when an SDK call fails. */
export function must<
  T extends {
    ok: boolean;
    error?: {
      errorCode: string;
      errorDescription: string;
      errorMessage?: string;
    };
  },
>(res: T, what: string): T {
  if (!res.ok) {
    const e = res.error;
    throw new Error(
      `${what} failed: ${e?.errorCode ?? "?"} ${e?.errorDescription ?? ""} ${e?.errorMessage ?? ""}`.trim(),
    );
  }
  return res;
}

/** Find real (non-test) users by email, e.g. the plus-addressed demo users. */
export async function findRealUsersByEmail(
  descope: ReturnType<typeof createDescopeServer>,
  email: string,
) {
  // Positional args up to `emails` (9th); testUsersOnly=false, withTestUser=false.
  const res = await descope.client.management.user.searchAll(
    undefined,
    undefined,
    undefined,
    undefined,
    false,
    false,
    undefined,
    undefined,
    [email],
  );
  return (must(res, `user.searchAll(email=${email})`).data ?? []).filter(
    (u) => u.test !== true,
  );
}

/**
 * Find a kit test user by email. Under tenant user isolation the stored login ID becomes
 * `<loginId>-<tenantId>`, so `user.load(loginId)` misses; searching by email works either way.
 */
export async function findTestUsersByEmail(
  descope: ReturnType<typeof createDescopeServer>,
  email: string,
) {
  // testUsersOnly=true, withTestUser=true: test users are excluded from searches by default.
  const res = await descope.client.management.user.searchAll(
    undefined,
    undefined,
    undefined,
    undefined,
    true,
    true,
    undefined,
    undefined,
    [email],
  );
  return (must(res, `user.searchAll(email=${email})`).data ?? []).filter(
    (u) => u.test === true,
  );
}

/**
 * The login ID Descope actually stored for a kit test user. Equals the email in shared-user
 * projects; `<email>-<tenantId>` under tenant user isolation. Management test-user helpers
 * (generateOTPForTestUser, generateMagicLinkForTestUser) need this exact value.
 */
export async function storedLoginId(
  descope: ReturnType<typeof createDescopeServer>,
  email: string,
  tenantId?: string,
): Promise<string> {
  const users = await findTestUsersByEmail(descope, email);
  // Without a tenant, pick the personal (tenantless) variant of the user.
  const matches = users.filter((u) =>
    tenantId
      ? u.userTenants?.some((t) => t.tenantId === tenantId)
      : !u.userTenants?.length,
  );
  if (matches.length > 1)
    throw new Error(
      "ambiguous test user identity; choose a unique tenant/login",
    );
  const id = matches[0]?.loginIds[0];
  if (!id) {
    throw new Error(
      `no test user found for ${email}${tenantId ? ` in ${tenantId}` : ""}; run npm run seed`,
    );
  }
  return id;
}
