import { z } from "zod";

/** Shared API contracts. Both apps import from here; never redefine shapes locally. */

export const HealthResponse = z.object({
  ok: z.literal(true),
  service: z.string(),
  time: z.iso.datetime(),
});
export type HealthResponse = z.infer<typeof HealthResponse>;

export const ApiErrorCode = z.enum([
  "unauthenticated",
  "forbidden",
  "step_up_required",
  "not_configured",
  "bad_request",
  "not_found",
  "internal_error",
]);
export type ApiErrorCode = z.infer<typeof ApiErrorCode>;

/** Every non-2xx body. `error` is machine-readable; `message` is for humans and demos. */
export const ApiError = z.object({
  error: ApiErrorCode,
  message: z.string().optional(),
});
export type ApiError = z.infer<typeof ApiError>;

/** Per-tenant authorization carried in the session JWT. */
export const TenantClaims = z.object({
  roles: z.array(z.string()).default([]),
  permissions: z.array(z.string()).default([]),
});
export type TenantClaims = z.infer<typeof TenantClaims>;

/**
 * Normalized view of a validated Descope session, returned by GET /api/whoami.
 * `claims` is the raw token for the debug drawer; the other fields are the stable shape
 * the app should code against.
 */
export const WhoAmI = z.object({
  userId: z.string(),
  issuer: z.string().optional(),
  issuedAt: z.number().optional(),
  expiresAt: z.number().optional(),
  roles: z.array(z.string()),
  permissions: z.array(z.string()),
  tenants: z.record(z.string(), TenantClaims),
  currentTenant: z.string().optional(),
  custom: z.record(z.string(), z.unknown()),
  claims: z.record(z.string(), z.unknown()),
});
export type WhoAmI = z.infer<typeof WhoAmI>;

// ---- connectors (called by a Descope HTTP connector inside a flow, not by the browser) ----
/** POST /api/connectors/lookup — "is this person in our system?" during sign-up or sign-in. */
export const ConnectorLookupRequest = z.object({
  email: z.email(),
  /** Optional customer-side identifier the flow collected (member ID, account number, …). */
  externalId: z.string().min(1).max(64).optional(),
});
export type ConnectorLookupRequest = z.infer<typeof ConnectorLookupRequest>;

/** A decision the flow branches on (`<resultPath>.allowed`, `<resultPath>.reason`). */
export const ConnectorLookupResponse = z.object({
  allowed: z.boolean(),
  reason: z.enum(["match", "no_match", "blocked"]),
  customerId: z.string().optional(),
  plan: z.string().optional(),
});
export type ConnectorLookupResponse = z.infer<typeof ConnectorLookupResponse>;

/** Permission names the kit seeds. Slices reference these instead of string literals. */
export const KIT_PERMISSIONS = {
  /** Descope built-in: search and read customer accounts (customer service console). */
  userAdmin: "User Admin",
  /** Descope built-in: sign in as a customer to see what they see (management.user.impersonate). */
  impersonate: "Impersonate",
  /** Descope Family Accounts: a guardian acts on behalf of a dependent in their family. */
  familyImpersonateDependents: "Family Impersonate Dependents",
} as const;
export const KIT_ROLES = {
  /** Project-level role for the customer service team. */
  customerService: "Customer Service",
  /** Family role: a guardian in a Descope family (manages dependents, acts for them). */
  familyAdmin: "Family Admin",
} as const;

// ---- bookings (the domain entity) ----
/** Destinations the demo books into. */
export const DESTINATIONS = [
  { id: "santorini", name: "Santorini", region: "Greece" },
  { id: "lisbon", name: "Lisbon", region: "Portugal" },
  { id: "kyoto", name: "Kyoto", region: "Japan" },
  { id: "cape-town", name: "Cape Town", region: "South Africa" },
  { id: "banff", name: "Banff", region: "Canada" },
] as const;
export const DestinationId = z.enum(
  DESTINATIONS.map((p) => p.id) as [string, ...string[]],
);
export type DestinationId = z.infer<typeof DestinationId>;
export const destinationName = (id: string) =>
  DESTINATIONS.find((p) => p.id === id)?.name ?? id;

export const Accommodation = z.enum(["hotel", "apartment"]);
export type Accommodation = z.infer<typeof Accommodation>;

export const BookingStatus = z.enum(["upcoming", "cancelled"]);
export type BookingStatus = z.infer<typeof BookingStatus>;

/** Someone on the break, from the customer's Descope family: a guardian or a dependent. */
export const PartyMember = z.object({ userId: z.string(), name: z.string() });
export type PartyMember = z.infer<typeof PartyMember>;

/**
 * A trip to a destination. Bookings live in a *scope*: `family:<familyId>` when the customer is in a
 * Descope family (every guardian sees the household's breaks), else `user:<userId>`. The scope is decided by the API from the validated session, never taken from the client.
 */
