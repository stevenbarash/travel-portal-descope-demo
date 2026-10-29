import { managementClient } from "./lib/descope";
import {
  CUSTOMER_FLOW_PREFIX,
  CUSTOMER_FLOWS_DIR,
  exportKitFlows,
} from "./lib/flows";

/**
 * `pnpm flows:export`: write the project's current demo-* flows back into descope/flows, and a
 * copy of Travel Portal's own tp-* flows into descope/customer-flows (never imported by seed).
 */
const { descope } = managementClient();
await exportKitFlows(descope);
await exportKitFlows(descope, CUSTOMER_FLOW_PREFIX, CUSTOMER_FLOWS_DIR);
