import { KIT_PERMISSIONS, KIT_ROLES } from "@kit/contracts";
import { expect, it } from "vitest";
import {
  demoLoginId,
  dependentLoginId,
  FAMILY_ROLE,
  familiesFor,
  ROLES,
  SSO_TENANTS,
  TEST_USERS,
} from "../../../scripts/seed-data";

it("seed-data roles match the contracts the API guards on", () => {
  const cs = ROLES.find((r) => r.name === KIT_ROLES.customerService);
  expect(cs?.permissions).toEqual(
    expect.arrayContaining([
      KIT_PERMISSIONS.userAdmin,
      KIT_PERMISSIONS.impersonate,
    ]),
  );
  const guardian = ROLES.find((r) => r.name === KIT_ROLES.familyAdmin);
  expect(guardian?.permissions).toContain(
    KIT_PERMISSIONS.familyImpersonateDependents,
  );
  expect(FAMILY_ROLE).toBe(KIT_ROLES.familyAdmin);
});

it("every family guardian is a seed persona, and dependents have unique login IDs", () => {
  const families = familiesFor("se@example.net");
  const test = families.find((f) => f.accounts === "users");
  for (const g of test?.guardians ?? [])
    expect(TEST_USERS.map((u) => u.loginId)).toContain(g.loginId);
  const dependents = families.flatMap((f) =>
    f.dependents.map((d) => dependentLoginId(f.id, d.key)),
  );
  expect(new Set(dependents).size).toBe(dependents.length);
  for (const id of dependents) expect(id).not.toContain("@");
});

it("demo logins plus-address the presenter's email with the persona", () => {
  expect(demoLoginId("admin@example.com", "Pat.Presenter@example.net")).toBe(
    "pat.presenter+admin@example.net",
  );
  expect(demoLoginId("member@example.com", "se+acme@example.net")).toBe(
    "se+acme-member@example.net",
  );
  expect(() => demoLoginId("admin@example.com", "not-an-email")).toThrow();
});

it("every persona gets a distinct demo login", () => {
  const ids = TEST_USERS.map((u) => demoLoginId(u.loginId, "se@example.net"));
  expect(new Set(ids).size).toBe(ids.length);
});

it("SSO tenants hold no test users and don't share a domain", () => {
  const ssoIds = new Set(SSO_TENANTS.map((t) => t.id));
  for (const u of TEST_USERS)
    for (const t of u.tenants) expect(ssoIds.has(t.tenantId)).toBe(false);
  const domains = SSO_TENANTS.map((t) => t.sso.domain);
  expect(new Set(domains).size).toBe(domains.length);
  // Test users must not be on an SSO domain, or the flow would route them to the IdP.
  for (const u of TEST_USERS)
    expect(domains).not.toContain(u.loginId.split("@")[1]);
});
