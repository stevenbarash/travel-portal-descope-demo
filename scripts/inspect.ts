import { managementClient } from "./lib/descope";

/** Print what exists in the project named by .env (no secrets). Useful before seeding or demoing. */
const { descope } = managementClient();
const m = descope.client.management;

const [flows, tenants, roles, perms, familySettings, families] =
  await Promise.all([
    m.flow.list(),
    m.tenant.loadAll(),
    m.role.loadAll(),
    m.permission.loadAll(),
    m.family.getSettings(),
    m.family.searchAll({ size: 50 }),
  ]);

console.log(
  "flows:",
  flows.ok
    ? (flows.data?.flows ?? []).map((f) => f.id).join(", ")
    : flows.error?.errorDescription,
);
console.log(
  "tenants:",
  tenants.ok
    ? (tenants.data ?? []).map((t) => `${t.id} (${t.name})`).join(", ") ||
        "(none)"
    : tenants.error?.errorDescription,
);
console.log(
  "roles:",
  roles.ok
    ? (roles.data ?? [])
        .map((r) => `${r.name}[${(r.permissionNames ?? []).join(",")}]`)
        .join(", ") || "(none)"
    : roles.error?.errorDescription,
);
console.log(
  "permissions:",
  perms.ok
    ? (perms.data ?? []).map((p) => p.name).join(", ") || "(none)"
    : perms.error?.errorDescription,
);
console.log(
  "family accounts:",
  familySettings.ok
    ? JSON.stringify(familySettings.data ?? {})
    : familySettings.error?.errorDescription,
);
console.log(
  "families:",
  families.ok
    ? (families.data ?? []).map((f) => `${f.id} (${f.name})`).join(", ") ||
        "(none)"
    : families.error?.errorDescription,
);
