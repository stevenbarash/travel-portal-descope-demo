import type { createDescopeServer } from "@kit/descope/server";
import {
  demoLoginId,
  dependentLoginId,
  FAMILY_ROLE,
  FAMILY_SCOPED_ATTRIBUTES,
  familiesFor,
  PERMISSIONS,
  type ResolvedFamily,
  ROLES,
  type SeedTenantMembership,
  type SeedUser,
  SSO_TENANTS,
  TENANTS,
  TEST_USERS,
} from "../seed-data";
import { findRealUsersByEmail, findTestUsersByEmail, must } from "./descope";
import { readKitFlowFiles } from "./flows";
import type { OwnershipLedger } from "./ownership";

/** What seed will do with a resource. Any "conflict" aborts the whole seed before writing. */
export type PlanAction = "create" | "preserve" | "update" | "conflict";
/** Resource categories in the plan; mostly the ownership-ledger kinds plus sso and familyMembers. */
export type PlanKind =
  | "permissions"
  | "roles"
  | "tenants"
  | "sso"
  | "users"
  | "demoUsers"
  | "flows"
  | "familyAttributes"
  | "families"
  | "dependents"
  | "familyMembers";

/** One planned step, printed by seed:plan and consumed by seed.ts to decide what to write. */
export type PlanRow = {
  kind: PlanKind;
  id: string;
  action: PlanAction;
  reason: string;
  /** users/demoUsers: the persona, its login ID, and the user to patch on "update". */
  persona?: SeedUser;
  /** tenants "create": the display name to use (seed-data's, or a free variant if it's taken). */
  name?: string;
  loginId?: string;
  userId?: string;
  tenants?: readonly SeedTenantMembership[];
  /** families/dependents/familyMembers: the family the row belongs to. */
  family?: ResolvedFamily;
  /** dependents: the seed entry; familyMembers: the guardian's relationship in the family. */
  dependent?: ResolvedFamily["dependents"][number];
  relationship?: string;
};

/** The subset of a Descope user record that drift detection reads. */
type ExistingUser = {
  userId: string;
  roleNames?: string[];
  userTenants?: { tenantId: string; roleNames?: string[] }[];
};

// Order-independent fingerprint of tenant memberships, so role or tenant order never reads as drift.
const membershipKey = (
  ts: readonly { tenantId: string; roles: readonly string[] }[],
) =>
  JSON.stringify(
    ts.map((t) => [t.tenantId, [...t.roles].sort()] as const).sort(),
  );

/**
 * The memberships a persona should have in this project. Under tenant user isolation seed gave a
 * multi-tenant persona only its first tenant, so a user holding exactly that tenant is not drift.
 */
export function wantedTenants(
  u: SeedUser,
  existing: ExistingUser,
): readonly SeedTenantMembership[] {
  const have = existing.userTenants ?? [];
  const first = u.tenants[0];
  const isolated =
    u.tenants.length > 1 &&
    have.length === 1 &&
    have[0]?.tenantId === first?.tenantId;
  return isolated && first ? [first] : u.tenants;
}

/**
 * Descope requires tenant names to be unique, not just IDs. When another tenant (any ID but this
 * one) already has `name`, compared case-insensitively, return `<name> (<id>)`, then
 * `<name> (<id>) 2`, … until one is free. The project's tenant is never touched.
 */
