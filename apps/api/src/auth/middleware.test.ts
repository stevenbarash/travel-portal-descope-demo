import type { AddressInfo } from "node:net";
import { WhoAmI } from "@kit/contracts";
import type { AuthenticationInfo, DescopeServer } from "@kit/descope/server";
import { toClaims } from "@kit/descope/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { parseEnv } from "../env";
import { InMemoryBookingsRepo } from "../features/bookings/repo";

const GOOD = "good-token";
const fakeAuth: AuthenticationInfo = {
  jwt: GOOD,
  token: {
    sub: "U123",
    iss: "P2test",
    exp: 1_900_000_000,
    iat: 1_800_000_000,
    roles: ["admin"],
    permissions: ["items:write"],
    tenants: { T1: { roles: ["member"] } },
    dct: "T1",
    plan: "pro",
  },
};

const fakeDescope = {
  cookieNames: { session: "DS", refresh: "DSR" },
  async validateSession(token: string) {
    if (token === GOOD) return fakeAuth;
    throw new Error("invalid");
  },
  toClaims,
} as unknown as DescopeServer;

const app = createApp(parseEnv({ DESCOPE_PROJECT_ID: "P2test" }), {
  descope: fakeDescope,
  bookings: new InMemoryBookingsRepo(),
});
let baseUrl = "";
let server: ReturnType<typeof app.listen>;

beforeAll(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      resolve();
    });
  });
});
afterAll(() => server.close());

describe("requireAuth", () => {
  it("401 without a token", async () => {
    const res = await fetch(`${baseUrl}/api/whoami`);
    expect(res.status).toBe(401);
    expect(((await res.json()) as { error: string }).error).toBe(
      "unauthenticated",
    );
  });
  it("401 with an invalid bearer token", async () => {
    const res = await fetch(`${baseUrl}/api/whoami`, {
      headers: { authorization: "Bearer nope" },
    });
    expect(res.status).toBe(401);
  });
  it("200 with a valid bearer token, returning WhoAmI", async () => {
    const res = await fetch(`${baseUrl}/api/whoami`, {
      headers: { authorization: `Bearer ${GOOD}` },
    });
    expect(res.status).toBe(200);
    const body = WhoAmI.parse(await res.json());
    expect(body.userId).toBe("U123");
    expect(body.roles).toEqual(["admin"]);
    expect(body.tenants.T1?.roles).toEqual(["member"]);
    expect(body.tenants.T1?.permissions).toEqual([]);
    expect(body.currentTenant).toBe("T1");
    expect(body.custom).toEqual({ plan: "pro" });
  });
  it("200 with a valid DS cookie (cookie mode)", async () => {
    const res = await fetch(`${baseUrl}/api/whoami`, {
      headers: { cookie: `DS=${GOOD}` },
    });
    expect(res.status).toBe(200);
  });
});
