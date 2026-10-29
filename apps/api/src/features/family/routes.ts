import {
  AddDependent,
  type ApiError,
  DependentSession,
  KIT_PERMISSIONS,
  MyFamily,
} from "@kit/contracts";
import type { DescopeServer } from "@kit/descope/server";
import { type Request, type Response, Router } from "express";
import {
  familyIdOf,
  requireFamilyPermissions,
  routeParam,
} from "../../auth/guards";
import { authOf, requireAuth } from "../../auth/middleware";
import type { BookingsRepo } from "../bookings/repo";
import { scopeOfFamily } from "../bookings/routes";

/**
 * Family slice, API side (Descope Family Accounts). One household, many people:
 *  - guardians log in with their own identity (Gemma, Sam) and hold the "Family Admin" family role;
 *  - dependents (children, a dog) are profiles with no credentials, reached only through a guardian.
 * The family comes from the session's `families` claim; managing dependents needs the guardian's
 * "Family Impersonate Dependents" family permission, and Descope checks it again on act-for.
 */

/**
 * Payload of a JWT Descope just issued to us over the management API. Decoded, not verified: it
 * came straight from Descope over TLS and is only displayed, never accepted as a credential.
 */
function jwtClaims(jwt: string): Record<string, unknown> {
  const payload = jwt.split(".")[1];
  if (!payload) throw new Error("dependent token is not a JWT");
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
}

function fail(res: Response, status: number, body: ApiError) {
  res.status(status).json(body);
}

/** /api/family: read your family; guardians also add, remove and act for dependents. */
export function familyRouter(descope: DescopeServer, repo: BookingsRepo) {
  const router = Router();
  router.use(requireAuth(descope));
  // After requireAuth, so a missing key never hides a 401. Every route here loads the family
  // through the management API.
  router.use((_req, res, next) =>
    descope.hasManagementKey
      ? next()
      : fail(res, 503, {
          error: "not_configured",
          message: "DESCOPE_MANAGEMENT_KEY is required for the family API",
        }),
  );
  const guardian = requireFamilyPermissions(descope, [
    KIT_PERMISSIONS.familyImpersonateDependents,
  ]);

  /** The caller's family and the dependent named by :userId, or a 404 already sent. */
  async function dependentOf(req: Request, res: Response) {
    // Only called behind `guardian`, which has already proved the caller has a family.
    const familyId = familyIdOf(descope, req) as string;
    const family = await descope.loadFamily(familyId);
    const member = family?.members.find(
      (m) => m.userId === routeParam(req, "userId"),
    );
    // Restricting to dependents means one guardian can never delete or act as another guardian;
    // a user outside the family looks the same as a nonexistent one.
    if (!family || !member?.dependent) {
      fail(res, 404, {
        error: "not_found",
        message: "No such dependent in your family",
      });
      return undefined;
    }
    return { family, dependent: member };
  }

  // Any signed-in customer: their own family (or null) and whether the UI should offer guardian
  // actions. `canManage` is a UI hint only; the guardian guard enforces it on each write.
  router.get("/", async (req, res) => {
    const familyId = familyIdOf(descope, req);
    const claims = familyId
      ? descope.familiesOf(authOf(req))[familyId]
      : undefined;
    res.json(
      MyFamily.parse({
        family: familyId ? await descope.loadFamily(familyId) : null,
        roles: claims?.roles ?? [],
        canManage:
          claims?.permissions.includes(
            KIT_PERMISSIONS.familyImpersonateDependents,
          ) ?? false,
      }),
    );
  });

  router.post("/dependents", guardian, async (req, res) => {
    const input = AddDependent.safeParse(req.body);
    if (!input.success) {
      fail(res, 400, {
        error: "bad_request",
        message: input.error.issues.map((i) => i.message).join("; "),
      });
      return;
    }
    // Always the caller's own family from the JWT, never one named in the body.
    const familyId = familyIdOf(descope, req) as string;
    res
      .status(201)
      .json(
        await descope.createDependent(
          familyId,
          input.data.name,
          input.data.relationship,
        ),
      );
  });

  router.delete("/dependents/:userId", guardian, async (req, res) => {
    const found = await dependentOf(req, res);
    if (!found) return;
    await descope.deleteDependent(found.dependent.userId);
    res.status(204).end();
  });

  /** Act for a dependent: a Descope-issued token for them, naming the guardian in `act`. */
  router.post("/dependents/:userId/act", guardian, async (req, res) => {
    const found = await dependentOf(req, res);
    if (!found) return;
    const { family, dependent } = found;
    const claims = jwtClaims(
      await descope.actForDependent(
        authOf(req).token.sub ?? "",
        dependent.loginId,
        family.id,
      ),
    );
    // Defense in depth: never show data under a token issued for someone other than the dependent.
    // The token itself stays server-side; the browser only sees its claims.
    const subject = typeof claims.sub === "string" ? claims.sub : "";
    if (subject !== dependent.userId) {
      fail(res, 502, {
        error: "internal_error",
        message: "Dependent token was issued for a different user",
      });
      return;
    }
    const act = claims.act as { sub?: unknown } | undefined;
    // Read as the dependent: the family's breaks they're on.
    const bookings = (await repo.list(scopeOfFamily(family.id))).filter((b) =>
      b.party?.some((p) => p.userId === subject),
    );
    res.json(
      DependentSession.parse({
        dependent,
        subject,
        actor: typeof act?.sub === "string" ? act.sub : undefined,
        familyId: typeof claims.dcf === "string" ? claims.dcf : undefined,
        bookings,
        claims,
      }),
    );
  });

  return router;
}
