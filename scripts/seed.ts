import { managementClient, must } from "./lib/descope";
import { type FgaRelation, seedFga } from "./lib/fga";
import { seedFlows } from "./lib/flows";
import { ownershipLedger } from "./lib/ownership";
import { type PlanRow, seedPlan } from "./lib/seed-plan";
import {
  FAMILY_ROLE,
  FAMILY_SCOPED_ATTRIBUTES,
  FGA_RELATIONS,
  MOCKSAML_ATTRIBUTES,
  MOCKSAML_METADATA_URL,
  PERMISSIONS,
  ROLES,
  type SeedTenantMembership,
  type SeedUser,
  SSO_TENANTS,
  TENANTS,
  TEST_USERS,
} from "./seed-data";

/**
 * Plans every change from a read-only inventory, then applies it: creates what is missing,
 * never touches unowned resources, and keeps existing users (IDs, sessions, assignments). A
 * kit-owned user whose roles no longer match seed-data is patched in place, not recreated.
 * `pnpm seed:plan` prints the plan and stops.
 */
const { descope, env } = managementClient();
const force = process.env.KIT_FORCE_FLOWS === "1";
const plan = await seedPlan(
  descope,
  ownershipLedger(env.repoRoot, env.projectId, true),
  { force, demoEmail: env.demoEmail },
);
for (const row of plan)
  console.log(`${row.action}: ${row.kind}/${row.id} — ${row.reason}`);
if (!env.demoEmail)
  console.log(
    "note: DEMO_EMAIL is not set in .env; no plus-addressed demo users planned",
  );
if (plan.some((row) => row.action === "conflict"))
  throw new Error("Seed plan has conflicts; no project writes performed");
if (process.argv.includes("--plan")) process.exit(0);

const owned = ownershipLedger(env.repoRoot, env.projectId);
const m = descope.client.management;
const rowFor = (kind: PlanRow["kind"], id: string) =>
  plan.find((row) => row.kind === kind && row.id === id);

for (const p of PERMISSIONS) {
  if (rowFor("permissions", p.name)?.action !== "create") continue;
  must(
    await m.permission.create(p.name, p.description),
    `permission.create(${p.name})`,
  );
  owned.record("permissions", p.name);
  console.log(`created permission: ${p.name}`);
}

for (const r of ROLES) {
  const action = rowFor("roles", r.name)?.action;
  if (action === "create") {
    must(
      await m.role.create(r.name, r.description, [...r.permissions]),
      `role.create(${r.name})`,
    );
    owned.record("roles", r.name);
    console.log(`created role: ${r.name}`);
  } else if (action === "update") {
    must(
      await m.role.update(r.name, r.name, r.description, [...r.permissions]),
      `role.update(${r.name})`,
    );
    console.log(`updated owned role permissions: ${r.name}`);
  }
}

for (const t of TENANTS) {
  const row = rowFor("tenants", t.id);
  if (row?.action !== "create") continue;
  const name = row.name ?? t.name;
  must(await m.tenant.createWithId(t.id, name), `tenant.createWithId(${t.id})`);
  owned.record("tenants", t.id);
  console.log(`created tenant: ${t.id} (${name})`);
}

for (const t of SSO_TENANTS) {
  if (rowFor("sso", t.id)?.action === "preserve") continue;
  const res = await m.sso.configureSAMLByMetadata(
    t.id,
    {
      idpMetadataUrl: MOCKSAML_METADATA_URL,
      attributeMapping: { ...MOCKSAML_ATTRIBUTES },
      defaultSSORoles: [...t.sso.defaultRoles],
    },
    undefined,
    [t.sso.domain],
  );
  if (!res.ok) {
    // Most often the domain already routes to another tenant's SSO in this project.
    console.warn(
      `warning: SSO on ${t.id} (@${t.sso.domain}) not configured: ${res.error?.errorCode} ${res.error?.errorDescription ?? ""}`,
    );
    continue;
  }
  console.log(`configured SSO: ${t.id} → mocksaml (@${t.sso.domain})`);
}

const personaOptions = (
  u: SeedUser,
  email: string,
  tenants: readonly SeedTenantMembership[],
) => ({
  email,
  displayName: u.displayName,
  verifiedEmail: true,
  // Project-level roles for consumer accounts; tenant roles otherwise.
  roles: tenants.length === 0 && u.roles ? [...u.roles] : undefined,
  userTenants: tenants.map((t) => ({
    tenantId: t.tenantId,
    roleNames: [...t.roles],
  })),
});

/**
 * Create a user with the persona's roles. Projects with "tenant user isolation" allow one tenant
 * per user, so on E061015 retry with the first tenant only.
 */
