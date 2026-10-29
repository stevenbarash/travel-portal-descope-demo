import type { AddressInfo } from "node:net";
import {
  type AuthenticationInfo,
  createDescopeServer,
} from "@kit/descope/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../app";
import { parseEnv } from "../../env";
import { InMemoryBookingsRepo } from "./repo";
import { isReturningGuest } from "./routes";

/** A guardian's slice of the session's `families` claim. */
const guardianOf = {
  "fam-1": {
    roles: ["Family Admin"],
    permissions: ["Family Impersonate Dependents"],
  },
};
const users: Record<string, AuthenticationInfo> = {
  guest: { jwt: "guest", token: { sub: "U-guest", families: guardianOf } },
  partner: {
    jwt: "partner",
    token: { sub: "U-partner", families: guardianOf },
  },
  /** In the family without the guardian permission (e.g. a teen with a login). */
  member: {
    jwt: "member",
    token: {
      sub: "U-member",
      families: { "fam-1": { roles: [], permissions: [] } },
    },
  },
  newbie: { jwt: "newbie", token: { sub: "U-newbie" } },
  agent: {
    jwt: "agent",
    token: {
      sub: "U-agent",
      roles: ["Customer Service"],
      permissions: ["User Admin", "Impersonate"],
    },
  },
  viewer: {
    jwt: "viewer",
    token: { sub: "U-viewer", permissions: ["User Admin"] },
  },
};
const loginIds: Record<string, string> = {
  "U-guest": "se+guest@example.net",
  "U-partner": "se+partner@example.net",
  "U-newbie": "new.customer@example.net",
  "U-agent": "agent@example.com",
};
const customer = (userId: string) => ({
  userId,
  loginId: loginIds[userId] ?? userId,
  email: undefined,
  name: undefined,
  status: "enabled",
  methods: [],
  createdAt: undefined,
  familyId: ["U-guest", "U-partner"].includes(userId) ? "fam-1" : undefined,
});
const member = (
  userId: string,
  name: string,
  dependent: boolean,
  relationship: string,
) => ({
  userId,
  loginId: dependent ? `fam-1-${name.toLowerCase()}` : `${userId}@x`,
  name,
  email: undefined,
  dependent,
  roles: dependent ? [] : ["Family Admin"],
  relationship,
});
let familyMembers = [
  member("U-guest", "Gemma", false, "Mum"),
  member("U-partner", "Sam", false, "Dad"),
  member("U-mia", "Mia", true, "Daughter"),
];
const actedFor: [string, string, string][] = [];
const impersonations: [string, string][] = [];
const real = createDescopeServer({ projectId: "P2test" });
const descope = {
  ...real,
  hasManagementKey: true,
  validateSession: async (token: string) => {
    const u = users[token];
    if (!u) throw new Error("invalid");
    return u;
  },
  loadUser: async (userId: string) => customer(userId),
  loadFamily: async (familyId: string) =>
    familyId === "fam-1"
      ? { id: "fam-1", name: "The Guest family", members: familyMembers }
      : null,
  createDependent: async (_f: string, name: string, relationship: string) => {
    const m = member(`U-${name.toLowerCase()}`, name, true, relationship);
    familyMembers = [...familyMembers, m];
    return m;
  },
  deleteDependent: async (userId: string) => {
    familyMembers = familyMembers.filter((m) => m.userId !== userId);
  },
  actForDependent: async (
    guardianId: string,
    loginId: string,
    familyId: string,
  ) => {
    actedFor.push([guardianId, loginId, familyId]);
    const sub = familyMembers.find((m) => m.loginId === loginId)?.userId;
    const payload = Buffer.from(
      JSON.stringify({ sub, act: { sub: guardianId }, dcf: familyId }),
    ).toString("base64url");
    return `e30.${payload}.sig`;
  },
  searchCustomers: async () => [customer("U-guest")],
  auditFor: async () => [
    {
      occurred: new Date(0).toISOString(),
      action: "LoginSucceed",
      method: undefined,
      device: undefined,
      geo: undefined,
      actorId: undefined,
    },
  ],
  impersonate: async (agentId: string, loginId: string) => {
    impersonations.push([agentId, loginId]);
    const sub = Object.keys(loginIds).find((id) => loginIds[id] === loginId);
    const payload = Buffer.from(
      JSON.stringify({ sub, act: { sub: agentId }, iat: 1 }),
    ).toString("base64url");
    return `e30.${payload}.sig`;
  },
};
const app = createApp(parseEnv({ DESCOPE_PROJECT_ID: "P2test" }), {
  descope,
  bookings: new InMemoryBookingsRepo(),
});
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

