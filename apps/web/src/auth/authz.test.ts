import { describe, expect, it } from "vitest";
import { authzFromClaims, decodeJwtPayload } from "./authz";

const claims = {
  sub: "U1",
  roles: ["admin"],
  permissions: ["items:write"],
  tenants: {
    acme: { roles: ["admin"], permissions: ["tenant:manage"] },
    globex: { roles: ["member"] },
  },
  dct: "acme",
  su: true,
};

describe("authzFromClaims", () => {
  it("reads project-level and tenant-level roles/permissions", () => {
    const a = authzFromClaims(claims);
    expect(a.hasRole("admin")).toBe(true);
    expect(a.hasRole("admin", "acme")).toBe(true);
    expect(a.hasRole("admin", "globex")).toBe(false);
    expect(a.hasPermission("tenant:manage", "acme")).toBe(true);
    expect(a.hasPermission("tenant:manage", "globex")).toBe(false);
    expect(a.tenants.globex?.permissions).toEqual([]);
  });
  it("exposes current tenant and step-up", () => {
    const a = authzFromClaims(claims);
    expect(a.currentTenant).toBe("acme");
    expect(a.isSteppedUp).toBe(true);
  });
  it("reads the Family Accounts claim like tenants", () => {
    const a = authzFromClaims({
      sub: "U1",
      families: {
        "guest-family": {
          roles: ["Family Admin"],
          permissions: ["Family Impersonate Dependents"],
        },
      },
    });
    expect(a.userId).toBe("U1");
    expect(a.families["guest-family"]?.roles).toEqual(["Family Admin"]);
    expect(authzFromClaims(undefined).families).toEqual({});
  });
  it("is safe on empty claims", () => {
    const a = authzFromClaims(undefined);
    expect(a.roles).toEqual([]);
    expect(a.hasRole("x")).toBe(false);
    expect(a.isSteppedUp).toBe(false);
  });
});

describe("decodeJwtPayload", () => {
  it("decodes a base64url payload", () => {
    const payload = Buffer.from(
      JSON.stringify({ sub: "U1", tenants: { acme: { roles: ["r"] } } }),
    ).toString("base64url");
    expect(decodeJwtPayload(`h.${payload}.s`)).toMatchObject({ sub: "U1" });
  });
  it("returns {} on garbage or empty", () => {
    expect(decodeJwtPayload("")).toEqual({});
    expect(decodeJwtPayload("not.a.jwt")).toEqual({});
    expect(decodeJwtPayload(undefined)).toEqual({});
  });
});
