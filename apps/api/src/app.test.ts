import type { AddressInfo } from "node:net";
import { HealthResponse } from "@kit/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp, createDeps } from "./app";
import { parseEnv } from "./env";

const env = parseEnv({ DESCOPE_PROJECT_ID: "P2test" });
const deps = createDeps(env);
const app = createApp(env, deps);
let baseUrl = "";
let server: ReturnType<typeof app.listen>;

beforeAll(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const { port } = server.address() as AddressInfo;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});
afterAll(() => server.close());

describe("api", () => {
  it.each([
    ["{", 400],
    [JSON.stringify({ name: "x".repeat(110_000) }), 413],
  ] as const)(
    "returns a client error for invalid JSON input",
    async (body, status) => {
      const res = await fetch(`${baseUrl}/api/bookings`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      });
      expect(res.status).toBe(status);
      expect(await res.json()).toMatchObject({ error: "bad_request" });
    },
  );
  it("serves /api/health matching the contract", async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(() => HealthResponse.parse(body)).not.toThrow();
  });
  it("returns JSON 404 for unknown routes", async () => {
    const res = await fetch(`${baseUrl}/api/nope`);
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("not_found");
  });
  it("POST /api/demo/reset restores the boot-time demo data", async () => {
    await deps.bookings.ensureSamples("user:U1");
    await deps.bookings.create(
      "user:U1",
      {
        park: "sandford",
        accommodation: "lodge",
        arrival: "2027-05-01",
        nights: 3,
        guests: 2,
      },
      "U1",
    );
    const res = await fetch(`${baseUrl}/api/demo/reset`, { method: "POST" });
    expect(res.status).toBe(204);
    expect(await deps.bookings.list("user:U1")).toEqual([]);
  });
  it("allows each configured origin and no other", async () => {
    const multi = createApp(
      parseEnv({
        DESCOPE_PROJECT_ID: "P2test",
        WEB_ORIGIN: "http://localhost:5173,http://localhost:5174",
      }),
    );
    const s = multi.listen(0);
    await new Promise((r) => s.once("listening", r));
    const url = `http://127.0.0.1:${(s.address() as AddressInfo).port}/api/health`;
    try {
      for (const origin of ["http://localhost:5173", "http://localhost:5174"]) {
        const res = await fetch(url, { headers: { origin } });
        expect(res.headers.get("access-control-allow-origin")).toBe(origin);
      }
      const other = await fetch(url, {
        headers: { origin: "https://evil.example.com" },
      });
      expect(other.headers.get("access-control-allow-origin")).toBeNull();
    } finally {
      s.close();
    }
  });
});

describe("demo reset switch", () => {
  it("is not routed when KIT_DEMO_RESET=false", async () => {
    const off = createApp(
      parseEnv({ DESCOPE_PROJECT_ID: "P2test", KIT_DEMO_RESET: "false" }),
    );
    const s = off.listen(0);
    await new Promise((r) => s.once("listening", r));
    try {
      const res = await fetch(
        `http://127.0.0.1:${(s.address() as AddressInfo).port}/api/demo/reset`,
        { method: "POST" },
      );
      expect(res.status).toBe(404);
    } finally {
      s.close();
    }
  });
});
