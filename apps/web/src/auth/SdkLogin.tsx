import { getRefreshToken, useDescope } from "@descope/react-sdk";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { useT } from "../i18n/messages";

/**
 * SDK-mode login exemplar: the same methods as the kit flow, built with plain UI and direct SDK
 * calls, so a customer sees what "bring your own UI" looks like versus the hosted flow.
 *  - Email magic link first (passwordless; the link lands back here with `?t=`).
 *  - After a link sign-in, offer a passkey (the SDK-mode equivalent of the flow's promote step).
 *  - Sign in with a passkey (phishing-resistant) for returning users; SAML SSO for org IdPs.
 * OTP isn't offered here: the kit uses it only when a customer requires it (demo-sign-up-or-in-otp).
 */
export function SdkLogin({
  tenantId,
  onSuccess,
  offerPasskey = true,
}: {
  tenantId?: string;
  onSuccess: () => void;
  /** Ask to add a passkey after a magic-link sign-in. Off in the re-auth dialog. */
  offerPasskey?: boolean;
}) {
  const sdk = useDescope();
  const t = useT();
  const [step, setStep] = useState<"email" | "sent" | "offer">("email");
  const [email, setEmail] = useState("");
  const [loginId, setLoginId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [params, setParams] = useSearchParams();
  const ssoCode = params.get("code");
  const linkToken = params.get("t");
  const handled = useRef(false);

  /** This page without the one-time params, as the link / IdP return address. */
  function returnUrl() {
    const url = new URL(window.location.href);
    url.searchParams.delete("t");
    url.searchParams.delete("code");
    return url.toString();
  }

  function dropParam(name: string) {
    const next = new URLSearchParams(params);
    next.delete(name);
    setParams(next, { replace: true });
  }

  /** After a link sign-in: offer a passkey if the device can make one and the user has none. */
  async function afterLinkSignIn() {
    if (!offerPasskey || !(await sdk.webauthn.helpers.isSupported())) {
      onSuccess();
      return;
    }
    const me = await sdk.me();
    // `webauthn` is on the user record at runtime but not in the SDK's UserResponse type.
    const user = me.data as
      | { loginIds?: string[]; webauthn?: boolean }
      | undefined;
    const id = user?.loginIds?.[0];
    if (!me.ok || !id || user?.webauthn) {
      onSuccess();
      return;
    }
    setLoginId(id);
    setStep("offer");
  }

  // Landed from the emailed link (?t=) or back from the IdP (?code=): trade it for a session.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once per landing
  useEffect(() => {
    if (handled.current || (!linkToken && !ssoCode)) return;
    handled.current = true;
    setBusy(true);
    const exchange = linkToken
      ? sdk.magicLink.verify(linkToken)
      : sdk.saml.exchange(ssoCode ?? "");
    exchange.then(async (res) => {
      dropParam(linkToken ? "t" : "code");
      setBusy(false);
      if (!res.ok) {
        setError(
          res.error?.errorDescription ??
            (linkToken ? t.sdkLogin.linkInvalid : t.sdkLogin.ssoFailed),
        );
        return;
      }
      if (linkToken) await afterLinkSignIn();
      else onSuccess();
    });
  }, [linkToken, ssoCode]);

  async function sendLink(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    // tenantId scopes identity resolution in tenant-isolated projects; harmless otherwise.
    const res = await sdk.magicLink.signUpOrIn.email(
      email,
      returnUrl(),
      tenantId ? { tenantId } : undefined,
    );
    setBusy(false);
    if (!res.ok) {
      setError(res.error?.errorDescription ?? t.sdkLogin.sendFailed);
      return;
    }
    setStep("sent");
  }

  async function signInWithPasskey() {
    if (!email.trim()) {
      setError(t.sdkLogin.passkeyNeedsEmail);
      return;
    }
    setBusy(true);
    setError(null);
    const res = await sdk.webauthn.signIn(email.trim());
    setBusy(false);
    if (!res.ok) {
      setError(res.error?.errorDescription ?? t.sdkLogin.passkeyFailed);
      return;
    }
    onSuccess();
  }

  async function addPasskey() {
    setBusy(true);
    setError(null);
    const res = await sdk.webauthn.update(
      loginId,
      getRefreshToken() || undefined,
    );
    setBusy(false);
    if (!res.ok) {
      setError(res.error?.errorDescription ?? t.sdkLogin.addPasskeyFailed);
      return;
    }
    onSuccess();
  }

  async function startSso() {
    const target = tenantId ?? email.trim();
    if (!target) {
      setError(t.sdkLogin.ssoNeedsTarget);
      return;
    }
    setBusy(true);
    setError(null);
    // Tenant ID or email: Descope resolves the tenant from the email's SSO domain.
    const res = await sdk.saml.start(target, returnUrl());
    if (!res.ok || !res.data?.url) {
      setBusy(false);
      setError(res.error?.errorDescription ?? t.sdkLogin.ssoNotSetUp);
      return;
    }
    window.location.assign(res.data.url);
  }

  const input =
    "w-full rounded border border-border bg-background px-3 py-2 text-foreground outline-none focus:ring-2 focus:ring-primary";
  const button =
    "w-full rounded bg-primary px-3 py-2 font-medium text-primary-foreground disabled:opacity-50";
  const secondary =
    "w-full rounded border border-border px-3 py-2 text-sm disabled:opacity-50";
  const errorLine = error && <p className="text-sm text-danger">{error}</p>;

  if (step === "offer")
    return (
      <div className="space-y-3" data-testid="passkey-offer">
        <p className="font-medium">{t.sdkLogin.offerTitle}</p>
        <p className="text-sm text-muted">{t.sdkLogin.offerBody}</p>
        {errorLine}
        <button
          className={button}
          type="button"
          disabled={busy}
          onClick={addPasskey}
        >
          {busy ? t.sdkLogin.waitingDevice : t.sdkLogin.addPasskey}
        </button>
        <button
          className={secondary}
          type="button"
          disabled={busy}
          onClick={onSuccess}
        >
          {t.sdkLogin.notNow}
        </button>
      </div>
    );

  if (step === "sent")
    return (
      <div className="space-y-3" data-testid="link-sent">
        <p className="text-sm">
          {t.sdkLogin.sentBefore} <strong>{email}</strong>.{" "}
          {t.sdkLogin.sentAfter}
        </p>
        {errorLine}
        <button
          type="button"
          className="text-sm text-muted underline"
          onClick={() => setStep("email")}
        >
          {t.sdkLogin.otherEmail}
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
          autoComplete="email webauthn"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>
      {errorLine}
      <button className={button} type="submit" disabled={busy}>
        {busy ? t.sdkLogin.working : t.sdkLogin.emailLink}
      </button>
      <button
        type="button"
        className={secondary}
        disabled={busy}
        onClick={signInWithPasskey}
      >
        {t.sdkLogin.passkey}
      </button>
      <button
        type="button"
        className={secondary}
        disabled={busy}
        onClick={startSso}
      >
        {t.sdkLogin.sso}
      </button>
    </form>
  );
}
