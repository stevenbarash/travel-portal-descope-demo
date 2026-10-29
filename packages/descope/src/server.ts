import DescopeClient, { type AuthenticationInfo } from "@descope/node-sdk";
import { type Family, type FamilyMember, WhoAmI } from "@kit/contracts";

export type { AuthenticationInfo };

export interface DescopeServerConfig {
  projectId: string;
  managementKey?: string;
  /** Custom domain (CNAME), e.g. https://auth.example.com. Omit for the default. */
  baseUrl?: string;
}

/** Who performed an audited action on the user's behalf, or undefined when they acted themselves. */
function actorOf(record: { userId: string }): string | undefined {
  const actorId = (record as { actorId?: unknown }).actorId;
  return typeof actorId === "string" && actorId && actorId !== record.userId
    ? actorId
    : undefined;
}

/**
 * The only place the API talks to the Descope Node SDK.
 * Framework-agnostic: takes tokens and AuthenticationInfo, never req/res.
 * Every method here must be listed in docs/descope-sdk-cheatsheet.md.
 */
export function createDescopeServer(cfg: DescopeServerConfig) {
  const client = DescopeClient({
    projectId: cfg.projectId,
    managementKey: cfg.managementKey,
    baseUrl: cfg.baseUrl,
  });

  return {
    /** Escape hatch for management operations (seed scripts, admin routes). */
    client,

    /** Cookie names the web SDK uses when configured for cookie-based sessions. */
    cookieNames: {
      session: DescopeClient.SessionTokenCookieName,
      refresh: DescopeClient.RefreshTokenCookieName,
    },

    /** Validate a session JWT (signature + expiry). Throws when invalid or expired. */
    validateSession(sessionToken: string): Promise<AuthenticationInfo> {
      return client.validateSession(sessionToken);
    },

    /**
     * Validate the session; if it is expired and a refresh token is available, refresh it.
     * Use only when the API receives the refresh token (cookie-managed projects).
     */
    validateOrRefreshSession(sessionToken?: string, refreshToken?: string) {
      return client.validateAndRefreshSession(sessionToken, refreshToken);
    },

    // ---- authorization checks (read the validated JWT; no network) ----
    /** Every listed project-level permission (top-level `permissions` claim; tenant grants don't count). */
    hasPermissions(auth: AuthenticationInfo, permissions: string[]): boolean {
      return client.validatePermissions(auth, permissions);
    },
    /** Every listed project-level role. Prefer hasPermissions: role names vary per customer. */
    hasRoles(auth: AuthenticationInfo, roles: string[]): boolean {
      return client.validateRoles(auth, roles);
    },
    /** Every listed permission within one tenant (`tenants.<id>.permissions`). False if not a member. */
    hasTenantPermissions(
      auth: AuthenticationInfo,
      tenantId: string,
      permissions: string[],
    ): boolean {
      return client.validateTenantPermissions(auth, tenantId, permissions);
    },
    /** Every listed role within one tenant. Prefer hasTenantPermissions. */
    hasTenantRoles(
      auth: AuthenticationInfo,
      tenantId: string,
      roles: string[],
    ): boolean {
      return client.validateTenantRoles(auth, tenantId, roles);
    },

    // ---- claim readers (no network) ----
    /** True after the user completed a step-up flow: Descope sets the `su` claim on the session JWT. */
    isSteppedUp(auth: AuthenticationInfo): boolean {
      return Boolean((auth.token as Record<string, unknown>).su);
    },
    /** Every tenant the user belongs to (keys of the `tenants` claim). */
    tenantIdsOf(auth: AuthenticationInfo): string[] {
      return Object.keys(
        ((auth.token as Record<string, unknown>).tenants as
          | object
          | undefined) ?? {},
      );
    },
    /** The tenant the session is working in (`dct`), set when a flow or selectTenant picks one. */
    currentTenantOf(auth: AuthenticationInfo): string | undefined {
      const dct = (auth.token as Record<string, unknown>).dct;
      return typeof dct === "string" ? dct : undefined;
    },
    /** Membership from the signed claim; uses `this`, so call it as a method, not detached. */
    isTenantMember(auth: AuthenticationInfo, tenantId: string): boolean {
      return this.tenantIdsOf(auth).includes(tenantId);
    },
    /**
     * Family Accounts: the session JWT carries `families: { <familyId>: { roles, permissions } }`,
     * shaped like `tenants`. Authorize family actions from here, not from the request.
     */
    familiesOf(auth: AuthenticationInfo): Record<string, FamilyClaims> {
      const raw = ((auth.token as Record<string, unknown>).families ??
        {}) as Record<string, Partial<FamilyClaims> | undefined>;
      return Object.fromEntries(
        Object.entries(raw).map(([id, v]) => [
          id,
          { roles: v?.roles ?? [], permissions: v?.permissions ?? [] },
        ]),
      );
    },

    // ---- management (needs managementKey) ----
    // Each call below hits the Descope management API and throws on a non-ok response, so a
    // route's error handler answers 500 instead of returning partial data.
    /** Routes that call management methods check this first and answer 503 rather than throw. */
    hasManagementKey: Boolean(cfg.managementKey),
    /** Tenant names for a set of IDs. */
    async loadTenants(ids: string[]) {
      if (ids.length === 0) return [];
      const res = await client.management.tenant.searchAll(ids);
      if (!res.ok)
        throw new Error(
          `tenant.searchAll failed: ${res.error?.errorDescription}`,
        );
      return (res.data ?? []).map((t) => ({ id: t.id, name: t.name }));
    },
    /** Users belonging to a tenant, test users included (demos run on test users). */
    async searchTenantUsers(tenantId: string) {
      // Positional args: tenantIds, roles, limit, page, testUsersOnly, withTestUser=true.
      const res = await client.management.user.searchAll(
        [tenantId],
        undefined,
        undefined,
        undefined,
        undefined,
        true,
      );
      if (!res.ok)
        throw new Error(
          `user.searchAll failed: ${res.error?.errorDescription}`,
        );
      return (res.data ?? []).map((u) => ({
        userId: u.userId,
        email: u.email,
        name: u.name,
        // Roles in this tenant only; the same user can hold different roles elsewhere.
        roles:
          u.userTenants?.find((t) => t.tenantId === tenantId)?.roleNames ?? [],
      }));
    },
    /**
     * Every user in a tenant with their status, test users included. Right after an activate or
     * deactivate this search can briefly return the old status: use the action's own response.
     */
    async tenantUserStatuses(tenantId: string) {
      const res = await client.management.user.searchAll(
        [tenantId],
        undefined,
        undefined,
        undefined,
        undefined,
        true,
      );
      if (!res.ok)
        throw new Error(
          `user.searchAll failed: ${res.error?.errorDescription}`,
        );
      return (res.data ?? []).map((u) => ({
        userId: u.userId,
        status: u.status,
      }));
    },
    /** Enable or disable one user; returns the status Descope reports after the change. */
    async setUserActive(userId: string, active: boolean) {
      const res = active
        ? await client.management.user.activate(userId)
        : await client.management.user.deactivate(userId);
      if (!res.ok)
        throw new Error(
          `user.${active ? "activate" : "deactivate"} failed: ${res.error?.errorDescription}`,
        );
      return res.data?.status ?? (active ? "enabled" : "disabled");
    },
    /** SSO Setup Suite: a time-limited link the tenant's IT admin uses to configure SAML/OIDC. */
    async ssoSetupLink(tenantId: string, expireSeconds: number) {
      const res = await client.management.tenant.generateSSOConfigurationLink(
        tenantId,
        expireSeconds,
      );
      if (!res.ok || !res.data)
        throw new Error(
          `tenant.generateSSOConfigurationLink failed: ${res.error?.errorDescription}`,
        );
      return res.data.adminSSOConfigurationLink;
    },

    // ---- customers (B2C, project-level users) ----
    /** One user by ID, test users included. */
    async loadUser(userId: string) {
      const res = await client.management.user.loadByUserId(userId);
      if (!res.ok || !res.data)
        throw new Error(
          `user.loadByUserId failed: ${res.error?.errorDescription}`,
        );
      return toCustomer(res.data);
    },
    /** Free-text search over customers (email, name, phone), test users included. */
    async searchCustomers(text: string, limit = 20) {
      const res = await client.management.user.search({
        text: text || undefined,
        limit,
        withTestUser: true,
      });
      if (!res.ok)
        throw new Error(`user.search failed: ${res.error?.errorDescription}`);
      return (res.data?.users ?? []).map(toCustomer);
    },
    /**
     * Sign in as a customer: Descope issues a JWT for the customer's login ID carrying the agent
     * in its `act` claim. The impersonator needs the Impersonate permission. Customer consent
     * isn't checked here (validateConsent=false); production would turn it on.
     */
    async impersonate(impersonatorId: string, loginId: string) {
      const res = await client.management.jwt.impersonate(
        impersonatorId,
        loginId,
        false,
      );
      if (!res.ok || !res.data)
        throw new Error(
          `jwt.impersonate failed: ${res.error?.errorCode} ${res.error?.errorDescription}`,
        );
      return res.data.jwt;
    },
    /** A customer's audit trail, newest first (Descope keeps 30 days searchable). */
    async auditFor(userId: string) {
      // 29 days, not 30: keeps `from` safely inside Descope's searchable window.
      const res = await client.management.audit.search({
        userIds: [userId],
        from: Date.now() - 29 * 24 * 3600 * 1000,
      });
      if (!res.ok)
        throw new Error(`audit.search failed: ${res.error?.errorDescription}`);
      return (res.data ?? [])
        .sort((a, b) => b.occurred - a.occurred)
        .map((a) => ({
          occurred: new Date(a.occurred).toISOString(),
          action: a.action,
          method: a.method || undefined,
          device: a.device || undefined,
          geo: a.geo || undefined,
          // Descope returns `actorId` at the top level of each record (the node SDK passes it
          // through but leaves it off AuditRecord). It equals `userId` when users act for
          // themselves, so only a different ID means someone acted on their behalf.
          actorId: actorOf(a),
        }));
    },

    // ---- families (Descope Family Accounts) ----
    /** A family and everyone in it: guardians (who log in) and dependents (who don't). */
    async loadFamily(familyId: string): Promise<Family | null> {
      // The family record has no members; they come from a user search on familyIds.
      const [fam, users] = await Promise.all([
        client.management.family.searchAll({ ids: [familyId] }),
        client.management.user.search({
          familyIds: [familyId],
          withTestUser: true,
          limit: 50,
        }),
      ]);
      if (!fam.ok)
        throw new Error(
          `family.searchAll failed: ${fam.error?.errorDescription}`,
        );
      if (!users.ok)
        throw new Error(
          `user.search(familyIds) failed: ${users.error?.errorDescription}`,
        );
      const family = fam.data?.find((f) => f.id === familyId);
      if (!family) return null;
      // Guardians first (by name), then dependents in the order they were added.
      const members = [...(users.data?.users ?? [])]
        .sort(
          (a, b) =>
            Number(a.dependent === true) - Number(b.dependent === true) ||
            (a.dependent
              ? a.createdTime - b.createdTime
              : (a.name ?? "").localeCompare(b.name ?? "")),
        )
        .map((u) => toFamilyMember(u, familyId));
      return { id: family.id, name: family.name, members };
    },
    /**
     * A dependent profile: a user with no credentials, reachable only through a guardian. The
     * login ID is ours (never an email: a child may share a parent's).
     */
    async createDependent(
      familyId: string,
      name: string,
      relationship: string,
    ): Promise<FamilyMember> {
      const slug =
        name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
          .slice(0, 24) || "member";
      // Family prefix plus a time suffix keeps login IDs unique project-wide, even for two "Max"es.
      // `relationship` is stored on the family membership, not on the user.
      const res = await client.management.family.createDependent(familyId, {
        loginId: `${familyId}-${slug}-${Date.now().toString(36)}`,
        name,
        familyScopedAttributes: { relationship },
      });
      if (!res.ok || !res.data)
        throw new Error(
          `family.createDependent failed: ${res.error?.errorDescription}`,
        );
      return toFamilyMember(res.data, familyId);
    },
    /** Delete a dependent profile. Callers must first confirm it is a dependent in the caller's family. */
    async deleteDependent(userId: string) {
      const res = await client.management.family.deleteDependent(userId);
      if (!res.ok)
        throw new Error(
          `family.deleteDependent failed: ${res.error?.errorDescription}`,
        );
    },
    /**
     * Act on behalf of a dependent: Descope issues a JWT for the dependent with the guardian in
     * `act.sub` and the family in `dcf`, and audits it. Descope itself refuses (E068104) unless the
     * guardian holds "Family Impersonate Dependents" in that family.
     */
    async actForDependent(
      guardianId: string,
      dependentLoginId: string,
      familyId: string,
    ) {
      const res = await client.management.family.impersonateDependent(
        guardianId,
        dependentLoginId,
        familyId,
      );
      if (!res.ok || !res.data)
        throw new Error(
          `family.impersonateDependent failed: ${res.error?.errorCode} ${res.error?.errorDescription}`,
        );
      return res.data.jwt;
    },

    toClaims,
  };
}

