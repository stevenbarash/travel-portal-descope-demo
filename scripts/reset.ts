import { managementClient, must } from "./lib/descope";
import { resetFga } from "./lib/fga";
import { resetFlows } from "./lib/flows";
import { ownershipLedger } from "./lib/ownership";
import { SSO_TENANTS } from "./seed-data";

/**
 * `npm run reset`: delete only resources recorded by this checkout's seed, in the current project.
 * Anything not in the ownership ledger (other checkouts, hand-made config) is left alone.
 */
const { descope, env } = managementClient();
const owned = ownershipLedger(env.repoRoot, env.projectId);
const m = descope.client.management;

// Order is the reverse of seed: FGA first, then entities that reference users, then users,
// tenants, roles and permissions (roles reference permissions), and flows last.
await resetFga(descope, owned);
// Dependents and families before users: a family outlives its guardians otherwise.
for (const id of owned.ids("dependents")) {
  await owned.remove("dependents", id, async () =>
    must(await m.family.deleteDependent(id), `family.deleteDependent(${id})`),
  );
  console.log(`deleted owned dependent: ${id}`);
}
for (const id of owned.ids("families")) {
  await owned.remove("families", id, async () =>
    must(await m.family.delete(id), `family.delete(${id})`),
  );
  console.log(`deleted owned family: ${id}`);
}
for (const name of owned.ids("familyAttributes")) {
  await owned.remove("familyAttributes", name, async () =>
    must(
      await m.user.deleteFamilyScopedCustomAttributes([name]),
      `user.deleteFamilyScopedCustomAttributes(${name})`,
    ),
  );
  console.log(`deleted owned family-scoped attribute: ${name}`);
}
for (const id of owned.ids("users")) {
  // Guard against a corrupted ledger deleting a real user.
  const user = must(await m.user.load(id), `user.load(${id})`).data;
  if (user?.test !== true)
    throw new Error(`Refusing to delete non-test user ${id}`);
  await owned.remove("users", id, async () =>
    must(await m.user.delete(id), `user.delete(${id})`),
  );
  console.log(`deleted owned test user: ${id}`);
}
for (const id of owned.ids("demoUsers")) {
  const user = must(await m.user.load(id), `user.load(${id})`).data;
  if (user && user.test === true)
    throw new Error(`Refusing to delete test user ${id} as a demo user`);
  // A demo user may already be gone (deleted in the console); still drop it from the ledger.
  await owned.remove("demoUsers", id, async () => {
    if (user) must(await m.user.delete(id), `user.delete(${id})`);
  });
  console.log(`deleted owned demo user: ${id}`);
}
// Users that signed in through mocksaml were created (JIT) in a tenant this checkout owns. Delete
// only those whose sole tenant is that one and whose email is on its SSO domain.
for (const t of SSO_TENANTS) {
  if (!owned.has("tenants", t.id)) continue;
  // Positional args: tenantIds, roles, limit, page, testUsersOnly=false, withTestUser=false.
  const res = await m.user.searchAll(
    [t.id],
    undefined,
    undefined,
    undefined,
    false,
    false,
  );
  for (const u of must(res, `user.searchAll(tenant=${t.id})`).data ?? []) {
    const onlyHere = (u.userTenants ?? []).every((ut) => ut.tenantId === t.id);
    if (
      u.test ||
      !onlyHere ||
      !u.email?.toLowerCase().endsWith(`@${t.sso.domain}`)
    )
      continue;
    must(await m.user.delete(u.userId), `user.delete(${u.userId})`);
    console.log(`deleted SSO user in owned tenant ${t.id}: ${u.email}`);
  }
}
for (const id of owned.ids("tenants")) {
  await owned.remove("tenants", id, async () =>
    must(await m.tenant.delete(id), `tenant.delete(${id})`),
  );
  console.log(`deleted owned tenant: ${id}`);
}
for (const name of owned.ids("roles")) {
  await owned.remove("roles", name, async () =>
    must(await m.role.delete(name), `role.delete(${name})`),
  );
  console.log(`deleted owned role: ${name}`);
}
for (const name of owned.ids("permissions")) {
  await owned.remove("permissions", name, async () =>
    must(await m.permission.delete(name), `permission.delete(${name})`),
  );
  console.log(`deleted owned permission: ${name}`);
}
await resetFlows(descope, owned);
console.log("reset complete (unrecorded resources preserved)");
