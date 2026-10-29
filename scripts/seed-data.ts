/**
 * What `pnpm seed` creates in the Descope project named by .env, and what `pnpm reset` removes.
 * Names are plain (no prefix). Ownership is the `.kit-state/` ledger, not the name: seed never
 * modifies an existing resource, and refuses to reuse an existing role that lacks the permissions
 * listed here. Tenant names must be unique per project.
 * Test users never receive real emails/SMS; OTPs and magic links come from the management API.
 *
 * Each persona in TEST_USERS gets two accounts:
 *  - a Descope test user at its `loginId` (…@example.com), for Playwright and `pnpm otp`;
 *  - when DEMO_EMAIL is set in .env, a real user at `demoLoginId(loginId, DEMO_EMAIL)` (e.g.
 *    you+admin@example.net) that the presenter signs in as. Codes land in their inbox,
 *    and real users show up in Descope widgets, which hide test users.
 *
 * This is the single list. Slices that need more seed data add it here.
 */
export interface SeedTenantSso {
  /**
   * Email domain routed to the IdP. mocksaml.com only accepts example.com and example.org, and
   * the test users are on example.com, so SSO tenants use example.org. One tenant per domain.
   */
  domain: string;
  /** Tenant roles every SSO user gets (mocksaml sends no groups, so there is no group mapping). */
  defaultRoles: readonly string[];
}

export interface SeedTenant {
  id: string;
  name: string;
  /**
   * SAML SSO against the mocksaml.com stand-in IdP. Keep SSO tenants free of TEST_USERS: the
   * sign-in flow routes by tenant as well as by email domain, so a test user in an SSO tenant
   * would be sent to the IdP instead of getting an OTP.
   */
  sso?: SeedTenantSso;
}

/** mocksaml.com: a free SAML IdP. Any user @example.org (or .com), any password. */
export const MOCKSAML_METADATA_URL = "https://mocksaml.com/api/saml/metadata";

/** SAML attribute names mocksaml sends, mapped onto the Descope user. */
export const MOCKSAML_ATTRIBUTES = {
  email: "email",
  givenName: "firstName",
  familyName: "lastName",
} as const;

/**
 * The plus-addressed login for a persona's real demo user: the test user's local part becomes the
 * tag on DEMO_EMAIL. `demoLoginId("admin@example.com", "se@example.net")` → `se+admin@example.net`.
 */
export function demoLoginId(testLoginId: string, demoEmail: string): string {
  const persona = testLoginId.split("@")[0];
  const parts = demoEmail.trim().split("@");
  const [local, domain] = parts;
  if (!persona || !local || !domain || parts.length !== 2) {
    throw new Error(`DEMO_EMAIL must be a plain address, got "${demoEmail}"`);
  }
  // A DEMO_EMAIL that already carries a tag (se+demo@…) keeps it: se+demo-admin@…
  const sep = local.includes("+") ? "-" : "+";
  return `${local}${sep}${persona}@${domain}`.toLowerCase();
}

export interface SeedTenantMembership {
  tenantId: string;
  roles: readonly string[];
}

export interface SeedUser {
  loginId: string;
  displayName: string;
  /** Organization memberships (B2B). Empty for a consumer (B2C) account. */
  tenants: readonly SeedTenantMembership[];
  /** Project-level roles: only meaningful when `tenants` is empty. */
  roles?: readonly string[];
  /** FGA relations with this user as the target (only used when descope/fga/schema.dsl exists). */
  relations?: readonly {
    resourceType: string;
    resource: string;
    relation: string;
  }[];
}

/**
 * Descope's built-in permissions, held by the project's existing "Customer Service" role (created
 * through MCP before this repo existed). Seed finds both and leaves them alone.
 */
export const PERMISSIONS = [
  { name: "User Admin", description: "Manage users" },
  { name: "Impersonate", description: "Impersonate users" },
  {
    name: "Family Impersonate Dependents",
    description: "Act on behalf of a dependent in your family",
  },
] as const;

/**
 * Seed reuses the project's existing "Customer Service" role: it holds both permissions, so the
 * plan preserves it rather than conflicting. Travel Portal customers need no role at all.
 */
export const ROLES = [
  {
    name: "Customer Service",
    description: "Find customers, view their bookings, impersonate (req 21)",
    permissions: ["User Admin", "Impersonate"],
  },
  {
    name: "Family Admin",
    description: "Guardian: manage the family's dependents and act for them",
    permissions: ["Family Impersonate Dependents"],
  },
] as const;

