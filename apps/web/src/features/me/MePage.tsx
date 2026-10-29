import { UserProfile, useUser } from "@descope/react-sdk";
import { WhoAmI } from "@kit/contracts";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { ApiRequestError, apiGet } from "../../api/client";
import { PageHeader } from "../../app/ui";
import { useAuthConfig } from "../../auth/AuthProvider";
import { INTL_LOCALE, useLocale } from "../../i18n/locale";
import { useT } from "../../i18n/messages";
import { personalDataClaims } from "./tokenClaims";

/**
 * My account. Top: Descope's User Profile widget, where customers manage their own name, email,
 * phone, passkeys, password and authenticator app, with no TravelCorp code behind it.
 * Below, behind the scenes: the user object the web SDK has, and what the API sees after
 * validating the same session server-side.
 */
export function MePage() {
  const { userProfileWidgetId, widgetStyleId } = useAuthConfig();
  const navigate = useNavigate();
  const t = useT();
  const locale = useLocale();
  return (
    <div className="space-y-4">
      <PageHeader title={t.me.title} subtitle={t.me.subtitle} />
      {/* Side by side: what the customer sees, and what's behind it. */}
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <section
          className="rounded-xl border border-border p-5"
          data-testid="user-profile"
        >
          <h3 className="font-semibold">{t.me.details}</h3>
          <UserProfile
            widgetId={userProfileWidgetId}
            styleId={widgetStyleId}
            // The project theme is light-only (see brand.descopeTheme).
            theme="light"
            locale={locale} // header EN/FR switch
            onLogout={() => navigate("/", { replace: true })}
          />
        </section>
        <section className="rounded-xl border border-border bg-surface p-5">
          <h3 className="mb-3 font-semibold">{t.me.behind}</h3>
          <SessionDetails />
        </section>
      </div>
    </div>
  );
}

function SessionDetails() {
  const { user, isUserLoading } = useUser();
  const t = useT();
  const locale = useLocale();
  const [who, setWho] = useState<WhoAmI | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet("/api/whoami", WhoAmI)
      .then(setWho)
      .catch((e: unknown) =>
        setError(
          e instanceof ApiRequestError
            ? `${e.status} ${e.code}: ${e.message}`
            : String(e),
        ),
      );
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h4 className="text-sm font-semibold">{t.me.you}</h4>
        {isUserLoading ? (
          <p className="text-muted">{t.common.loading}</p>
        ) : (
          <dl className="mt-2 space-y-1 text-sm">
            <Row k={t.me.name} v={user?.name} />
            <Row k={t.common.email} v={user?.email} />
            <Row k={t.me.userId} v={user?.userId} />
            <Row k={t.me.loginIds} v={user?.loginIds?.join(", ")} />
          </dl>
        )}
      </div>
      <div>
        <h4 className="text-sm font-semibold">{t.me.server}</h4>
        {error && <p className="text-sm text-danger">{error}</p>}
        {who && (
          <>
            <dl className="mt-2 space-y-1 text-sm">
              <Row k={t.me.subject} v={who.userId} />
              <Row k={t.me.roles} v={who.roles.join(", ") || "—"} />
              <Row k={t.me.permissions} v={who.permissions.join(", ") || "—"} />
              <Row k={t.me.family} v={familySummary(who.claims)} />
              <Row
                k={t.me.expires}
                v={
                  who.expiresAt
                    ? new Date(who.expiresAt * 1000).toLocaleTimeString(
                        INTL_LOCALE[locale],
                      )
                    : undefined
                }
              />
            </dl>
            <TokenClaimsCheck claims={who.claims} />
            <details className="mt-3 text-xs">
              <summary className="cursor-pointer text-muted">
                {t.me.rawClaims}
              </summary>
              <pre className="mt-2 overflow-auto rounded border border-border p-2">
                {JSON.stringify(who.claims, null, 2)}
              </pre>
            </details>
          </>
        )}
      </div>
    </div>
  );
}

/** "guest-family (Family Admin)" from the session's Descope `families` claim. */
function familySummary(claims: Record<string, unknown>) {
  const families = (claims.families ?? {}) as Record<
    string,
    { roles?: string[] } | undefined
  >;
  return (
    Object.entries(families)
      .map(([id, f]) =>
        f?.roles?.length ? `${id} (${f.roles.join(", ")})` : id,
      )
      .join(", ") || "—"
  );
}

function Row({ k, v }: { k: string; v: string | undefined }) {
  return (
    <div className="flex gap-2">
      <dt className="w-32 shrink-0 text-muted">{k}</dt>
      <dd className="break-all">{v ?? "—"}</dd>
    </div>
  );
}

/**
 * "What's in the session token": for asks like "no PII in the JWT". The API validated this token,
 * so this is what every downstream service would see.
 */
function TokenClaimsCheck({ claims }: { claims: Record<string, unknown> }) {
  const present = personalDataClaims(claims);
  const t = useT();
  return (
    <div
      className="mt-3 rounded border border-border p-3 text-sm"
      data-testid="token-claims-check"
    >
      <div className="font-medium">{t.me.pii}</div>
      {present.length === 0 ? (
        <p className="text-muted" data-testid="token-claims-clean">
          {t.me.piiNoneBefore} <code>sub</code>
          {t.me.piiNoneAfter}
        </p>
      ) : (
        <p className="text-danger" data-testid="token-claims-present">
          {t.me.piiPresent(present.join(", "))}
        </p>
      )}
    </div>
  );
}
