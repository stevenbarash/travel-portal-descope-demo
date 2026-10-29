import assert from "node:assert/strict";
import { test } from "node:test";
import { diagnose } from "./doctor";

const env = {
  DESCOPE_PROJECT_ID: "server-secret-marker",
  VITE_DESCOPE_PROJECT_ID: "server-secret-marker",
  DESCOPE_MANAGEMENT_KEY: "key-secret-marker",
};
test("fresh clones report missing config and never claim live verification", () => {
  const rows = diagnose({}, false);
  assert.equal(rows.find((r) => r.id === "environment")?.status, "blocked");
  assert.equal(rows.find((r) => r.id === "mcp")?.status, "unverified");
});
test("doctor compares targets without printing values or credentials", () => {
  const rows = diagnose(
    {
      ...env,
      VITE_DESCOPE_PROJECT_ID: "another-secret-marker",
      DESCOPE_TEST_OTP: "otp-secret-marker",
    },
    true,
  );
  assert.equal(rows.find((r) => r.id === "target")?.status, "blocked");
  assert.ok(!JSON.stringify(rows).includes("secret-marker"));
});
test("default and explicit US URLs match, differing regions do not", () => {
  assert.equal(
    diagnose(
      { ...env, VITE_DESCOPE_BASE_URL: "https://api.descope.com/" },
      true,
    ).find((r) => r.id === "target")?.status,
    "ready",
  );
  assert.equal(
    diagnose(
      { ...env, VITE_DESCOPE_BASE_URL: "https://api.euc1.descope.com" },
      true,
    ).find((r) => r.id === "target")?.status,
    "blocked",
  );
});
test("browser-exposed secrets block readiness", () => {
  assert.equal(
    diagnose({ ...env, VITE_DESCOPE_TEST_OTP: "private" }, true).find(
      (r) => r.id === "browser-secrets",
    )?.status,
    "blocked",
  );
});

test("WEB_ORIGIN is a list, as the API reads it", () => {
  const status = (WEB_ORIGIN: string) =>
    diagnose({ ...env, WEB_ORIGIN }, true).find((r) => r.id === "ports-config")
      ?.status;
  assert.equal(
    status("http://localhost:5173, https://demo.example.com"),
    "ready",
  );
  assert.equal(status("https://demo.example.com"), "blocked");
});