const as = (who: string, init: RequestInit = {}) => ({
  ...init,
  headers: {
    authorization: `Bearer ${who}`,
    "content-type": "application/json",
    ...(init.headers ?? {}),
  },
});
const json = async (res: Response) =>
  (await res.json()) as Record<string, unknown>;
const breakAt = {
  destination: "cape-town",
  accommodation: "hotel",
  arrival: "2027-07-24",
  nights: 7,
  guests: 4,
};

it("recognizes the returning household and the presenter's plus-addressed logins", () => {
  expect(isReturningGuest("guest@example.com")).toBe(true);
  expect(isReturningGuest("partner@example.com")).toBe(true);
  expect(isReturningGuest("se+partner@example.net")).toBe(true);
  expect(isReturningGuest("se+guest@example.net")).toBe(true);
  expect(isReturningGuest("se+demo-guest@example.net")).toBe(true);
  expect(isReturningGuest("guesthouse@example.com")).toBe(false);
  expect(isReturningGuest(undefined)).toBe(false);
});

describe("my bookings", () => {
  it("rejects anonymous calls", async () => {
    expect((await fetch(`${base}/api/bookings`)).status).toBe(401);
  });

  it("a returning guest sees their history; a new customer starts empty", async () => {
    const guest = await json(await fetch(`${base}/api/bookings`, as("guest")));
    expect(guest.scope).toBe("family:fam-1");
    expect(guest.bookings).toHaveLength(3);
    // Who was on each break comes from the Descope family: everyone, everyone, the grown-ups.
    const parties = (guest.bookings as { party?: { name: string }[] }[]).map(
      (b) => b.party?.map((p) => p.name),
    );
    expect(parties).toContainEqual(["Gemma", "Sam"]);
    const newbie = await json(
      await fetch(`${base}/api/bookings`, as("newbie")),
    );
    expect(newbie.bookings).toHaveLength(0);
  });

  it("creates a booking in the caller's own scope, whatever the body says", async () => {
    const res = await fetch(
      `${base}/api/bookings`,
      as("newbie", {
        method: "POST",
        body: JSON.stringify({ ...breakAt, scope: "family:fam-1" }),
      }),
    );
    expect(res.status).toBe(201);
    const created = await json(res);
    expect(created.scope).toBe("user:U-newbie");
    expect(created.reference).toMatch(/^PD\d{7}$/);
    const guest = await json(await fetch(`${base}/api/bookings`, as("guest")));
    expect(guest.bookings).toHaveLength(3);
  });

  it("guardians share the family's bookings, and the party is checked against the family", async () => {
    const res = await fetch(
      `${base}/api/bookings`,
      as("partner", {
        method: "POST",
        body: JSON.stringify({ ...breakAt, partyIds: ["U-partner", "U-mia"] }),
      }),
    );
    expect(res.status).toBe(201);
    const created = await json(res);
    expect(created.scope).toBe("family:fam-1");
    expect(created.guests).toBe(2);
    expect(created.party).toEqual([
      { userId: "U-partner", name: "Sam" },
      { userId: "U-mia", name: "Mia" },
    ]);
    const guest = await json(await fetch(`${base}/api/bookings`, as("guest")));
    expect(guest.bookings).toHaveLength(4);
    // Someone outside the family can't be put on a break.
    const outsider = await fetch(
      `${base}/api/bookings`,
      as("guest", {
        method: "POST",
        body: JSON.stringify({ ...breakAt, partyIds: ["U-newbie"] }),
      }),
    );
    expect(outsider.status).toBe(400);
  });

  it("rejects an invalid booking", async () => {
    const res = await fetch(
      `${base}/api/bookings`,
      as("newbie", {
        method: "POST",
        body: JSON.stringify({ ...breakAt, destination: "atlantis" }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("can't cancel someone else's booking", async () => {
    const guest = await json(await fetch(`${base}/api/bookings`, as("guest")));
    const id = (guest.bookings as { id: string }[])[0]?.id;
    const res = await fetch(
      `${base}/api/bookings/${id}`,
      as("newbie", {
        method: "PATCH",
        body: JSON.stringify({ status: "cancelled" }),
      }),
    );
    expect(res.status).toBe(404);
  });
});

describe("customer service console", () => {
  it("customers can't use it", async () => {
    const res = await fetch(`${base}/api/service/customers`, as("guest"));
    expect(res.status).toBe(403);
  });

  it("an agent finds a customer, reads their bookings and audit trail", async () => {
    const search = await json(
      await fetch(`${base}/api/service/customers?q=guest`, as("agent")),
    );
    expect(search.customers).toHaveLength(1);
    const detail = await json(
      await fetch(`${base}/api/service/customers/U-guest`, as("agent")),
    );
    expect(detail.bookings).toHaveLength(4);
    expect((detail.family as { name: string }).name).toBe("The Guest family");
    const audit = await json(
      await fetch(`${base}/api/service/customers/U-guest/audit`, as("agent")),
    );
    expect(audit.entries).toHaveLength(1);
  });

  it("impersonation needs the Impersonate permission", async () => {
    const res = await fetch(
      `${base}/api/service/customers/U-guest/impersonate`,
      as("viewer", { method: "POST" }),
    );
    expect(res.status).toBe(403);
    expect(impersonations).toHaveLength(0);
  });

  it("an agent sees the customer's account as the customer, with themselves as the actor", async () => {
    const res = await fetch(
      `${base}/api/service/customers/U-guest/impersonate`,
      as("agent", { method: "POST" }),
    );
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(impersonations).toEqual([["U-agent", "se+guest@example.net"]]);
    expect(body.subject).toBe("U-guest");
    expect(body.actor).toBe("U-agent");
    expect(body.bookings).toHaveLength(4);
  });
});

describe("family", () => {
  it("a guardian sees the household and may manage it; a customer without one sees none", async () => {
    const mine = await json(await fetch(`${base}/api/family`, as("guest")));
    expect((mine.family as { members: unknown[] }).members).toHaveLength(3);
    expect(mine.roles).toEqual(["Family Admin"]);
    expect(mine.canManage).toBe(true);
    const none = await json(await fetch(`${base}/api/family`, as("newbie")));
    expect(none.family).toBeNull();
    expect(none.canManage).toBe(false);
  });

  it("only guardians add and remove dependents", async () => {
    const add = (who: string) =>
      fetch(
        `${base}/api/family/dependents`,
        as(who, {
          method: "POST",
          body: JSON.stringify({ name: "Nana", relationship: "Grandmother" }),
        }),
      );
    expect((await add("member")).status).toBe(403);
    expect((await add("newbie")).status).toBe(403);
    const res = await add("partner");
    expect(res.status).toBe(201);
    expect((await json(res)).dependent).toBe(true);
    // A guardian can't delete a guardian through the dependents route.
    const notDependent = await fetch(
      `${base}/api/family/dependents/U-guest`,
      as("partner", { method: "DELETE" }),
    );
    expect(notDependent.status).toBe(404);
    const removed = await fetch(
      `${base}/api/family/dependents/U-nana`,
      as("guest", { method: "DELETE" }),
    );
    expect(removed.status).toBe(204);
    expect(familyMembers.map((m) => m.name)).not.toContain("Nana");
  });

  it("a guardian acts for a dependent: Descope's token names them in act, and shows the dependent's breaks", async () => {
    expect(
      (
        await fetch(
          `${base}/api/family/dependents/U-mia/act`,
          as("member", { method: "POST" }),
        )
      ).status,
    ).toBe(403);
    const res = await fetch(
      `${base}/api/family/dependents/U-mia/act`,
      as("guest", { method: "POST" }),
    );
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(actedFor).toEqual([["U-guest", "fam-1-mia", "fam-1"]]);
    expect(body.subject).toBe("U-mia");
    expect(body.actor).toBe("U-guest");
    expect(body.familyId).toBe("fam-1");
    // Mia was on both everyone-breaks and Sam's new one, not the grown-ups' break.
    expect(body.bookings).toHaveLength(3);
  });
});
