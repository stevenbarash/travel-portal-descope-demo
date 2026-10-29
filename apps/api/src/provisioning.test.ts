import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { TEST_USERS } from "../../../scripts/seed-data";

const state = vi.hoisted(() => ({
  root: "",
  management: {} as Record<string, unknown>,
}));
vi.mock("../../../scripts/lib/descope", async (original) => ({
  ...(await original<typeof import("../../../scripts/lib/descope")>()),
  managementClient: () => ({
    env: {
      repoRoot: state.root,
      projectId: "P2test",
      demoEmail: "se@example.net",
    },
    descope: { client: { management: state.management } },
  }),
}));

it("seed then reset preserves existing project resources and removes only new ones", async () => {
  state.root = mkdtempSync(join(tmpdir(), "kit-provisioning-"));
  // The customer's project as it was before this repo: their own role, built-in permissions, their
  // own flow. Seed must reuse all of it and reset must leave all of it.
  const tenants = new Set<string>();
  const roles = new Map([["Customer Service", ["User Admin", "Impersonate"]]]);
  const permissions = new Map([
    ["User Admin", [] as string[]],
    ["Impersonate", [] as string[]],
  ]);
  const flows = new Set(["tp-sign-up-or-in"]);
  // Family Accounts is on; nothing family-shaped exists yet.
  const families = new Set<string>();
  const dependents = new Map<string, string>();
  const familyAttributes = new Set<string>();
  const memberships = new Map<string, { familyId: string }[]>();
  type U = {
    userId: string;
    email: string;
    test: boolean;
    roleNames?: string[];
    userTenants?: { tenantId: string; roleNames?: string[] }[];
    ssoAppIds?: string[];
  };
  type Options = {
    roles?: string[];
    userTenants?: { tenantId: string; roleNames: string[] }[];
  };
  const make = (userId: string, email: string, test: boolean, o: Options) => {
    const user: U = {
      userId,
      email,
      test,
      roleNames: o.roles ?? [],
      userTenants: o.userTenants,
    };
    users.set(userId, user);
    return ok(user);
  };
  const patched: string[] = [];
  const patchOptions: Options[] = [];
  const users = new Map<string, U>([
    [
      "existing",
      { userId: "existing", email: "guest@example.com", test: true },
    ],
    [
      "ordinary",
      { userId: "ordinary", email: "someone@example.com", test: false },
    ],
  ]);
  const sso = new Map<string, string[]>();
  const ok = (data: unknown = undefined) => ({ ok: true, data });
  const catalog = (values: Map<string, string[]>) => ({
    loadAll: async () =>
      ok(
        [...values].map(([name, permissionNames]) => ({
          name,
          permissionNames,
        })),
      ),
    create: async (name: string, _description: string, perms?: string[]) => {
      values.set(name, perms ?? []);
      return ok();
    },
    update: async (
      name: string,
      _newName: string,
      _description: string,
      perms: string[],
    ) => {
      values.set(name, perms);
      return ok();
    },
    delete: async (name: string) => {
      values.delete(name);
      return ok();
    },
  });
  state.management = {
    permission: catalog(permissions),
    role: catalog(roles),
    tenant: {
      searchAll: async () => ok([...tenants].map((id) => ({ id }))),
      createWithId: async (id: string) => {
        tenants.add(id);
        return ok();
      },
      delete: async (id: string) => {
        tenants.delete(id);
        return ok();
      },
    },
    sso: {
      configureSAMLByMetadata: async (
        tenantId: string,
        _settings: unknown,
        _redirect: unknown,
        domains: string[],
      ) => {
        sso.set(tenantId, domains);
        return ok();
      },
    },
    family: {
      getSettings: async () =>
        ok({ enabled: true, allowMultipleFamiliesUsers: false }),
      searchAll: async ({ ids }: { ids?: string[] }) =>
        ok(
          [...families]
            .filter((id) => !ids || ids.includes(id))
            .map((id) => ({ id })),
        ),
      createWithId: async (id: string) => {
        families.add(id);
        return ok({ id });
      },
      delete: async (id: string) => {
        families.delete(id);
        return ok();
      },
      createDependent: async (familyId: string, o: { loginId: string }) => {
        const userId = `dep:${o.loginId}`;
        dependents.set(userId, familyId);
        return ok({ userId });
      },
      deleteDependent: async (userId: string) => {
        dependents.delete(userId);
        return ok();
      },
    },
    user: {
      getFamilyScopedCustomAttributes: async () =>
        ok([...familyAttributes].map((name) => ({ name }))),
      createFamilyScopedCustomAttributes: async (a: { name: string }[]) => {
        for (const x of a) familyAttributes.add(x.name);
        return ok();
      },
      deleteFamilyScopedCustomAttributes: async (names: string[]) => {
        for (const n of names) familyAttributes.delete(n);
        return ok();
      },
      search: async ({ loginIds }: { loginIds?: string[] }) =>
        ok({
          users: [...dependents.keys()]
            .filter((id) => loginIds?.includes(id.slice("dep:".length)))
            .map((userId) => ({ userId })),
        }),
      loadByUserId: async (id: string) =>
        ok({ ...users.get(id), userFamilies: memberships.get(id) ?? [] }),
      addFamilies: async (loginId: string, a: { familyId: string }[]) => {
        const id = [...users.values()].find((u) => u.email === loginId)?.userId;
        if (id) memberships.set(id, [...(memberships.get(id) ?? []), ...a]);
        return ok();
      },
      searchAll: async (
        tenantIds: string[] | undefined,
        _roles: unknown,
        _limit: unknown,
        _page: unknown,
        testOnly: boolean,
        withTest: boolean,
        _custom: unknown,
        _statuses: unknown,
        emails?: string[],
      ) =>
        ok(
          [...users.values()].filter(
            (u) =>
              (!emails || emails.includes(u.email)) &&
              (!tenantIds ||
                u.userTenants?.some((t) => tenantIds.includes(t.tenantId))) &&
              (testOnly ? u.test : withTest || !u.test),
          ),
        ),
      createTestUser: async (email: string, o: Options) =>
        make(email, email, true, o),
      create: async (email: string, o: Options) =>
        make(`real:${email}`, email, false, o),
      patch: async (id: string, o: Options) => {
        const user = users.get(id);
        if (!user) return { ok: false };
        user.roleNames = o.roles ?? user.roleNames;
        user.userTenants = o.userTenants ?? user.userTenants;
        patched.push(id);
        patchOptions.push(o);
        return ok(user);
      },
      load: async (id: string) => ok(users.get(id)),
      delete: async (id: string) => {
        users.delete(id);
        return ok();
      },
    },
    flow: {
      list: async () => ok({ flows: [...flows].map((id) => ({ id })) }),
      import: async (id: string) => {
        flows.add(id);
        return ok();
      },
      delete: async (ids: string[]) => {
        for (const id of ids) flows.delete(id);
        return ok();
      },
    },
  };
  try {
    await import("../../../scripts/seed");
    // The two users already there, the test users seed created (guest was preserved), and one
    // real demo user per persona.
    const seeded = 2 + (TEST_USERS.length - 1) + TEST_USERS.length;
    expect(users.size).toBe(seeded);
    expect(users.has("real:se+agent@example.net")).toBe(true);
    expect(users.get("agent@example.com")?.roleNames).toEqual([
      "Customer Service",
    ]);
    // The existing role and permissions were reused untouched; the family role was added.
    expect([...roles]).toEqual([
      ["Customer Service", ["User Admin", "Impersonate"]],
      ["Family Admin", ["Family Impersonate Dependents"]],
    ]);
    expect([...permissions.keys()]).toEqual([
      "User Admin",
      "Impersonate",
      "Family Impersonate Dependents",
    ]);
    // A family per account set (test personas, live demo logins), each with its dependents.
    expect([...families]).toEqual(["guest-family", "guest-family-demo"]);
    expect(dependents.size).toBe(6);
    expect([...familyAttributes]).toEqual(["relationship"]);
    // The pre-existing, unowned guest isn't added; the partner seed created is.
    expect(memberships.has("existing")).toBe(false);
    expect(memberships.get("partner@example.com")).toEqual([
      expect.objectContaining({ familyId: "guest-family" }),
    ]);

    // Repeated seed keeps users as they are: same object, later settings intact, nothing patched.
    const agent = users.get("agent@example.com");
    Object.assign(agent ?? {}, { ssoAppIds: ["customer-app"] });
    vi.resetModules();
    await import("../../../scripts/seed");
    expect(users.get("agent@example.com")).toBe(agent);
    expect(agent?.ssoAppIds).toEqual(["customer-app"]);
    expect(users.size).toBe(seeded);
    expect(patched).toEqual([]);

    // An owned user whose roles drifted from seed-data is patched in place, not recreated.
    Object.assign(agent ?? {}, { roleNames: [] });
    vi.resetModules();
    await import("../../../scripts/seed");
    expect(patched).toEqual(["agent@example.com"]);
    expect(patchOptions[0]?.roles).toEqual(["Customer Service"]);
    expect(users.get("agent@example.com")).toBe(agent);
    expect(agent?.ssoAppIds).toEqual(["customer-app"]);

    await import("../../../scripts/reset");
    expect(families.size).toBe(0);
    expect(dependents.size).toBe(0);
    expect(familyAttributes.size).toBe(0);
    expect([...roles.keys()]).toEqual(["Customer Service"]);
    expect([...permissions.keys()]).toEqual(["User Admin", "Impersonate"]);
    expect([...flows]).toEqual(["tp-sign-up-or-in"]);
    expect([...users.keys()]).toEqual(["existing", "ordinary"]);

    // An inventory outage must not look like an empty project: seed aborts before any write.
    const tenantOps = state.management.tenant as {
      searchAll: () => Promise<unknown>;
    };
    const searchAll = tenantOps.searchAll;
    tenantOps.searchAll = async () => ({
      ok: false,
      error: { errorCode: "offline", errorDescription: "Unavailable" },
    });
    vi.resetModules();
    await expect(import("../../../scripts/seed")).rejects.toThrow(
      "tenant.searchAll failed",
    );
    tenantOps.searchAll = searchAll;
    expect([...users.keys()]).toEqual(["existing", "ordinary"]);

    // A project role with the kit's name but not its permissions blocks every write.
    roles.set("Customer Service", []);
    vi.resetModules();
    await expect(import("../../../scripts/seed")).rejects.toThrow(
      "Seed plan has conflicts",
    );
    expect([...users.keys()]).toEqual(["existing", "ordinary"]);
  } finally {
    rmSync(state.root, { recursive: true, force: true });
  }
});
