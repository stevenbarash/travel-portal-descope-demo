import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

/** Resource categories the ledger tracks. Kinds added later load empty from older ledgers. */
const kinds = [
  "users",
  /** Real (non-test) plus-addressed persona users for live demos (DEMO_EMAIL in .env). */
  "demoUsers",
  "tenants",
  "roles",
  "permissions",
  "flows",
  /** FGA relations, stored as `type:id#relation@type:id` (scripts/lib/fga.ts). */
  "relations",
  /** The FGA schema (single entry "schema") when this checkout saved it. */
  "fgaSchema",
  /** Family Accounts: family IDs, dependent user IDs, family-scoped user attribute names. */
  "families",
  "dependents",
  "familyAttributes",
] as const;
type Kind = (typeof kinds)[number];
type Records = Record<Kind, string[]>;

/**
 * Local creation ledger, isolated by project. Missing state never grants ownership.
 * Run seed/reset one at a time. Losing this file requires manual cleanup, not adoption.
 */
export function ownershipLedger(
  repoRoot: string,
  projectId: string,
  readOnly = false,
) {
  // One file per project (hashed ID, so the filename leaks nothing) under the gitignored .kit-state/.
  const dir = join(repoRoot, ".kit-state");
  const file = join(
    dir,
    `${createHash("sha256").update(projectId).digest("hex")}.json`,
  );
  const records: Records = {
    users: [],
    demoUsers: [],
    tenants: [],
    roles: [],
    permissions: [],
    flows: [],
    relations: [],
    fgaSchema: [],
    families: [],
    dependents: [],
    familyAttributes: [],
  };
  if (existsSync(file)) {
    const saved = JSON.parse(readFileSync(file, "utf8"));
    if (
      saved?.version !== 1 ||
      saved.projectId !== projectId ||
      !kinds.every(
        (kind) =>
          // Kinds added later may be missing from older ledgers; they start empty.
          saved.resources?.[kind] === undefined ||
          (Array.isArray(saved.resources[kind]) &&
            saved.resources[kind].every(
              (id: unknown) => typeof id === "string",
            )),
      )
    ) {
      throw new Error(
        "Invalid kit ownership ledger; refusing to manage resources",
      );
    }
    Object.assign(records, saved.resources);
  }
  function save() {
    if (readOnly) throw new Error("Read-only ownership ledger");
    mkdirSync(dir, { recursive: true });
    // Write-then-rename is atomic, so a crash mid-save never leaves a truncated ledger.
    const temp = `${file}.tmp`;
    writeFileSync(
      temp,
      `${JSON.stringify({ version: 1, projectId, resources: records }, null, 2)}\n`,
      { mode: 0o600 },
    );
    renameSync(temp, file);
  }
  // Check local persistence before making any remote changes.
  if (!readOnly) save();
  return {
    ids: (kind: Kind) => [...records[kind]],
    has: (kind: Kind, id: string) => records[kind].includes(id),
    /** Record right after each remote create, so a later failure still leaves it reset-able. */
    record(kind: Kind, id: string) {
      if (readOnly) throw new Error("Read-only ownership ledger");
      if (!records[kind].includes(id)) records[kind].push(id);
      save();
    },
    /** Run the remote delete, then forget the ID. Unowned IDs are a no-op; a throw keeps the record. */
    async remove(kind: Kind, id: string, remove: () => Promise<unknown>) {
      if (readOnly) throw new Error("Read-only ownership ledger");
      if (!records[kind].includes(id)) return;
      await remove();
      records[kind] = records[kind].filter((value) => value !== id);
      save();
    },
  };
}

/** Handle returned by ownershipLedger(). */
export type OwnershipLedger = ReturnType<typeof ownershipLedger>;
