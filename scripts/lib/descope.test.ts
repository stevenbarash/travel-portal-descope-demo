import assert from "node:assert/strict";
import { test } from "node:test";
import type { createDescopeServer } from "@kit/descope/server";
import { findTestUsersByEmail, storedLoginId } from "./descope";

test("test-user lookup excludes ordinary users sharing the email", async () => {
  const client = {
    client: {
      management: {
        user: {
          searchAll: async (...args: unknown[]) => ({
            ok: true,
            data:
              args[4] === true
                ? [{ userId: "test-user", test: true }]
                : [
                    { userId: "real-user", test: false },
                    { userId: "test-user", test: true },
                  ],
          }),
        },
      },
    },
  } as unknown as ReturnType<typeof createDescopeServer>;
  assert.deepEqual(
    (await findTestUsersByEmail(client, "admin@example.com")).map(
      (u) => u.userId,
    ),
    ["test-user"],
  );
});

function identityClient(users: unknown[]) {
  return {
    client: {
      management: {
        user: { searchAll: async () => ({ ok: true, data: users }) },
      },
    },
  } as unknown as ReturnType<typeof createDescopeServer>;
}
test("tenant lookup never falls back to a different organization", async () => {
  const client = identityClient([
    {
      test: true,
      loginIds: ["email-acme"],
      userTenants: [{ tenantId: "acme" }],
    },
  ]);
  await assert.rejects(
    storedLoginId(client, "email", "globex"),
    /no test user/,
  );
});
test("personal lookup excludes organization users and rejects ambiguous identities", async () => {
  const client = identityClient([
    { test: true, loginIds: ["org"], userTenants: [{ tenantId: "acme" }] },
  ]);
  await assert.rejects(storedLoginId(client, "email"), /no test user/);
  const ambiguous = identityClient([
    { test: true, loginIds: ["one"] },
    { test: true, loginIds: ["two"] },
  ]);
  await assert.rejects(storedLoginId(ambiguous, "email"), /ambiguous/);
});
