import type {
  ConnectorLookupRequest,
  ConnectorLookupResponse,
} from "@kit/contracts";

/**
 * Stand-in for the customer's own system of record (CRM, eligibility, billing). Rename the
 * fields to theirs; swap for a real client when the demo calls a real backend.
 */
export interface DirectoryEntry {
  email: string;
  customerId: string;
  plan: string;
  /** Present in their system but must not get an account (closed, fraud hold, …). */
  blocked?: boolean;
  /** When set, the flow must also send this ID for a match. */
  externalId?: string;
}

/** Fictional records. Anything else answers `no_match`. */
export const SAMPLE_DIRECTORY: readonly DirectoryEntry[] = [
  { email: "ada@example.com", customerId: "CUST-1001", plan: "Gold" },
  {
    email: "grace@example.com",
    customerId: "CUST-1002",
    plan: "Silver",
    externalId: "M-2002",
  },
  {
    email: "mallory@example.com",
    customerId: "CUST-1666",
    plan: "Gold",
    blocked: true,
  },
];

export function lookup(
  directory: readonly DirectoryEntry[],
  req: ConnectorLookupRequest,
): ConnectorLookupResponse {
  const entry = directory.find(
    (e) => e.email.toLowerCase() === req.email.toLowerCase(),
  );
  if (!entry || (entry.externalId && entry.externalId !== req.externalId))
    return { allowed: false, reason: "no_match" };
  if (entry.blocked) return { allowed: false, reason: "blocked" };
  return {
    allowed: true,
    reason: "match",
    customerId: entry.customerId,
    plan: entry.plan,
  };
}
