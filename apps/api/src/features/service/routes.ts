import {
  type ApiError,
  AuditTrail,
  CustomerDetail,
  CustomerSearch,
  ImpersonationResult,
  KIT_PERMISSIONS,
} from "@kit/contracts";
import type { DescopeServer } from "@kit/descope/server";
import { type Response, Router } from "express";
import { requirePermissions, routeParam } from "../../auth/guards";
import { authOf, requireAuth } from "../../auth/middleware";
import type { BookingsRepo } from "../bookings/repo";
import { customerBookings } from "../bookings/routes";

/**
 * Customer service console (req 21). Project-level permissions, checked on every call:
 *  - User Admin: find a customer, read their bookings, family and audit trail;
 *  - Impersonate: see the account exactly as the customer does.
 * Both are Descope built-ins, held by the "Customer Service" role.
 */

/**
 * Payload of a JWT Descope just issued to us over the management API. Decoded, not verified: it
 * came straight from Descope over TLS and is only displayed, never accepted as a credential.
 */
function jwtClaims(jwt: string): Record<string, unknown> {
  const payload = jwt.split(".")[1];
  if (!payload) throw new Error("impersonation token is not a JWT");
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
}

function notConfigured(res: Response) {
  const body: ApiError = {
    error: "not_configured",
    message: "DESCOPE_MANAGEMENT_KEY is required for the customer service API",
  };
  res.status(503).json(body);
}

/** /api/service: the agent console. Each route names the one permission it needs. */
export function serviceRouter(descope: DescopeServer, repo: BookingsRepo) {
  const router = Router();
  router.use(requireAuth(descope));
  // Project-level permissions from the JWT (agents aren't in tenants). Read-only lookups and
  // impersonation are separate so a role can grant one without the other.
  const userAdmin = requirePermissions(descope, [KIT_PERMISSIONS.userAdmin]);
  const impersonate = requirePermissions(descope, [
    KIT_PERMISSIONS.impersonate,
  ]);
  router.use((_req, res, next) =>
    descope.hasManagementKey ? next() : notConfigured(res),
  );

  router.get("/customers", userAdmin, async (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    res.json(
      CustomerSearch.parse({ customers: await descope.searchCustomers(q) }),
    );
  });

  router.get("/customers/:userId", userAdmin, async (req, res) => {
    const customer = await descope.loadUser(routeParam(req, "userId") ?? "");
    res.json(
      CustomerDetail.parse({
        customer,
        bookings: await customerBookings(
          repo,
          descope,
          customer.userId,
          customer.loginId,
          customer.familyId,
        ),
        family: customer.familyId
          ? await descope.loadFamily(customer.familyId)
          : null,
      }),
    );
  });

  router.get("/customers/:userId/audit", userAdmin, async (req, res) => {
    res.json(
      AuditTrail.parse({
        entries: await descope.auditFor(routeParam(req, "userId") ?? ""),
      }),
    );
  });

  router.post(
    "/customers/:userId/impersonate",
    impersonate,
    async (req, res) => {
      // The agent from their own session, never the body: Descope records them as `act.sub` and in
      // the customer's audit trail.
      const agentId = authOf(req).token.sub ?? "";
      const customer = await descope.loadUser(routeParam(req, "userId") ?? "");
      const claims = jwtClaims(
        await descope.impersonate(agentId, customer.loginId),
      );
      // Defense in depth: impersonation goes by login ID, so confirm Descope issued the token for
      // the user we looked up before reading bookings as them.
      // The token itself stays server-side; the browser only sees its claims.
      const subject = typeof claims.sub === "string" ? claims.sub : "";
      if (subject !== customer.userId) {
        const body: ApiError = {
          error: "internal_error",
          message: "Impersonation token was issued for a different user",
        };
        res.status(502).json(body);
        return;
      }
      const act = claims.act as { sub?: unknown } | undefined;
      res.json(
        ImpersonationResult.parse({
          customer,
          // Read as the identity in the token: what this customer would see on My bookings.
          bookings: await customerBookings(
            repo,
            descope,
            subject,
            customer.loginId,
            customer.familyId,
          ),
          subject,
          actor: typeof act?.sub === "string" ? act.sub : undefined,
          issuedAt: typeof claims.iat === "number" ? claims.iat : undefined,
          claims,
        }),
      );
    },
  );

  return router;
}
