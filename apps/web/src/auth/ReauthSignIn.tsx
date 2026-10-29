import { useDescope } from "@descope/react-sdk";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { useT } from "../i18n/messages";

/** Where an enchanted link lands: /login verifies it there and tells that tab it can close. */
export const ENCHANTED_LANDING = "/login?el=1";

/** How long a sent link stays collectable, and the poll window that bounds stopping. */
const LINK_WAIT_MS = 10 * 60_000;
const POLL_WINDOW_MS = 5_000;

/**
 * Sign-in inside <ReauthDialog>. It must finish in *this* tab, so the page underneath (and its
 * unsaved input) survives. So no plain magic link and no hosted flow here: both complete in
 * whichever tab opens the link. Instead:
 *  - a passkey (same page, phishing-resistant), when the user has one;
 *  - an enchanted link: this tab waits (`waitForSession`) while the link is opened anywhere,
 *    lands on ENCHANTED_LANDING, and hands the session back here.
 */
export function ReauthSignIn({
  tenantId,
  loginHint,
  onWaitingChange,
}: {
  tenantId?: string;
  loginHint?: string;
  /** True while a link is being polled: the dialog hides "Use a different account" meanwhile. */
  onWaitingChange?: (waiting: boolean) => void;
}) {
  const sdk = useDescope();
  const t = useT();
  const [email, setEmail] = useState(loginHint ?? "");
  const [linkId, setLinkId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [stopping, setStopping] = useState(false);
  // Unmounted (dialog closed) or cancelled: stop polling after the current window. A successful
  // poll stores the session, so an unbounded poll could later switch the tab to this account
  // after the user moved on; short windows bound that to one window. Set on mount too:
  // StrictMode runs cleanup once and remounts in dev.
  const live = useRef(true);
  const cancelled = useRef(false);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  const waiting = linkId !== null;
  useEffect(() => onWaitingChange?.(waiting), [waiting, onWaitingChange]);

  async function signInWithPasskey() {
    setBusy(true);
    setError(null);
    const res = await sdk.webauthn.signIn(email.trim());
    if (!live.current) return;
    setBusy(false);
    // Success updates the session; RequireAuth closes the dialog.
    if (!res.ok) setError(res.error?.errorDescription ?? t.reauth.noPasskey);
  }

  async function sendLink(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const sent = await sdk.enchantedLink.signUpOrIn(
      email.trim(),
      new URL(ENCHANTED_LANDING, window.location.origin).toString(),
      tenantId ? { tenantId } : undefined,
    );
    if (!live.current) return;
    setBusy(false);
    if (!sent.ok || !sent.data) {
      setError(sent.error?.errorDescription ?? t.reauth.sendFailed);
      return;
    }
    cancelled.current = false;
    setLinkId(sent.data.linkId);
    // waitForSession resolves only on success or on its own timeout; a timed-out window can't
    // store a session later.
    const deadline = Date.now() + LINK_WAIT_MS;
    let done: Awaited<ReturnType<typeof sdk.enchantedLink.waitForSession>>;
    do {
      done = await sdk.enchantedLink.waitForSession(sent.data.pendingRef, {
        pollingIntervalMs: 1000,
        timeoutMs: POLL_WINDOW_MS,
      });
    } while (
      !done.ok &&
      live.current &&
      !cancelled.current &&
      Date.now() < deadline
    );
    if (!live.current || done.ok) return; // signed in: RequireAuth closes the dialog
    setLinkId(null);
    setStopping(false);
    if (!cancelled.current) setError(t.reauth.expired);
  }

  function cancel() {
    cancelled.current = true;
    setStopping(true); // until the current poll window ends
  }

  const input =
    "w-full rounded border border-border bg-background px-3 py-2 text-foreground outline-none focus:ring-2 focus:ring-primary";
  const primary =
    "w-full rounded bg-primary px-3 py-2 font-medium text-primary-foreground disabled:opacity-50";
  const secondary =
    "w-full rounded border border-border px-3 py-2 text-sm disabled:opacity-50";

  if (linkId)
    return (
      <div className="space-y-2" data-testid="reauth-link-sent">
        <p className="text-sm">
          {t.reauth.sentBefore(email)}{" "}
          <strong data-testid="reauth-link-id">{linkId}</strong>.
        </p>
        <p className="text-xs text-muted">{t.reauth.waits}</p>
        <button
          type="button"
          className={secondary}
          disabled={stopping}
          onClick={cancel}
        >
          {stopping ? t.reauth.stopping : t.common.cancel}
        </button>
      </div>
    );

  return (
    <form onSubmit={sendLink} className="space-y-3">
      <label className="block text-sm">
        {t.common.email}
        <input
          className={input}
          type="email"
          name="email"
          autoComplete="username webauthn"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>
      {error && <p className="text-sm text-danger">{error}</p>}
      <button
        type="button"
        className={primary}
        disabled={busy || !email.trim()}
        onClick={signInWithPasskey}
      >
        {t.reauth.usePasskey}
      </button>
      <button className={secondary} type="submit" disabled={busy}>
        {t.reauth.emailLink}
      </button>
    </form>
  );
}

/** The tab an enchanted link opens: verify it; the waiting tab gets the session. */
export function EnchantedLinkLanding({ token }: { token: string }) {
  const sdk = useDescope();
  const t = useT();
  const [state, setState] = useState<"verifying" | "done" | "failed">(
    "verifying",
  );
  const once = useRef(false);
  useEffect(() => {
    if (once.current) return;
    once.current = true;
    sdk.enchantedLink
      .verify(token)
      .then((res) => setState(res.ok ? "done" : "failed"));
  }, [sdk, token]);
  return (
    <section className="mx-auto max-w-sm" data-testid="enchanted-landing">
      <h2 className="text-xl font-semibold">{t.reauth.landing[state]}</h2>
      <p className="mt-2 text-sm text-muted">
        {state === "done"
          ? t.reauth.landing.doneBody
          : state === "failed"
            ? t.reauth.landing.failedBody
            : ""}
      </p>
    </section>
  );
}
