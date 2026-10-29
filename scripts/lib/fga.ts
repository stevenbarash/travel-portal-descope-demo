import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { createDescopeServer } from "@kit/descope/server";
import { must } from "./descope";
import type { OwnershipLedger } from "./ownership";

/** Optional. Seed manages FGA only when this file exists. */
export const FGA_SCHEMA_FILE = resolve(
  import.meta.dirname,
  "../../descope/fga/schema.dsl",
);

/** One FGA tuple: `target` (of `targetType`) has `relation` on `resource` (of `resourceType`). */
export interface FgaRelation {
  resource: string;
  resourceType: string;
  relation: string;
  target: string;
  targetType: string;
}

type Descope = ReturnType<typeof createDescopeServer>;

/**
 * The Descope DSL has no comment syntax and saveSchema rejects `//` lines, so the annotated file
 * is sent without its whole-line comments. Keep comments on their own lines, never trailing.
 */
export function schemaWithoutComments(dsl: string): string {
  return dsl
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n")
    .trim();
}

/** Ledger key for a relation: `type:id#relation@type:id`. */
export const relationKey = (r: FgaRelation) =>
  `${r.resourceType}:${r.resource}#${r.relation}@${r.targetType}:${r.target}`;

/** Inverse of relationKey(), used to delete ledger-recorded relations. */
export function parseRelationKey(key: string): FgaRelation {
  const m = key.match(/^([^:]+):([^#]+)#([^@]+)@([^:]+):(.+)$/);
  if (!m) throw new Error(`Bad relation key in ledger: ${key}`);
  const [, resourceType, resource, relation, targetType, target] =
    m as unknown as [string, string, string, string, string, string];
  return { resourceType, resource, relation, targetType, target };
}

/**
 * Save the schema (project-wide: never replace one this checkout didn't save) and create the
 * relations not yet recorded. Returns false when FGA was skipped.
 */
export async function seedFga(
  descope: Descope,
  owned: OwnershipLedger,
  relations: readonly FgaRelation[],
): Promise<boolean> {
  if (!existsSync(FGA_SCHEMA_FILE)) return false;
  const m = descope.client.management;
  const dsl = schemaWithoutComments(readFileSync(FGA_SCHEMA_FILE, "utf8"));
  const current = await m.fga.loadSchema();
  const currentDsl = current.ok ? (current.data?.dsl ?? "").trim() : "";
  if (currentDsl && currentDsl !== dsl && !owned.has("fgaSchema", "schema")) {
    console.warn(
      "skipping FGA: the project already has an FGA schema this checkout did not create.\n" +
        "  Merge descope/fga/schema.dsl into it in the console (Authorization → FGA), then re-run seed.",
    );
    return false;
  }
  // Skip saving an unchanged schema; otherwise dry-run first to surface relations it would delete.
  if (currentDsl !== dsl) {
    const dry = must(await m.fga.dryRunSchema({ dsl }), "fga.dryRunSchema");
    if (dry.data?.deletesPreview?.hasDeletes)
      console.log(
        `note: schema update removes ${JSON.stringify(dry.data.deletesPreview)}`,
      );
    must(await m.fga.saveSchema({ dsl }), "fga.saveSchema");
    owned.record("fgaSchema", "schema");
    console.log("saved FGA schema (descope/fga/schema.dsl)");
  }
  // Idempotent: only relations not already in the ledger are created.
  const fresh = relations.filter(
    (r) => !owned.has("relations", relationKey(r)),
  );
  if (fresh.length) {
    must(await m.fga.createRelations([...fresh]), "fga.createRelations");
    for (const r of fresh) owned.record("relations", relationKey(r));
  }
  console.log(
    `FGA relations: ${fresh.length} created, ${relations.length - fresh.length} already recorded`,
  );
  return true;
}

/**
 * Delete recorded relations, all of them or only those targeting one user. Relations name users
 * by userId, so a recreated test user must lose its old relations or they point at a deleted user.
 */
export async function deleteOwnedRelations(
  descope: Descope,
  owned: OwnershipLedger,
  userId?: string,
) {
  const keys = owned
    .ids("relations")
    .filter((key) => userId === undefined || key.endsWith(`@user:${userId}`));
  if (!keys.length) return 0;
  must(
    await descope.client.management.fga.deleteRelations(
      keys.map(parseRelationKey),
    ),
    "fga.deleteRelations",
  );
  // Already deleted in one batch above; the no-op callback just clears each ledger entry.
  for (const key of keys) await owned.remove("relations", key, async () => {});
  return keys.length;
}

/** Reset: relations first (they reference the schema's types), then the schema if seed saved it. */
export async function resetFga(descope: Descope, owned: OwnershipLedger) {
  const n = await deleteOwnedRelations(descope, owned);
  if (n) console.log(`deleted ${n} owned FGA relations`);
  await owned.remove("fgaSchema", "schema", async () => {
    must(
      await descope.client.management.fga.deleteSchema(),
      "fga.deleteSchema",
    );
    console.log("deleted owned FGA schema");
  });
}
