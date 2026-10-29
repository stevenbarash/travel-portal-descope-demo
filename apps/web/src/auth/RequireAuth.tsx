import { useSession, useUser } from "@descope/react-sdk";
import { useEffect, useRef } from "react";
import { Navigate, Outlet, useLocation } from "react-router";
import { useT } from "../i18n/messages";
import { ReauthDialog } from "./ReauthDialog";
import { SessionHoldContext, useCurrentTenantId } from "./useAuthz";

/**
 * Layout route: renders children only for an authenticated session.
 * - Never signed in on this page: send the user to /login and remember where they were going.
 * - Session ended while on the page (timeout, revocation): keep the page and everything typed
 *   into it, and sign in again in place with <ReauthDialog>.
 * Always gate on `isAuthenticated`, never on `sessionToken` (empty in cookie/HttpOnly modes).
 */
export function RequireAuth() {
  const { isAuthenticated, isSessionLoading } = useSession();
  const location = useLocation();
  const t = useT();
  const tenantId = useCurrentTenantId();
  const hadSession = useRef(false);
  // Re-auth into the tenant the user was in; under tenant user isolation it must match.
  const lastTenant = useRef<string | undefined>(undefined);
  // Prefill the dialog with who was signed in; the user object is gone once the session ends.
  const { user } = useUser();
  const lastLoginId = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!isAuthenticated) return;
    hadSession.current = true;
    if (tenantId) lastTenant.current = tenantId;
    if (user?.loginIds?.[0])
      lastLoginId.current = user.email || user.loginIds[0];
  }, [isAuthenticated, tenantId, user]);

  const paused = hadSession.current && !isAuthenticated;
  if (!paused) {
    if (isSessionLoading)
      return <p className="text-muted">{t.common.checkingSession}</p>;
    if (!isAuthenticated) {
      // A sign-in link that lands on a protected page carries ?t= (and ?el= for enchanted
      // links). Keep them top-level for /login to verify; nested in returnTo they'd be dead.
      const params = new URLSearchParams(location.search);
      const login = new URLSearchParams();
      for (const key of ["t", "el"]) {
        const value = params.get(key);
        if (value !== null) login.set(key, value);
        params.delete(key);
      }
      const rest = params.toString();
      login.set("returnTo", location.pathname + (rest ? `?${rest}` : ""));
      return <Navigate to={`/login?${login}`} replace />;
    }
  }
  // One element tree whether or not the dialog is open, so the page is never remounted: an earlier
  // version swapped trees and lost the half-typed form it was meant to keep.
  return (
    <SessionHoldContext.Provider
      value={{ paused, tenantId: lastTenant.current }}
    >
      <Outlet />
      {paused && (
        <ReauthDialog
          tenantId={lastTenant.current}
          loginHint={lastLoginId.current}
        />
      )}
    </SessionHoldContext.Provider>
  );
}
