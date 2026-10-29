import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { createDescopeServer } from "@kit/descope/server";
import { must } from "./descope";
import type { OwnershipLedger } from "./ownership";

/** Kit flow exports (`demo-*.json`) that seed imports. */
export const FLOWS_DIR = resolve(import.meta.dirname, "../../descope/flows");
// The prefix is the safety boundary: seed/reset never touch flows outside it.
const FLOW_PREFIX = "demo-";

/** Shape of a flow export file, as written by exportKitFlows() and read by flow.import. */
type FlowFile = {
  flow: {
    id: string;
    name: string;
    description?: string;
    dsl: unknown;
    disabled: boolean;
  };
  screens: {
    id: string;
    flowId: string;
    inputs?: unknown;
    interactions?: unknown;
    htmlTemplate: unknown;
  }[];
};

/** Load every flow file in name order, refusing any whose ID lacks the kit prefix. */
export function readKitFlowFiles(): FlowFile[] {
  // Name order is import order: demo-promote-passkeys (a subflow) lands before
  // demo-sign-up-or-in, which references it. readdirSync alone doesn't guarantee an order.
  return readdirSync(FLOWS_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map(
      (f) =>
        JSON.parse(readFileSync(resolve(FLOWS_DIR, f), "utf8")) as FlowFile,
    )
    .map((ff) => {
      if (!ff.flow.id.startsWith(FLOW_PREFIX)) {
        throw new Error(
          `refusing to manage flow "${ff.flow.id}": kit flows must start with "${FLOW_PREFIX}"`,
        );
      }
      return ff;
    });
}

/** Import missing flows. Force only overwrites flows recorded as owned by this checkout. */
export async function seedFlows(
  descope: ReturnType<typeof createDescopeServer>,
  owned: OwnershipLedger,
  force = false,
) {
  const m = descope.client.management;
  const existing = new Set(
    (must(await m.flow.list(), "flow.list").data?.flows ?? []).map((f) => f.id),
  );
  for (const ff of readKitFlowFiles()) {
    const id = ff.flow.id;
    // Never overwrite a flow someone may have edited in the console unless forced AND owned.
    if (existing.has(id) && (!force || !owned.has("flows", id))) {
      console.log(`flow exists, not overwriting: ${id}`);
      continue;
    }
    must(await m.flow.import(id, ff.flow, ff.screens), `flow.import(${id})`);
    owned.record("flows", id);
    console.log(`${existing.has(id) ? "re-imported" : "imported"} flow: ${id}`);
  }
}

/** Delete only the kit's own flows that are present. */
export async function resetFlows(
  descope: ReturnType<typeof createDescopeServer>,
  owned: OwnershipLedger,
) {
  const m = descope.client.management;
  const existing = new Set(
    (must(await m.flow.list(), "flow.list").data?.flows ?? []).map((f) => f.id),
  );
  // Reverse import order: a parent flow goes before the subflow it references.
  for (const id of owned.ids("flows").sort().reverse()) {
    await owned.remove("flows", id, async () => {
      if (existing.has(id))
        must(await m.flow.delete([id]), `flow.delete(${id})`);
    });
    console.log(`removed owned flow: ${id}`);
  }
}

/**
 * The customer's own flows (not managed by seed/reset): a read-only copy kept in the repo so the
 * demo's login journey is reviewable and restorable. TravelCorp's flows are `tp-*`.
 */
export const CUSTOMER_FLOWS_DIR = resolve(
  import.meta.dirname,
  "../../descope/customer-flows",
);
/** ID prefix of the customer flows mirrored into CUSTOMER_FLOWS_DIR. */
export const CUSTOMER_FLOW_PREFIX = "tp-";

/**
 * Export the project's current flows with `prefix` into `dir`: by default the kit's `demo-*` flows
 * back into descope/flows (after editing in the console).
 */
export async function exportKitFlows(
  descope: ReturnType<typeof createDescopeServer>,
  prefix = FLOW_PREFIX,
  dir = FLOWS_DIR,
) {
  const m = descope.client.management;
  const ids = (must(await m.flow.list(), "flow.list").data?.flows ?? [])
    .map((f) => f.id)
    .filter((id) => id.startsWith(prefix));
  for (const id of ids) {
    const ex = must(await m.flow.export(id), `flow.export(${id})`).data;
    if (!ex) continue;
    const { id: fid, name, description, dsl, disabled } = ex.flow;
    // Keep only the fields import needs (drop server-added metadata) so re-exports diff cleanly.
    const screens = ex.screens.map((s) => {
      const {
        id: sidv,
        flowId,
        inputs,
        interactions,
        htmlTemplate,
        ...rest
      } = s as typeof s & { componentsVersion?: string };
      return {
        id: sidv,
        flowId,
        inputs,
        interactions,
        htmlTemplate,
        componentsVersion: rest.componentsVersion,
      };
    });
    writeFileSync(
      resolve(dir, `${id}.json`),
      `${JSON.stringify({ flow: { id: fid, name, description, dsl, disabled }, screens }, null, 2)}\n`,
    );
    console.log(`exported flow: ${id}`);
  }
}
