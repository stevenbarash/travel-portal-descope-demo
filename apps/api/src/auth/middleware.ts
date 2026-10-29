import type { ApiError } from "@kit/contracts";
import type { AuthenticationInfo, DescopeServer } from "@kit/descope/server";
import type { NextFunction, Request, RequestHandler, Response } from "express";

/** The subset of the facade the middleware needs; tests pass a fake. */
export type SessionValidator = Pick<
  DescopeServer,
  "validateSession" | "cookieNames"
>;

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
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    next();
  };
}
