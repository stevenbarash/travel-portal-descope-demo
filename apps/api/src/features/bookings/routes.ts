import {
  type ApiError,
  BookingList,
  CreateBooking,
  type Family,
  type FamilyMember,
  type PartyMember,
  UpdateBooking,
} from "@kit/contracts";
import type { DescopeServer } from "@kit/descope/server";
import { type Request, type Response, Router } from "express";
import type { z } from "zod";
import { familyIdOf, routeParam } from "../../auth/guards";
import { authOf, requireAuth } from "../../auth/middleware";
import type { BookingsRepo } from "./repo";

/**
 * Bookings slice, API side. A customer's bookings live in a scope the API derives from the
 * validated JWT, never the body or the URL:
 *  - `family:<familyId>` when the session's `families` claim puts them in a Descope family, so
 *    every guardian (Gemma and Sam) sees, books and cancels the household's breaks;
 *  - `user:<sub>` otherwise.
 */

export const scopeOfUser = (userId: string) => `user:${userId}`;
export const scopeOfFamily = (familyId: string) => `family:${familyId}`;
export const bookingScope = (userId: string, familyId: string | undefined) =>
  familyId ? scopeOfFamily(familyId) : scopeOfUser(userId);

/**
 * The seeded household is a returning customer with booking history: `guest@example.com`, their
 * partner `partner@example.com`, and the presenter's plus-addressed demo logins (`you+guest@…`,
 * `you+partner@…`). Everyone else starts with no bookings.
 */
export function isReturningGuest(loginId: string | undefined): boolean {
  const local = loginId?.toLowerCase().split("@")[0] ?? "";
  return /^(guest|partner)$/.test(local) || /[+-](guest|partner)$/.test(local);
}

/** Who was on the household's past and upcoming breaks: everyone, or just the grown-ups. */
function sampleParties(family: Family | null): PartyMember[][] | undefined {
  if (!family) return undefined;
  const all = family.members.map((m) => ({
    userId: m.userId,
    name: m.name ?? m.loginId,
  }));
  const adults = family.members
    .filter((m) => !m.dependent)
    .map((m) => ({ userId: m.userId, name: m.name ?? m.loginId }));
  return [all, all, adults];
}

/** List a customer's bookings, giving the returning household their history first. */
export async function customerBookings(
  repo: BookingsRepo,
  descope: DescopeServer,
  userId: string,
  loginId: string | undefined,
  familyId: string | undefined,
) {
  const scope = bookingScope(userId, familyId);
  if (isReturningGuest(loginId) && !(await repo.hasSamples(scope)))
    await repo.ensureSamples(
      scope,
      sampleParties(familyId ? await descope.loadFamily(familyId) : null),
    );
  return repo.list(scope);
}

function parseBody<T extends z.ZodType>(
  schema: T,
  req: Request,
  res: Response,
): z.output<T> | undefined {
  const result = schema.safeParse(req.body);
  if (result.success) return result.data;
  const body: ApiError = {
    error: "bad_request",
    message: result.error.issues
      .map((i) => `${i.path.join(".") || "body"}: ${i.message}`)
      .join("; "),
  };
  res.status(400).json(body);
  return undefined;
}

/** The signed-in customer's (or their family's) bookings. */
export function bookingsRouter(descope: DescopeServer, repo: BookingsRepo) {
  const router = Router();
  router.use(requireAuth(descope));
  // Login IDs by user, so the returning-guest check costs one management call per customer.
  const loginIds = new Map<string, string | undefined>();
  async function loginIdOf(userId: string) {
    if (!loginIds.has(userId)) {
      const loginId = descope.hasManagementKey
        ? (await descope.loadUser(userId).catch(() => undefined))?.loginId
        : undefined;
      loginIds.set(userId, loginId);
    }
    return loginIds.get(userId);
  }
  const userOf = (req: Request) => authOf(req).token.sub ?? "unknown";
  const scopeOf = (req: Request) =>
    bookingScope(userOf(req), familyIdOf(descope, req));
  const list = async (req: Request) =>
    customerBookings(
      repo,
      descope,
      userOf(req),
      await loginIdOf(userOf(req)),
      familyIdOf(descope, req),
    );

  router.get("/", async (req, res) => {
    res.json(
      BookingList.parse({ scope: scopeOf(req), bookings: await list(req) }),
    );
  });

  router.post("/", async (req, res) => {
    const input = parseBody(CreateBooking, req, res);
    if (!input) return;
    const { partyIds, ...holiday } = input;
    // History first, so a returning guest's new booking lands next to their old ones.
    await list(req);
    let party: PartyMember[] | undefined;
    if (partyIds?.length) {
      // Only people in the caller's own family, as Descope has them: never names from the body.
      const familyId = familyIdOf(descope, req);
      const family = familyId ? await descope.loadFamily(familyId) : null;
      const members = new Map(family?.members.map((m) => [m.userId, m]));
      const unknown = partyIds.filter((id) => !members.has(id));
      if (!family || unknown.length) {
        const body: ApiError = {
          error: "bad_request",
          message: "partyIds: everyone on the break must be in your family",
        };
        res.status(400).json(body);
        return;
      }
      party = [...new Set(partyIds)].map((id) => {
        const m = members.get(id) as FamilyMember;
        return { userId: m.userId, name: m.name ?? m.loginId };
      });
    }
    res
      .status(201)
      .json(
        await repo.create(
          scopeOf(req),
          party ? { ...holiday, guests: party.length, party } : holiday,
          userOf(req),
        ),
      );
  });

  router.patch("/:id", async (req, res) => {
    const patch = parseBody(UpdateBooking, req, res);
    if (!patch) return;
    const booking = await repo.update(
      scopeOf(req),
      routeParam(req, "id") ?? "",
      patch,
    );
    if (!booking) {
      const body: ApiError = { error: "not_found" };
      res.status(404).json(body);
      return;
    }
    res.json(booking);
  });

  return router;
}
