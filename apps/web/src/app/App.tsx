import { useDescope, useSession, useUser } from "@descope/react-sdk";
import { KIT_ROLES } from "@kit/contracts";
import { Link, NavLink, Outlet, useNavigate } from "react-router";
import { useAuthz } from "../auth/useAuthz";
import { BrandLogo } from "../brand/BrandLogo";
import { LOCALES, setLocale, useLocale } from "../i18n/locale";
import { useT } from "../i18n/messages";
import { DebugDrawer } from "./DebugDrawer";

/** Layout shell for every route. Nav hiding is presentation only; the API enforces access. */
export function App() {
  const { isAuthenticated } = useSession();
  const { user } = useUser();
  const sdk = useDescope();
  const navigate = useNavigate();
  const authz = useAuthz();
  const t = useT();
  // Project-level role: no tenant argument.
  const isAgent = authz.hasRole(KIT_ROLES.customerService);

  async function logout() {
    // Leave the protected page first: ending the session on it opens the re-auth dialog.
    navigate("/", { replace: true });
    await sdk.logout();
  }

  return (
    <div className="flex min-h-screen flex-col bg-background font-sans text-foreground">
      <header className="sticky top-0 z-10 border-b border-border bg-background">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-6 py-3">
          <Link to="/" className="flex items-center">
            {/* The logo is the wordmark; its alt text carries the name. */}
            <BrandLogo className="h-9" />
          </Link>
          <nav className="flex flex-1 flex-wrap items-center gap-1 text-sm">
            <Tab to="/book">{t.nav.book}</Tab>
            {isAuthenticated && (
              <>
                <Tab to="/bookings">{t.nav.bookings}</Tab>
                <Tab to="/family">{t.nav.family}</Tab>
                <Tab to="/me">{t.nav.account}</Tab>
                {/* Role-gated navigation: hidden unless customer service */}
                {isAgent && <Tab to="/service">{t.nav.service}</Tab>}
              </>
            )}
          </nav>
          <div className="flex items-center gap-3 text-sm">
            {isAuthenticated ? (
              <>
                <span className="hidden text-muted md:inline">
                  {user?.name ?? user?.email}
                </span>
                <button
                  type="button"
                  className="rounded border border-border px-3 py-1 hover:bg-surface"
                  onClick={logout}
                >
                  {t.nav.logOut}
                </button>
              </>
            ) : (
              <Link
                to="/login"
                className="rounded bg-primary px-3 py-1 font-medium text-primary-foreground"
              >
                {t.nav.signIn}
              </Link>
            )}
            <LocaleSwitch />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 p-6">
        <Outlet />
      </main>
      <DebugDrawer />
    </div>
  );
}

/** A header link that shows which page you're on. */
function Tab({ to, children }: { to: string; children: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `rounded px-3 py-1.5 ${isActive ? "bg-surface font-semibold text-foreground" : "text-muted hover:text-foreground"}`
      }
    >
      {children}
    </NavLink>
  );
}

/** EN/FR for the whole site: the app's copy, the embedded flows and the My account widget. */
function LocaleSwitch() {
  const locale = useLocale();
  const t = useT();
  return (
    <fieldset
      className="flex overflow-hidden rounded border border-border text-xs"
      aria-label={t.langSwitch}
    >
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          aria-pressed={locale === l}
          className={
            locale === l
              ? "bg-primary px-2 py-1 font-semibold text-primary-foreground"
              : "px-2 py-1"
          }
          onClick={() => setLocale(l)}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </fieldset>
  );
}