/** One family entry from the session's `families` claim. */
export interface FamilyClaims {
  roles: string[];
  permissions: string[];
}

/** The facade type routes depend on; derived so it never drifts from the implementation. */
export type DescopeServer = ReturnType<typeof createDescopeServer>;

/** A management-API user, derived from the SDK since it doesn't export the type by this name. */
type UserRecord = Awaited<
  ReturnType<
    ReturnType<typeof DescopeClient>["management"]["user"]["loadByUserId"]
  >
>["data"] & {};

/** The customer view of a Descope user: who they are and how they can sign in. */
function toCustomer(u: UserRecord) {
  // `webauthn` is returned by the API but missing from the SDK's UserResponse type.
  const extra = u as typeof u & { webauthn?: boolean };
  const methods = [
    extra.webauthn && "passkey",
    u.password && "password",
    u.TOTP && "authenticator app",
    ...Object.entries(u.OAuth ?? {})
      .filter(([, on]) => on)
      .map(([provider]) => provider),
  ].filter((m): m is string => Boolean(m));
  return {
    userId: u.userId,
    loginId: u.loginIds[0] ?? u.email ?? u.userId,
    email: u.email || undefined,
    name: u.name || undefined,
    status: u.status,
    methods,
    // Descope reports createdTime in seconds.
    createdAt: u.createdTime
      ? new Date(u.createdTime * 1000).toISOString()
      : undefined,
    // The project allows one family per user, so the first is the only one.
    familyId: u.userFamilies?.[0]?.familyId,
  };
}