export const Booking = z.object({
  id: z.string(),
  reference: z.string(),
  scope: z.string(),
  destination: DestinationId,
  accommodation: Accommodation,
  /** Arrival date, YYYY-MM-DD. */
  arrival: z.iso.date(),
  nights: z.number().int().min(1).max(14),
  guests: z.number().int().min(1).max(8),
  /** Who's coming, when the booker picked family members. Resolved by the API, never trusted. */
  party: z.array(PartyMember).optional(),
  status: BookingStatus,
  createdBy: z.string(),
  createdAt: z.iso.datetime(),
});
export type Booking = z.infer<typeof Booking>;

export const BookingList = z.object({
  scope: z.string(),
  bookings: z.array(Booking),
});
export type BookingList = z.infer<typeof BookingList>;

/** The holiday part of a booking: what the "Book a break" form collects before sign-in. */
export const CreateBooking = z.object({
  destination: DestinationId,
  accommodation: Accommodation,
  arrival: z.iso.date(),
  nights: z.number().int().min(1).max(14),
  guests: z.number().int().min(1).max(8),
  /** Family members coming along (user IDs). The API checks each one is in the booker's family. */
  partyIds: z.array(z.string()).max(8).optional(),
});
export type CreateBooking = z.infer<typeof CreateBooking>;

export const UpdateBooking = z.object({ status: BookingStatus });
export type UpdateBooking = z.infer<typeof UpdateBooking>;

// ---- family (Descope Family Accounts) ----
export const FamilyMember = z.object({
  userId: z.string(),
  loginId: z.string(),
  name: z.string().optional(),
  email: z.string().optional(),
  /** A dependent profile: no credentials, no login; reachable only through a guardian. */
  dependent: z.boolean(),
  /** Family roles (e.g. "Family Admin" for a guardian). Empty for dependents. */
  roles: z.array(z.string()),
  /** Family-scoped attribute: "Mum" here, maybe "Gran" in another family. */
  relationship: z.string().optional(),
});
export type FamilyMember = z.infer<typeof FamilyMember>;

export const Family = z.object({
  id: z.string(),
  name: z.string(),
  members: z.array(FamilyMember),
});
export type Family = z.infer<typeof Family>;

/** GET /api/family — the signed-in customer's family, from the `families` claim. */
export const MyFamily = z.object({
  family: Family.nullable(),
  /** The caller's family roles and whether they may manage and act for dependents. */
  roles: z.array(z.string()),
  canManage: z.boolean(),
});
export type MyFamily = z.infer<typeof MyFamily>;

/** POST /api/family/dependents — a guardian adds a child, a grandparent, a pet… */
export const AddDependent = z.object({
  name: z.string().trim().min(1).max(60),
  relationship: z.string().trim().min(1).max(40),
});
export type AddDependent = z.infer<typeof AddDependent>;

/**
 * POST /api/family/dependents/:userId/act — Descope issues a token for the dependent with the
 * guardian in `act` and the family in `dcf`. The API reads the dependent's breaks as that identity.
 */
export const DependentSession = z.object({
  dependent: FamilyMember,
  subject: z.string(),
  actor: z.string().optional(),
  familyId: z.string().optional(),
  bookings: z.array(Booking),
  claims: z.record(z.string(), z.unknown()),
});
export type DependentSession = z.infer<typeof DependentSession>;

// ---- customer service console ----
export const Customer = z.object({
  userId: z.string(),
  loginId: z.string(),
  email: z.string().optional(),
  name: z.string().optional(),
  status: z.string(),
  /** Sign-in methods on the account (passkey, password, authenticator app, social). */
  methods: z.array(z.string()),
  createdAt: z.iso.datetime().optional(),
  /** The Descope family the customer belongs to (this project allows one per user). */
  familyId: z.string().optional(),
});
export type Customer = z.infer<typeof Customer>;

/** GET /api/service/customers?q= — needs User Admin. */
export const CustomerSearch = z.object({ customers: z.array(Customer) });
export type CustomerSearch = z.infer<typeof CustomerSearch>;

/** GET /api/service/customers/:userId — the customer and their bookings. Needs User Admin. */
export const CustomerDetail = z.object({
  customer: Customer,
  bookings: z.array(Booking),
  /** The customer's Descope family, if they're in one. */
  family: Family.nullable(),
});
export type CustomerDetail = z.infer<typeof CustomerDetail>;

/**
 * POST /api/service/customers/:userId/impersonate — needs Impersonate. Descope issues a token for
 * the customer that names the agent in its `act` claim; the API reads bookings as that identity.
 */
export const ImpersonationResult = z.object({
  customer: Customer,
  bookings: z.array(Booking),
  /** Who the token is for (the customer) and who is acting (the agent). */
  subject: z.string(),
  actor: z.string().optional(),
  issuedAt: z.number().optional(),
  claims: z.record(z.string(), z.unknown()),
});
export type ImpersonationResult = z.infer<typeof ImpersonationResult>;

export const AuditEntry = z.object({
  occurred: z.iso.datetime(),
  action: z.string(),
  method: z.string().optional(),
  device: z.string().optional(),
  geo: z.string().optional(),
  actorId: z.string().optional(),
});
export type AuditEntry = z.infer<typeof AuditEntry>;

/** GET /api/service/customers/:userId/audit — last 30 days. Needs User Admin. */
export const AuditTrail = z.object({ entries: z.array(AuditEntry) });
export type AuditTrail = z.infer<typeof AuditTrail>;