/** B2C only: Travel Portal has no organizations and no SSO. */
export const TENANTS: readonly SeedTenant[] = [];

/** Tenants seed configures SAML SSO on (mocksaml). */
export const SSO_TENANTS = TENANTS.filter(
  (t): t is SeedTenant & { sso: SeedTenantSso } => !!t.sso,
);

/**
 * A returning Travel Portal customer: personal account, no roles. The bookings API gives this persona
 * (and its plus-addressed demo login) three past/upcoming breaks — see `isReturningGuest`.
 */
export const GUEST_USER: SeedUser = {
  loginId: "guest@example.com",
  displayName: "Gemma Guest",
  tenants: [],
  roles: [],
};

/** Travel Portal customer service: finds customers, views their bookings, impersonates. */
export const AGENT_USER: SeedUser = {
  loginId: "agent@example.com",
  displayName: "Alex Agent",
  tenants: [],
  roles: ["Customer Service"],
};

/** Gemma's partner: a second guardian in the Guest family (independent guardianship). */
export const PARTNER_USER: SeedUser = {
  loginId: "partner@example.com",
  displayName: "Sam Guest",
  tenants: [],
  roles: [],
};

export const TEST_USERS: readonly SeedUser[] = [
  GUEST_USER,
  PARTNER_USER,
  AGENT_USER,
];

// ---- Family Accounts (household: guardians who log in, dependents who don't) ----

/**
 * Family role every guardian holds in their family. It already exists in the project (created in
 * the console) with "Family Impersonate Dependents", so seed only checks it and never edits it.
 */
export const FAMILY_ROLE = "Family Admin";
export const FAMILY_PERMISSION = "Family Impersonate Dependents";

/** Family-scoped user attributes: a guardian is "Mum" in one family, maybe "Gran" in another. */
export const FAMILY_SCOPED_ATTRIBUTES = [
  // Descope attribute type 1 = text.
  { name: "relationship", displayName: "Relationship", type: 1 },
] as const;

export interface SeedDependent {
  /** Login-ID suffix: the dependent's login ID is `<familyId>-<key>` (never an email). */
  key: string;
  name: string;
  relationship: string;
}

export interface SeedFamily {
  id: string;
  name: string;
  /** Guardians by test-user login ID, with their relationship in this family. */
  guardians: readonly { loginId: string; relationship: string }[];
  dependents: readonly SeedDependent[];
}

/**
 * The returning guest's household. Users may belong to one family in this project, so the
 * `@example.com` test personas (e2e) and the presenter's plus-addressed demo logins each get their own
 * copy: see `familiesFor`.
 */
export const GUEST_FAMILY: SeedFamily = {
  id: "guest-family",
  name: "The Guest family",
  guardians: [
    { loginId: GUEST_USER.loginId, relationship: "Mum" },
    { loginId: PARTNER_USER.loginId, relationship: "Dad" },
  ],
  dependents: [
    { key: "mia", name: "Mia Guest", relationship: "Daughter" },
    { key: "leo", name: "Leo Guest", relationship: "Son" },
    { key: "biscuit", name: "Biscuit", relationship: "Dog" },
  ],
};

/** A family as seed creates it: guardians resolved to the login IDs of one account set. */
export interface ResolvedFamily extends SeedFamily {
  /** "users" (test personas) or "demoUsers" (plus-addressed live logins). */
  accounts: "users" | "demoUsers";
}

export const dependentLoginId = (familyId: string, key: string) =>
  `${familyId}-${key}`;

/** The test-persona family, plus a live-demo twin when DEMO_EMAIL is set. */
export function familiesFor(demoEmail?: string): ResolvedFamily[] {
  const test: ResolvedFamily = { ...GUEST_FAMILY, accounts: "users" };
  if (!demoEmail) return [test];
  return [
    test,
    {
      ...GUEST_FAMILY,
      id: `${GUEST_FAMILY.id}-demo`,
      name: `${GUEST_FAMILY.name} (live demo)`,
      accounts: "demoUsers",
      guardians: GUEST_FAMILY.guardians.map((g) => ({
        ...g,
        loginId: demoLoginId(g.loginId, demoEmail),
      })),
    },
  ];
}

/**
 * FGA relations between resources (not users), e.g. `folder:reports#parent@folder:root`. Only used
 * when descope/fga/schema.dsl exists. User relations go on each SeedUser's `relations`.
 */
export const FGA_RELATIONS: readonly {
  resourceType: string;
  resource: string;
  relation: string;
  targetType: string;
  target: string;
}[] = [];
