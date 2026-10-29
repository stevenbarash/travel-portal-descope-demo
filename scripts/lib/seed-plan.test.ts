import assert from "node:assert/strict";
import { test } from "node:test";
import { freeTenantName } from "./seed-plan";

test("a kit tenant whose name another tenant holds gets a free name, never a duplicate", () => {
  // Descope rejects a duplicate tenant name (E073307) even under a new ID.
  const existing = [{ id: "acme-corp", name: "acme corp" }];
  assert.equal(freeTenantName("Acme Corp", "acme", []), "Acme Corp");
  assert.equal(
    freeTenantName("Acme Corp", "acme", existing),
    "Acme Corp (acme)",
  );
  assert.equal(
    freeTenantName("Acme Corp", "acme", [
      ...existing,
      { id: "other", name: "Acme Corp (acme)" },
    ]),
    "Acme Corp (acme) 2",
  );
  // The tenant's own record never counts as a collision.
  assert.equal(
    freeTenantName("Acme Corp", "acme", [{ id: "acme", name: "Acme Corp" }]),
    "Acme Corp",
  );
});