async function createPersonaUser(
  u: SeedUser,
  create: (
    tenants: readonly SeedTenantMembership[],
  ) => ReturnType<typeof m.user.create>,
) {
  let res = await create(u.tenants);
  const first = u.tenants[0];
  if (
    !res.ok &&
    res.error?.errorCode === "E061015" &&
    first &&
    u.tenants.length > 1
  ) {
    console.warn(
      `note: tenant user isolation is enabled in this project; ${u.loginId} gets only ${first.tenantId}`,
    );
    res = await create([first]);
  }
  return res;
}

/** loginId → userId of every seeded (or preserved) test user, for FGA relations. */
const userIds = new Map<string, string>();
for (const row of plan) {
  if (row.kind !== "users" && row.kind !== "demoUsers") continue;
  const { persona: u, loginId } = row;
  if (!u || !loginId) continue;
  const label = row.kind === "users" ? "test user" : "demo user";
  if (row.action === "create") {
    const res = await createPersonaUser(u, (tenants) =>
      row.kind === "users"
        ? m.user.createTestUser(loginId, personaOptions(u, loginId, tenants))
        : // A real user: gets real mail, never used by e2e.
          m.user.create(loginId, personaOptions(u, loginId, tenants)),
    );
    must(res, `create ${label} ${loginId}`);
    if (!res.data?.userId)
      throw new Error(`Created ${label} response is missing userId`);
    owned.record(row.kind, res.data.userId);
    if (row.kind === "users") userIds.set(u.loginId, res.data.userId);
    console.log(`created ${label}: ${loginId}`);
    continue;
  }
  if (row.kind === "users" && row.userId) userIds.set(u.loginId, row.userId);
  if (row.action === "update" && row.userId && row.tenants) {
    const { roles, userTenants } = personaOptions(u, loginId, row.tenants);
    must(
      await m.user.patch(row.userId, {
        ...(row.tenants.length === 0 ? { roles: roles ?? [] } : {}),
        userTenants,
      }),
      `user.patch(${loginId})`,
    );
    console.log(`updated ${label} roles: ${loginId}`);
  }
}

// ---- Family Accounts: attribute, families, dependents, then guardians ----
for (const a of FAMILY_SCOPED_ATTRIBUTES) {
  if (rowFor("familyAttributes", a.name)?.action !== "create") continue;
  must(
    await m.user.createFamilyScopedCustomAttributes([{ ...a }]),
    `user.createFamilyScopedCustomAttributes(${a.name})`,
  );
  owned.record("familyAttributes", a.name);
  console.log(`created family-scoped attribute: ${a.name}`);
}
for (const row of plan) {
  if (row.kind !== "families" || row.action !== "create" || !row.family)
    continue;
  must(
    await m.family.createWithId(row.family.id, row.family.name),
    `family.createWithId(${row.family.id})`,
  );
  owned.record("families", row.family.id);
  console.log(`created family: ${row.family.id} (${row.family.name})`);
}
for (const row of plan) {
  if (row.kind !== "dependents" || row.action !== "create") continue;
  const { family, dependent: d, loginId } = row;
  if (!family || !d || !loginId) continue;
  const res = must(
    await m.family.createDependent(family.id, {
      loginId,
      name: d.name,
      familyScopedAttributes: { relationship: d.relationship },
    }),
    `family.createDependent(${loginId})`,
  );
  if (!res.data?.userId)
    throw new Error("Created dependent response is missing userId");
  owned.record("dependents", res.data.userId);
  console.log(`created dependent: ${loginId} (${d.name}) in ${family.id}`);
}
for (const row of plan) {
  if (row.kind !== "familyMembers") continue;
  if (row.action !== "create" && row.action !== "update") continue;
  const { family, loginId, relationship } = row;
  if (!family || !loginId) continue;
  must(
    await m.user.addFamilies(loginId, [
      {
        familyId: family.id,
        roleNames: [FAMILY_ROLE],
        familyScopedAttributes: relationship ? { relationship } : undefined,
      },
    ]),
    `user.addFamilies(${loginId})`,
  );
  console.log(`added guardian: ${loginId} → ${family.id}`);
}

await seedFga(descope, owned, [
  ...FGA_RELATIONS,
  ...TEST_USERS.flatMap((u): FgaRelation[] => {
    const id = userIds.get(u.loginId);
    return id
      ? (u.relations ?? []).map((r) => ({
          ...r,
          targetType: "user",
          target: id,
        }))
      : [];
  }),
]);

await seedFlows(descope, owned, force);

console.log("seed complete");
