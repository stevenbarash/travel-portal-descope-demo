import type { ApiError } from "@kit/contracts";
import type { DescopeServer } from "@kit/descope/server";
import type { Request, RequestHandler, Response } from "express";
import { authOf } from "./middleware";

/** Express 5 types params as string | string[]; routes here never repeat a param. */
export function routeParam(req: Request, name: string): string | undefined {
  const v = req.params[name];
  return Array.isArray(v) ? v[0] : v;
}

/**
 * Authorization guards. All mount AFTER requireAuth. They read the validated JWT only — no
 * network — so they are cheap to stack. Prefer permissions over roles: roles change per customer,
 * permissions describe what the code actually needs.
 */

function forbid(res: Response, message: string) {
  const body: ApiError = { error: "forbidden", message };
  res.status(403).json(body);
}

/** Project-level permissions (users without tenants). */
export function requirePermissions(
  descope: DescopeServer,
  permissions: string[],
): RequestHandler {
  return (req, res, next) => {
    if (!descope.hasPermissions(authOf(req), permissions)) {
      forbid(res, `Missing permission: ${permissions.join(", ")}`);
      return;
    }
    next();
  };
}

/** The caller must belong to the tenant named by the route param. */
export function requireTenantMember(param = "tenantId"): RequestHandler {
  return (req, res, next) => {
    const tenantId = routeParam(req, param);
    if (!tenantId) {
      const body: ApiError = {
        error: "bad_request",
        message: `Missing :${param}`,
      };
      res.status(400).json(body);
      return;
    }
    // Membership comes from the signed `tenants` claim, never the request. Object.hasOwn so a
    // param like "constructor" or "__proto__" can't match an inherited key.
    const tenants =
      (authOf(req).token as { tenants?: Record<string, unknown> }).tenants ??
      {};
    if (!Object.hasOwn(tenants, tenantId)) {
      forbid(res, `Not a member of tenant ${tenantId}`);
      return;
    }
    next();
  };
}

/** The caller must hold every listed permission within the tenant named by the route param. */
export function requireTenantPermissions(
  descope: DescopeServer,
  permissions: string[],
  param = "tenantId",
): RequestHandler {
  const member = requireTenantMember(param);
  return (req, res, next) => {
    // Membership first, so a non-member gets "not a member" rather than a misleading permission error.
    member(req, res, (err?: unknown) => {
      if (err) return next(err);
      const tenantId = routeParam(req, param) as string;
      if (!descope.hasTenantPermissions(authOf(req), tenantId, permissions)) {
        forbid(
          res,
          `Missing permission in tenant ${tenantId}: ${permissions.join(", ")}`,
        );
        return;
      }
      next();
    });
  };
}

/**
 * The session must be stepped up (Descope sets `su` after the step-up flow).
 * Returns a distinct error code so the web app can open the step-up flow and retry.
 */
export function requireStepUp(descope: DescopeServer): RequestHandler {
  return (req, res, next) => {
    if (!descope.isSteppedUp(authOf(req))) {
      const body: ApiError = {
        error: "step_up_required",
        message: "This action requires recent re-authentication",
      };
      res.status(403).json(body);
      return;
    }
    next();
  };
}

/**
 * The caller's Descope family, from the session's `families` claim. This project allows one
 * family per user, so it's the only key; undefined for a customer without a family.
 */
export function familyIdOf(
  descope: DescopeServer,
  req: Request,
): string | undefined {
  return Object.keys(descope.familiesOf(authOf(req)))[0];
}

/** The caller must hold every listed permission in their family (e.g. a guardian's). */
export function requireFamilyPermissions(
  descope: DescopeServer,
  permissions: string[],
): RequestHandler {
  return (req, res, next) => {
    // Family permissions live under `families.<id>`, separate from project and tenant permissions,
    // so requirePermissions would never see them.
    const familyId = familyIdOf(descope, req);
    const held = familyId
      ? (descope.familiesOf(authOf(req))[familyId]?.permissions ?? [])
      : [];
    if (!familyId || !permissions.every((p) => held.includes(p))) {
      forbid(res, `Missing family permission: ${permissions.join(", ")}`);
      return;
    }
    next();
  };
}
