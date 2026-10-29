import type { ApiError } from "@kit/contracts";
import type { AuthenticationInfo, DescopeServer } from "@kit/descope/server";
import type { NextFunction, Request, RequestHandler, Response } from "express";

/** The subset of the facade the middleware needs; tests pass a fake. */
export type SessionValidator = Pick<
  DescopeServer,
  "validateSession" | "cookieNames"
>;

/** The JWT from `Authorization: Bearer <jwt>` (scheme is case-insensitive per RFC 6750). */
function bearerToken(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (!header) return undefined;
  const [scheme, token] = header.split(" ");
  return scheme?.toLowerCase() === "bearer" && token ? token : undefined;
}

/**
 * Accepts the session token from `Authorization: Bearer <jwt>` (header mode) or the
 * `DS` cookie (cookie mode), validates it with Descope, and attaches the result to `req.auth`.
 */
export function requireAuth(descope: SessionValidator): RequestHandler {
  return async (req, res, next) => {
    // The header wins: an explicit token is what the caller meant, a cookie may be stale.
    const token =
      bearerToken(req) ?? req.cookies?.[descope.cookieNames.session];
    if (!token) {
      const body: ApiError = {
        error: "unauthenticated",
        message: "Missing session token",
      };
      res.status(401).json(body);
      return;
    }
    // Signature and expiry only (keys are cached by the SDK). Authorization is the guards' job.
    // The SDK's reason is dropped on purpose: the client only needs to know to re-authenticate.
    try {
      req.auth = await descope.validateSession(token);
    } catch {
      const body: ApiError = {
        error: "unauthenticated",
        message: "Invalid or expired session token",
      };
      res.status(401).json(body);
      return;
    }
    next();
  };
}

/** Narrowing helper for handlers behind requireAuth. Throws if misused. */
export function authOf(req: Request): AuthenticationInfo {
  if (!req.auth)
    throw new Error("authOf() called on a route not behind requireAuth");
  return req.auth;
}

/** Minimal CORS for web apps on other origins (not needed behind the Vite proxy). */
export function cors(allowedOrigins: readonly string[]): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    // Echo the exact origin from an allow-list: credentialed requests (cookie mode) can't use "*".
    if (origin && allowedOrigins.includes(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Authorization, Content-Type",
      );
      res.setHeader(
        "Access-Control-Allow-Methods",
        "GET,POST,PUT,PATCH,DELETE,OPTIONS",
      );
      res.setHeader("Vary", "Origin");
    }
    // Preflights end here for any origin; without the allow headers above the browser blocks it.
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    next();
  };
}
