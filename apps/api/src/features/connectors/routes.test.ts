import type { AddressInfo } from "node:net";
import { createDescopeServer } from "@kit/descope/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../app";
import { parseEnv } from "../../env";
import { InMemoryBookingsRepo } from "../bookings/repo";

const SECRET = "test-connector-secret-0123456789";

function start(secret?: string) {
  const app = createApp(
    parseEnv({ DESCOPE_PROJECT_ID: "P2test", CONNECTOR_SECRET: secret }),
    {
      descope: createDescopeServer({ projectId: "P2test" }),
      bookings: new InMemoryBookingsRepo(),
    },
  );
  return new Promise<{ base: string; close: () => void }>((resolve) => {
    const server = app.listen(0, () =>
      resolve({
        base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
        close: () => server.close(),
      }),
    );
  });
}

const post = (base: string, body: unknown, secret?: string) =>
  fetch(`${base}/api/connectors/lookup`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(secret ? { "x-connector-secret": secret } : {}),
    },
    body: JSON.stringify(body),
  });

describe("connector lookup", () => {
  let srv: { base: string; close: () => void };
  beforeAll(async () => {
    srv = await start(SECRET);
  });
  afterAll(() => srv.close());

  it("401 without the shared secret or with a wrong one", async () => {
    expect((await post(srv.base, { email: "ada@example.com" })).status).toBe(
      401,
    );
    expect(
      (await post(srv.base, { email: "ada@example.com" }, "nope")).status,
    ).toBe(401);
  });

  it("answers a decision the flow can branch on", async () => {
    const match = await post(srv.base, { email: "ADA@example.com" }, SECRET);
    expect(match.status).toBe(200);
    expect(await match.json()).toEqual({
      allowed: true,
      reason: "match",
      customerId: "CUST-1001",
      plan: "Gold",
    });
    const blocked = await post(
      srv.base,
      { email: "mallory@example.com" },
      SECRET,
    );
    expect(await blocked.json()).toEqual({ allowed: false, reason: "blocked" });
    const unknown = await post(srv.base, { email: "who@example.com" }, SECRET);
    expect(await unknown.json()).toEqual({
      allowed: false,
      reason: "no_match",
    });
  });

  it("requires the external ID when the record has one", async () => {
    const without = await post(
      srv.base,
      { email: "grace@example.com" },
      SECRET,
    );
    expect((await without.json()).reason).toBe("no_match");
    const withId = await post(
      srv.base,
      { email: "grace@example.com", externalId: "M-2002" },
      SECRET,
    );
    expect((await withId.json()).reason).toBe("match");
  });

  it("400 names bad fields without echoing values", async () => {
    const res = await post(srv.base, { email: "not-an-email-4821" }, SECRET);
    expect(res.status).toBe(400);
    const text = await res.text();
    expect(text).toContain("email");
    expect(text).not.toContain("4821");
  });
});

it("503 until CONNECTOR_SECRET is set", async () => {
  const srv = await start();
  try {
    const res = await post(srv.base, { email: "ada@example.com" }, SECRET);
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe("not_configured");
  } finally {
    srv.close();
  }
});

it("rejects a short CONNECTOR_SECRET at startup", () => {
  expect(() =>
    parseEnv({ DESCOPE_PROJECT_ID: "P2test", CONNECTOR_SECRET: "short" }),
  ).toThrow(/CONNECTOR_SECRET/);
});