/** A user as a member of one family: their family roles and family-scoped relationship. */
function toFamilyMember(u: UserRecord, familyId: string): FamilyMember {
  const membership = u.userFamilies?.find((f) => f.familyId === familyId);
  const relationship = membership?.familyScopedAttributes?.relationship;
  return {
    userId: u.userId,
    loginId: u.loginIds[0] ?? u.userId,
    name: u.name || undefined,
    email: u.email || undefined,
    dependent: u.dependent === true,
    roles: membership?.roleNames ?? [],
    relationship: typeof relationship === "string" ? relationship : undefined,
  };
}

/** Standard JWT + Descope claims we surface as named fields; everything else is `custom`. */
const KNOWN_CLAIMS = new Set([
  "iss",
  "sub",
  "aud",
  "exp",
  "iat",
  "nbf",
  "jti",
  "amr",
  "drn",
  "rexp",
  "dct",
  "roles",
  "permissions",
  "tenants",
  "families",
]);

/** Normalize a validated session into the WhoAmI contract. */
export function toClaims(auth: AuthenticationInfo): WhoAmI {
  const t = auth.token as Record<string, unknown>;
  const tenantsRaw = (t.tenants ?? {}) as Record<
    string,
    { roles?: string[]; permissions?: string[] } | undefined
  >;
  const tenants = Object.fromEntries(
    Object.entries(tenantsRaw).map(([id, v]) => [
      id,
      { roles: v?.roles ?? [], permissions: v?.permissions ?? [] },
    ]),
  );
  const custom = Object.fromEntries(
    Object.entries(t).filter(([k]) => !KNOWN_CLAIMS.has(k)),
  );

  return WhoAmI.parse({
    userId: t.sub,
    issuer: t.iss,
    issuedAt: t.iat,
    expiresAt: t.exp,
    roles: t.roles ?? [],
    permissions: t.permissions ?? [],
    tenants,
    currentTenant: t.dct,
    custom,
    claims: t,
  });
}
