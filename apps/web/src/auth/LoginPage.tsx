import { Descope, useSession } from "@descope/react-sdk";
import { useRef } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router";
import { useLocale } from "../i18n/locale";
import { useT } from "../i18n/messages";
import { useAuthConfig } from "./AuthProvider";
import { EnchantedLinkLanding } from "./ReauthSignIn";
import { safeReturnTo } from "./returnTo";

/**
 * Sign in to a TravelCorp account (B2C: no tenant; identity resolves at project level). Mid-booking
 * sign-in happens on /book itself; this page serves "Sign in" and protected-page redirects.
 */
export function LoginPage() {
  const { flowId, styleId, descopeTheme } = useAuthConfig();
  const { isAuthenticated, isSessionLoading } = useSession();
  const locale = useLocale();
  const t = useT();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  // returnTo comes from the URL, so only same-origin paths are honored (no open redirect).
  const returnTo = safeReturnTo(params.get("returnTo"), "/bookings");

  // Redirect only a user who was already signed in when the page opened. A sign-in happening here
  // finishes through onSuccess: the flow's promote-passkeys step runs after the session exists,
  // and must not be unmounted by it.
  const signedInOnArrival = useRef<boolean | null>(null);
  if (!isSessionLoading && signedInOnArrival.current === null)
    signedInOnArrival.current = isAuthenticated;

  // A re-auth enchanted link (ReauthSignIn): verify it here; the waiting tab gets the session.
  const enchantedToken = params.get("el") ? params.get("t") : null;
  if (enchantedToken) return <EnchantedLinkLanding token={enchantedToken} />;

  if (isSessionLoading)
    return <p className="text-muted">{t.common.checkingSession}</p>;
  if (signedInOnArrival.current) return <Navigate to={returnTo} replace />;

  const done = () => navigate(returnTo, { replace: true });

  return (
    <section className="mx-auto max-w-sm">
      <h2 className="mb-3 text-xl font-semibold">{t.login.title}</h2>
      <Descope
        flowId={flowId}
        styleId={styleId}
        theme={descopeTheme} // "os" follows the app; needs both flavors in the project theme
        locale={locale} // header EN/FR switch; changing it restarts the flow
        onSuccess={done} // the SDK has already stored the session by the time this fires
        onError={(e) => console.error("flow error", e.detail)}
      />
    </section>
  );
}
