import { useSession } from "@descope/react-sdk";
import { createContext, useContext, useMemo } from "react";
import { type Authz, authzFromClaims, decodeJwtPayload } from "./authz";

/**
 * Authorization facts for the current session. Prefers the session JWT payload (complete: roles,
 * permissions, tenants, dct, su) and falls back to the SDK's `claims` subset when the token is not
 * readable client-side (HttpOnly cookie mode). Re-computes when either changes.
 */
export function useAuthz(): Authz {
  const { claims, sessionToken } = useSession();
  return useMemo(
    () =>
      authzFromClaims({
        // Token payload spreads last so its complete claims win over the partial SDK copy.
        ...((claims as Record<string, unknown> | undefined) ?? {}),
        ...decodeJwtPayload(sessionToken),
      }),
    [claims, sessionToken],
  );
}

/**
 * Set by RequireAuth while its re-auth dialog is open: the session ended on this page, and this is
 * the tenant the page was using. Tenant-scoped pages keep their scope (and their state) instead of
 * remounting as "no tenant", and role gates stay open until the user signs back in.
 */
export const SessionHoldContext = createContext<{
  paused: boolean;
  tenantId?: string;
}>({ paused: false });

/** Read the hold set by RequireAuth; `{ paused: false }` outside it. */
export function useSessionHold() {
  return useContext(SessionHoldContext);
}

/** The tenant the UI should act on: the JWT's current tenant, else the user's first tenant. */
export function useCurrentTenantId(): string | undefined {
  const { currentTenant, tenants } = useAuthz();
  const held = useSessionHold();
  // The held tenant is last: it only matters once the session (and so its claims) is gone.
  return currentTenant ?? Object.keys(tenants)[0] ?? held.tenantId;
}
