import type { AuthenticationInfo } from "@kit/descope/server";

declare global {
  namespace Express {
    interface Request {
      /** Set by requireAuth. Present on every route mounted behind it. */
      auth?: AuthenticationInfo;
    }
  }
}
