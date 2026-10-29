/** Roles and permissions held within one tenant (or family); never merged with project-level ones. */
export interface TenantAuthz {
  roles: string[];
  permissions: string[];
}

/** What the UI may show the current user. Advisory only: the API re-checks every request against the verified JWT. */
export interface Authz {
  /** `sub` claim. */
  userId?: string;
  /** Project-level roles (`roles` claim): B2C users without tenants get theirs here. */
  roles: string[];
  /** Project-level permissions, flattened by Descope from the roles above. */
  permissions: string[];
  /** `tenants` claim: tenant ID → roles and permissions within that tenant. */
  tenants: Record<string, TenantAuthz>;
  /** Descope Family Accounts: `families` claim, family ID → family roles and permissions. */
  families: Record<string, TenantAuthz>;
  /** `dct` claim: set after sdk.selectTenant() or by a flow that picks a tenant. */
  currentTenant?: string;
  /** `su` claim: set by Descope after a step-up flow. */
  isSteppedUp: boolean;
  claims: Record<string, unknown>;
  /** With a tenantId, checks only that tenant; without, only project-level roles. No fallback between the two. */
  hasRole(role: string, tenantId?: string): boolean;
  /** Same scoping as hasRole. */
  hasPermission(permission: string, tenantId?: string): boolean;
}

/**
 * Decode a JWT payload for DISPLAY purposes only (no signature check — the API validates).
 * Needed because `useSession().claims` is the subset the server returns with auth responses and
 * omits `tenants`; the session token itself carries the full authorization picture.
 */
export function decodeJwtPayload(
  token: string | undefined | null,
): Record<string, unknown> {
  if (!token) return {};
  const part = token.split(".")[1];
  if (!part) return {};
  try {
    // JWTs use unpadded base64url; atob needs standard base64 with padding.
    const json = atob(
      part
        .replace(/-/g, "+")
        .replace(/_/g, "/")
        .padEnd(Math.ceil(part.length / 4) * 4, "="),
    );
    const parsed: unknown = JSON.parse(json);
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

// Claims are untrusted input here; drop anything that is not a string rather than throw.
const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];

/** `{ <id>: { roles, permissions } }`, the shape of both the `tenants` and `families` claims. */
function scoped(raw: unknown): Record<string, TenantAuthz> {
  const entries = Object.entries(
    (raw ?? {}) as Record<
      string,
      { roles?: unknown; permissions?: unknown } | undefined
    >,
  );
  return Object.fromEntries(
    entries.map(([id, t]) => [
      id,
      { roles: strings(t?.roles), permissions: strings(t?.permissions) },
    ]),
  );
}

/** Pure: derive authorization facts from decoded session-JWT claims. Mirrors toClaims() on the API. */
export function authzFromClaims(
  claims: Record<string, unknown> | undefined,
): Authz {
  const c = claims ?? {};
  const tenants = scoped(c.tenants);
  const families = scoped(c.families);
  const roles = strings(c.roles);
  const permissions = strings(c.permissions);
  const currentTenant = typeof c.dct === "string" ? c.dct : undefined;

  return {
    userId: typeof c.sub === "string" ? c.sub : undefined,
    roles,
    permissions,
    tenants,
    families,
    currentTenant,
    isSteppedUp: Boolean(c.su),
    claims: c,
    // Scoped deliberately: a tenant admin is not a project admin, and vice versa.
    hasRole: (role, tenantId) =>
      (tenantId ? (tenants[tenantId]?.roles ?? []) : roles).includes(role),
    hasPermission: (perm, tenantId) =>
      (tenantId
        ? (tenants[tenantId]?.permissions ?? [])
        : permissions
      ).includes(perm),
  };
}
