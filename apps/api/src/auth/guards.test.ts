import type { AddressInfo } from "node:net";
import {
  type AuthenticationInfo,
  createDescopeServer,
} from "@kit/descope/server";
import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  requirePermissions,
  requireStepUp,
  requireTenantPermissions,
} from "./guards";
import { requireAuth } from "./middleware";

/** Real facade (pure claim checks) with only the network call replaced. Token string = which fake user. */
const users: Record<string, AuthenticationInfo> = {
  agent: {
    jwt: "agent",
    token: { sub: "U-agent", permissions: ["User Admin", "Impersonate"] },
  },
  admin: {
    jwt: "admin",
    token: {
      sub: "U-admin",
      tenants: { acme: { roles: ["admin"], permissions: ["tenant:manage"] } },
    },
  },
  steppedUp: { jwt: "steppedUp", token: { sub: "U-su", su: true } },
  plain: { jwt: "plain", token: { sub: "U-plain" } },
};
const real = createDescopeServer({ projectId: "P2test" });
const descope = {
  ...real,
  validateSession: async (token: string) => {
    const u = users[token];
    if (!u) throw new Error("invalid");
    return u;
  },
};

const app = express();
app.use(requireAuth(descope));
app.get("/perm", requirePermissions(descope, ["Impersonate"]), (_q, r) =>
  r.json({ ok: true }),
);
app.get(
  "/t/:tenantId",
  requireTenantPermissions(descope, ["tenant:manage"]),
  (_q, r) => r.json({ ok: true }),
);
app.get("/su", requireStepUp(descope), (_q, r) => r.json({ ok: true }));

let base = "";
let server: ReturnType<typeof app.listen>;
beforeAll(async () => {
  await new Promise<void>((r) => {
    server = app.listen(0, () => {
      base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      r();
    });
  });
});
afterAll(() => server.close());

const as = (who: string) => ({ headers: { authorization: `Bearer ${who}` } });
const json = async (res: Response) =>
  (await res.json()) as Record<string, unknown>;

describe("guards", () => {
  it("401 without a session", async () => {
    expect((await fetch(`${base}/perm`)).status).toBe(401);
  });
  it("project-level permission: 200 where held, 403 where not", async () => {
    expect((await fetch(`${base}/perm`, as("agent"))).status).toBe(200);
    const res = await fetch(`${base}/perm`, as("plain"));
    expect(res.status).toBe(403);
    expect((await json(res)).message).toMatch(/Impersonate/);
  });
  it.each(["constructor", "__proto__", "toString"])(
    "tenant guard rejects inherited tenant key %s",
    async (id) => {
      expect((await fetch(`${base}/t/${id}`, as("plain"))).status).toBe(403);
    },
  );
  it("tenant permission: 200 in the tenant, 403 elsewhere", async () => {
    expect((await fetch(`${base}/t/acme`, as("admin"))).status).toBe(200);
    expect((await fetch(`${base}/t/globex`, as("admin"))).status).toBe(403);
  });
  it("step-up: 403 step_up_required without su, 200 with it", async () => {
    const res = await fetch(`${base}/su`, as("plain"));
    expect(res.status).toBe(403);
    expect((await json(res)).error).toBe("step_up_required");
    expect((await fetch(`${base}/su`, as("steppedUp"))).status).toBe(200);
  });
});
