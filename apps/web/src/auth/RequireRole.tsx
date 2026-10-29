import type { ReactNode } from "react";
import { Outlet } from "react-router";
import { useT } from "../i18n/messages";
import { useAuthz, useCurrentTenantId, useSessionHold } from "./useAuthz";

/**
 * Role-gated UI exemplar. Hides children (or an <Outlet/> when used as a layout route) unless the
 * user holds the role in the current tenant (or project-wide when the user has no tenants).
 * UI gating is for experience only; the API enforces the real check with permissions.
 */
export function RequireRole({
  role,
  children,
  fallback = <Forbidden role={role} />,
}: {
  role: string;
  children?: ReactNode;
  fallback?: ReactNode;
}) {
  const authz = useAuthz();
  const tenantId = useCurrentTenantId();
  // Session paused for re-auth: keep the page mounted; the API still refuses every call.
  const { paused } = useSessionHold();
  const allowed = paused || authz.hasRole(role, tenantId);
  if (!allowed) return <>{fallback}</>;
  return <>{children ?? <Outlet />}</>;
}

export function Forbidden({ role }: { role: string }) {
  const t = useT();
  return (
    <section data-testid="forbidden">
      <h2 className="text-xl font-semibold">{t.forbidden.title}</h2>
      <p className="mt-2 text-muted">
        {t.forbidden.body(t.forbidden.role(role))}
      </p>
    </section>
  );
}
