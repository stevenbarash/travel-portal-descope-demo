import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { ownershipLedger } from "./ownership";

test("reset preserves unrecorded resources and isolates projects", async () => {
  const dir = mkdtempSync(join(tmpdir(), "kit-ownership-"));
  try {
    const ledger = ownershipLedger(dir, "project-a");
    let deleted = false;
    await ledger.remove("tenants", "kit-existing", async () => {
      deleted = true;
    });
    assert.equal(deleted, false);
    ledger.record("tenants", "kit-created");
    assert.deepEqual(ownershipLedger(dir, "project-b").ids("tenants"), []);
    const reopened = ownershipLedger(dir, "project-a");
    assert.deepEqual(reopened.ids("tenants"), ["kit-created"]);
    await assert.rejects(
      reopened.remove("tenants", "kit-created", async () => {
        throw new Error("offline");
      }),
    );
    assert.equal(reopened.has("tenants", "kit-created"), true);
    await reopened.remove("tenants", "kit-created", async () => {
      deleted = true;
    });
    assert.equal(deleted, true);
    assert.deepEqual(ownershipLedger(dir, "project-a").ids("tenants"), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a ledger saved before a kind existed still opens; that kind starts empty", () => {
  const dir = mkdtempSync(join(tmpdir(), "kit-ownership-"));
  try {
    const hash = createHash("sha256").update("project-a").digest("hex");
    mkdirSync(join(dir, ".kit-state"));
    writeFileSync(
      join(dir, ".kit-state", `${hash}.json`),
      JSON.stringify({
        version: 1,
        projectId: "project-a",
        resources: { users: ["U1"], tenants: [], roles: [], permissions: [] },
      }),
    );
    const ledger = ownershipLedger(dir, "project-a");
    assert.deepEqual(ledger.ids("users"), ["U1"]);
    assert.deepEqual(ledger.ids("flows"), []);
    writeFileSync(
      join(dir, ".kit-state", `${hash}.json`),
      JSON.stringify({
        version: 1,
        projectId: "project-a",
        resources: { users: [1] },
      }),
    );
    assert.throws(() => ownershipLedger(dir, "project-a"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("planning never creates a ledger or grants write ownership", async () => {
  const dir = mkdtempSync(join(tmpdir(), "kit-plan-"));
  try {
    const ledger = ownershipLedger(dir, "project", true);
    assert.equal(existsSync(join(dir, ".kit-state")), false);
    assert.throws(() => ledger.record("users", "user"), /Read-only/);
    await assert.rejects(
      ledger.remove("users", "user", async () => {
        throw new Error("must not run");
      }),
      /Read-only/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