export function freeTenantName(
  name: string,
  id: string,
  existing: readonly { id: string; name?: string }[],
): string {
  const taken = new Set(
    existing
      .filter((e) => e.id !== id)
      .map((e) => (e.name ?? "").toLowerCase()),
  );
  if (!taken.has(name.toLowerCase())) return name;
  const base = `${name} (${id})`;
  for (let n = 1; ; n++) {
    const candidate = n === 1 ? base : `${base} ${n}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

/** True when a kit-owned user's roles or memberships no longer match seed-data. */
export function hasDrift(u: SeedUser, existing: ExistingUser): boolean {
  const have = (existing.userTenants ?? []).map((t) => ({
    tenantId: t.tenantId,
    roles: t.roleNames ?? [],
  }));
  if (membershipKey(wantedTenants(u, existing)) !== membershipKey(have))
    return true;
  if (u.tenants.length > 0) return false;
  const want = [...(u.roles ?? [])].sort().join();
  return want !== [...(existing.roleNames ?? [])].sort().join();
}

/**
 * Plan one persona user. Any matching user this checkout didn't create wins and is preserved, so
 * seed never touches a user someone else made with the same email.
 */
function userRow(
  kind: "users" | "demoUsers",
  persona: SeedUser,
  loginId: string,
  existing: ExistingUser[],
  owned: OwnershipLedger,
): PlanRow {
  const base = { kind, id: loginId, persona, loginId };
  const unowned = existing.find((e) => !owned.has(kind, e.userId));
  if (unowned)
    return {
      ...base,
      action: "preserve",
      userId: unowned.userId,
      reason: "Existing user not created by this checkout; never modified",
    };
  const mine = existing[0];
  if (!mine)
    return {
      ...base,
      action: "create",
      reason: "Create persona from seed-data",
    };
  if (hasDrift(persona, mine))
    return {
      ...base,
      action: "update",
      userId: mine.userId,
      tenants: wantedTenants(persona, mine),
      reason:
        "Owned user's roles differ from seed-data; patch roles in place (ID, sessions and other settings kept)",
    };
  return {
    ...base,
    action: "preserve",
    userId: mine.userId,
    reason: "Owned user matches seed-data",
  };
}

/**
 * Complete read-only inventory before any write. A failed read aborts the whole plan, so an outage
 * never looks like a missing resource. Nothing here writes to the project or the ledger.
 */
export async function seedPlan(
  descope: ReturnType<typeof createDescopeServer>,
  owned: OwnershipLedger,
  { force = false, demoEmail }: { force?: boolean; demoEmail?: string } = {},
): Promise<PlanRow[]> {
  const m = descope.client.management;
  const permissions =
    must(await m.permission.loadAll(), "permission.loadAll").data ?? [];
  const roles = (
    must(await m.role.loadAll(), "role.loadAll").data ?? []
  ).filter((r) => !r.tenantId); // Kit roles are project-level; ignore same-named tenant roles.
  const tenants =
    must(await m.tenant.searchAll(), "tenant.searchAll").data ?? [];
  const flows = must(await m.flow.list(), "flow.list").data?.flows ?? [];
  const rows: PlanRow[] = [];

  for (const p of PERMISSIONS) {
    const exists = permissions.some((e) => e.name === p.name);
    rows.push({
      kind: "permissions",
      id: p.name,
      action: exists ? "preserve" : "create",
      reason: exists ? "Existing permission retained" : "Additive baseline",
    });
  }

  for (const r of ROLES) {
    const existing = roles.find((e) => e.name === r.name);
    const missing = r.permissions.filter(
      (p) => !existing?.permissionNames?.includes(p),
    );
    const mine = owned.has("roles", r.name);
    rows.push({
      kind: "roles",
      id: r.name,
      action: !existing
        ? "create"
        : !missing.length
          ? "preserve"
          : mine
            ? "update"
            : "conflict",
      reason: !existing
        ? "Additive baseline"
        : !missing.length
          ? "Existing role retained; extra permissions are not removed"
          : mine
            ? `Owned role lacks ${missing.join(", ")}; update its permissions`
            : `Project already has a role "${r.name}" without ${missing.join(", ")}; rename it in scripts/seed-data.ts (and packages/contracts KIT_ROLES)`,
    });
  }

  for (const t of TENANTS) {
    const exists = tenants.some((e) => e.id === t.id);
    const name = exists ? undefined : freeTenantName(t.name, t.id, tenants);
    rows.push({
      kind: "tenants",
      id: t.id,
      name,
      action: exists ? "preserve" : "create",
      reason: exists
        ? owned.has("tenants", t.id)
          ? "Owned tenant retained"
          : "Existing tenant not created by seed; used as is"
        : name === t.name
          ? "Additive baseline"
          : `Additive baseline; "${t.name}" is taken by another tenant, so it is named "${name}"`,
    });
  }

  for (const t of SSO_TENANTS) {
    const exists = tenants.some((e) => e.id === t.id);
    // SSO is reconfigured only on tenants seed creates (or created earlier); configuring is idempotent.
    const mine = !exists || owned.has("tenants", t.id);
    rows.push({
      kind: "sso",
      id: t.id,
      action: mine ? (exists ? "update" : "create") : "preserve",
      reason: mine
        ? `SAML against mocksaml for @${t.sso.domain} (idempotent)`
        : "Tenant existed before seed; its SSO settings are not touched",
    });
  }

  for (const u of TEST_USERS)
    rows.push(
      userRow(
        "users",
        u,
        u.loginId,
        await findTestUsersByEmail(descope, u.loginId),
        owned,
      ),
    );
  if (demoEmail)
    for (const u of TEST_USERS) {
      const loginId = demoLoginId(u.loginId, demoEmail);
      rows.push(
        userRow(
          "demoUsers",
          u,
          loginId,
          await findRealUsersByEmail(descope, loginId),
          owned,
        ),
      );
    }

  // After user rows: guardian planning depends on whether each persona is created or owned.
  rows.push(...(await familyRows(descope, owned, rows, demoEmail)));

  for (const ff of readKitFlowFiles()) {
    const id = ff.flow.id;
    const exists = flows.some((e) => e.id === id);
    rows.push({
      kind: "flows",
      id,
      action: !exists
        ? "create"
        : force && owned.has("flows", id)
          ? "update"
          : "preserve",
      reason: !exists
        ? "Import kit flow"
        : !owned.has("flows", id)
          ? "Unowned flow: never overwritten"
          : force
            ? "KIT_FORCE_FLOWS=1 re-imports a recorded flow"
            : "Existing flow retained (KIT_FORCE_FLOWS=1 to re-import)",
    });
  }
  return rows;
}

/**
 * Family Accounts. Families and dependents are created by seed and recorded; an unowned family or
 * dependent with a kit ID is a conflict, never adopted. Guardians must be kit-owned users (or users
 * this plan creates), and may not already belong to another family: the project allows one each.
 */
async function familyRows(
  descope: ReturnType<typeof createDescopeServer>,
  owned: OwnershipLedger,
  userRows: readonly PlanRow[],
  demoEmail: string | undefined,
): Promise<PlanRow[]> {
  const m = descope.client.management;
  const settings = must(
    await m.family.getSettings(),
    "family.getSettings",
  ).data;
  const families = familiesFor(demoEmail);
  if (!settings?.enabled)
    return families.map((f) => ({
      kind: "families",
      id: f.id,
      action: "conflict",
      reason:
        "Family Accounts is not enabled in this project (Console → Users → Families)",
    }));
  const rows: PlanRow[] = [];

  const attributes =
    must(
      await m.user.getFamilyScopedCustomAttributes(),
      "user.getFamilyScopedCustomAttributes",
    ).data ?? [];
  for (const a of FAMILY_SCOPED_ATTRIBUTES) {
    const exists = attributes.some((e) => e.name === a.name);
    rows.push({
      kind: "familyAttributes",
      id: a.name,
      action: exists ? "preserve" : "create",
      reason: exists
        ? owned.has("familyAttributes", a.name)
          ? "Owned family-scoped attribute retained"
          : "Existing family-scoped attribute used as is"
        : "Additive baseline",
    });
  }

  const existingFamilies =
    must(
      await m.family.searchAll({ ids: families.map((f) => f.id) }),
      "family.searchAll",
    ).data ?? [];
  for (const f of families) {
    const exists = existingFamilies.some((e) => e.id === f.id);
    const mine = owned.has("families", f.id);
    rows.push({
      kind: "families",
      id: f.id,
      family: f,
      action: !exists ? "create" : mine ? "preserve" : "conflict",
      reason: !exists
        ? `Create "${f.name}"`
        : mine
          ? "Owned family retained"
          : `Project already has a family "${f.id}" this checkout didn't create; rename it in scripts/seed-data.ts`,
    });

    for (const d of f.dependents) {
      const loginId = dependentLoginId(f.id, d.key);
      const found =
        must(
          await m.user.search({
            loginIds: [loginId],
            withTestUser: true,
            limit: 2,
          }),
          `user.search(${loginId})`,
        ).data?.users ?? [];
      const user = found[0];
      rows.push({
        kind: "dependents",
        id: loginId,
        loginId,
        family: f,
        dependent: d,
        userId: user?.userId,
        action: !user
          ? "create"
          : owned.has("dependents", user.userId)
            ? "preserve"
            : "conflict",
        reason: !user
          ? `Dependent profile "${d.name}" (${d.relationship}), no login`
          : owned.has("dependents", user.userId)
            ? "Owned dependent retained"
            : `A user with login ID ${loginId} exists that this checkout didn't create`,
      });
    }

    for (const g of f.guardians) {
      // f.accounts says whether this family is made of test users or live demo users.
      const userRow = userRows.find(
        (r) => r.kind === f.accounts && r.loginId === g.loginId,
      );
      const base = {
        kind: "familyMembers" as const,
        id: `${f.id}/${g.loginId}`,
        loginId: g.loginId,
        family: f,
        relationship: g.relationship,
      };
      if (!userRow) {
        rows.push({
          ...base,
          action: "conflict",
          reason: `Guardian ${g.loginId} is not a seed persona`,
        });
        continue;
      }
      if (userRow.action === "create") {
        rows.push({
          ...base,
          action: "create",
          reason: `Add as guardian (${FAMILY_ROLE}, ${g.relationship}) once created`,
        });
        continue;
      }
      if (!userRow.userId || !owned.has(f.accounts, userRow.userId)) {
        rows.push({
          ...base,
          action: "preserve",
          reason: `Guardian ${g.loginId} wasn't created by this checkout, so seed won't add it to the family (add it in the console)`,
        });
        continue;
      }
      const user = must(
        await m.user.loadByUserId(userRow.userId),
        `user.loadByUserId(${g.loginId})`,
      ).data;
      const have = user?.userFamilies ?? [];
      const here = have.find((uf) => uf.familyId === f.id);
      const elsewhere = have.filter((uf) => uf.familyId !== f.id);
      const roleOk = here?.roleNames?.includes(FAMILY_ROLE);
      const attrOk =
        here?.familyScopedAttributes?.relationship === g.relationship;
      rows.push({
        ...base,
        userId: userRow.userId,
        action:
          elsewhere.length && !settings.allowMultipleFamiliesUsers
            ? "conflict"
            : here && roleOk && attrOk
              ? "preserve"
              : "update",
        reason:
          elsewhere.length && !settings.allowMultipleFamiliesUsers
            ? `Already in family ${elsewhere.map((e) => e.familyId).join(", ")}; the project allows one family per user`
            : here && roleOk && attrOk
              ? "Guardian membership matches seed-data"
              : `Add as guardian (${FAMILY_ROLE}, ${g.relationship})`,
      });
    }
  }
  return rows;
}
