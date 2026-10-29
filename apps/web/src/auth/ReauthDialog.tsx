import { useState } from "react";
import { Link, useLocation } from "react-router";
import { useT } from "../i18n/messages";
import { ReauthSignIn } from "./ReauthSignIn";

/**
 * Shown over the current page when a live session ends (timed out, revoked). The page underneath
 * keeps its state, including half-typed forms; signing in again restores the session in place
 * and the dialog closes by itself. It signs in with a passkey or an enchanted link, both of
 * which finish in this tab (see ReauthSignIn); the hosted flow and plain magic links finish in
 * whichever tab opens the link, so they would strand this page. Users whose tenant signs in with
 * SSO can use "Use a different account", which leaves the page for their IdP.
 */
export function ReauthDialog({
  tenantId,
  loginHint,
}: {
  tenantId?: string;
  loginHint?: string;
}) {
  const location = useLocation();
  const t = useT();
  // No account switch while a sent link is being polled: collecting it later would sign this
  // tab back in as the first account. ReauthSignIn's Cancel stops the poll first.
  const [waiting, setWaiting] = useState(false);
  // The account switch navigates away (unsaved input is lost), so bring the user back here after.
  const returnTo = encodeURIComponent(location.pathname + location.search);
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-foreground/40 p-4"
      data-testid="reauth-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reauth-title"
    >
      <div className="w-full max-w-sm rounded bg-background p-4 shadow">
        <h3 id="reauth-title" className="font-semibold">
          {t.reauth.title}
        </h3>
        <p className="mb-3 text-sm text-muted">{t.reauth.body}</p>
        <ReauthSignIn
          tenantId={tenantId}
          loginHint={loginHint}
          onWaitingChange={setWaiting}
        />
        {!waiting && (
          <Link
            to={`/login?returnTo=${returnTo}`}
            className="mt-3 block text-center text-xs text-muted underline"
          >
            {t.reauth.otherAccount}
          </Link>
        )}
      </div>
    </div>
  );
}
