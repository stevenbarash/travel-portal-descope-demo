import {
  getRefreshToken,
  getSessionToken,
  useDescope,
  useSession,
  useUser,
} from "@descope/react-sdk";
import { useState } from "react";
import { ApiRequestError, apiFetch } from "../api/client";
import { useAuthConfig } from "../auth/AuthProvider";
import { useAuthMode } from "../auth/useAuthMode";
import { useAuthz } from "../auth/useAuthz";
import { useT } from "../i18n/messages";

/**
 * The presenter's window into the session: config, decoded claims, token copy, manual API calls.
 * Everything here is client-side state the SDK already holds; nothing is fetched on open.
 */
export function DebugDrawer() {
  const [open, setOpen] = useState(false);
  const t = useT();
  return (
    <>
      <button
        type="button"
        className="fixed right-4 bottom-4 z-30 rounded-full border border-border bg-background px-3 py-1 text-xs shadow"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        {open ? t.debug.close : t.debug.open}
      </button>
      {open && <Panel />}
    </>
  );
}

function Panel() {
  const cfg = useAuthConfig();
  const [mode] = useAuthMode();
  const { isAuthenticated } = useSession();
  const { user } = useUser();
  const sdk = useDescope();
  const authz = useAuthz();
  const t = useT();
  const [copied, setCopied] = useState<string | null>(null);
  const [path, setPath] = useState("/api/whoami");
  const [method, setMethod] = useState<"GET" | "POST">("GET");
  const [out, setOut] = useState<string | null>(null);

  const exp =
    typeof authz.claims.exp === "number" ? authz.claims.exp : undefined;
  const secondsLeft = exp
    ? Math.max(0, Math.round(exp - Date.now() / 1000))
    : undefined;

  async function copy(label: string, value: string) {
    await navigator.clipboard.writeText(value);
    setCopied(label);
    setTimeout(() => setCopied(null), 1500);
  }

  async function call() {
    setOut(null);
    try {
      const res = await apiFetch(path, { method });
      setOut(`${res.status}\n${JSON.stringify(await res.json(), null, 2)}`);
    } catch (e) {
      setOut(
        e instanceof ApiRequestError
          ? `${e.status} ${e.code}\n${e.message}`
          : String(e),
      );
    }
  }

  const btn = "rounded border border-border px-2 py-1 text-xs";

  return (
    <aside
      className="fixed right-4 bottom-12 z-30 max-h-[80vh] w-96 overflow-auto rounded border border-border bg-background p-3 text-xs shadow"
      data-testid="debug-drawer"
    >
      <h3 className="mb-2 font-semibold">{t.debug.title}</h3>
      <dl className="grid grid-cols-[7rem_1fr] gap-y-1">
        <Row k={t.debug.authMode} v={mode} />
        <Row
          k={t.debug.sessionVia}
          v={cfg.sessionViaCookie ? t.debug.cookie : t.debug.header}
        />
        <Row k={t.debug.flow} v={cfg.flowId} />
        <Row k={t.debug.authenticated} v={String(isAuthenticated)} />
        <Row k={t.debug.user} v={user?.email ?? user?.userId} />
        <Row
          k={t.debug.expiresIn}
          v={secondsLeft === undefined ? undefined : `${secondsLeft}s`}
        />
        <Row k={t.debug.steppedUp} v={String(authz.isSteppedUp)} />
        <Row k={t.me.roles} v={authz.roles.join(", ")} />
        <Row k={t.me.permissions} v={authz.permissions.join(", ")} />
      </dl>
      {/* B2C: the Descope family claim takes the place tenants have in a B2B demo. */}
      {Object.keys(authz.families).length > 0 && (
        <div className="mt-2">
          <div className="text-muted">{t.me.family}</div>
          <ul className="ml-3 list-disc" data-testid="debug-families">
            {Object.entries(authz.families).map(([id, t]) => (
              <li key={id}>
                <strong>{id}</strong>: {t.roles.join(", ") || "—"}
                {t.permissions.length > 0 && (
                  <span className="text-muted">
                    {" "}
                    · {t.permissions.join(", ")}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {isAuthenticated && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className={btn}
            onClick={() => copy("session", getSessionToken())}
          >
            {t.debug.copySession}
          </button>
          <button
            type="button"
            className={btn}
            onClick={() => copy("refresh", getRefreshToken())}
          >
            {t.debug.copyRefresh}
          </button>
          <button type="button" className={btn} onClick={() => sdk.refresh()}>
            {t.debug.refresh}
          </button>
          <button
            type="button"
            className={btn}
            title={t.debug.timeoutTitle}
            onClick={() => sdk.logout()}
          >
            {t.debug.timeout}
          </button>
          {copied && (
            <span className="text-muted">{t.debug.copied(copied)}</span>
          )}
        </div>
      )}
      <div className="mt-3">
        <div className="mb-1 text-muted">{t.debug.callApi}</div>
        <div className="flex gap-1">
          <select
            aria-label={t.debug.method}
            className="rounded border border-border bg-background px-1"
            value={method}
            onChange={(e) => setMethod(e.target.value as "GET" | "POST")}
          >
            <option>GET</option>
            <option>POST</option>
          </select>
          <input
            aria-label={t.debug.path}
            className="flex-1 rounded border border-border bg-background px-2 py-1"
            value={path}
            onChange={(e) => setPath(e.target.value)}
          />
          <button type="button" className={btn} onClick={call}>
            {t.debug.send}
          </button>
        </div>
        {out && (
          <pre
            className="mt-2 max-h-48 overflow-auto rounded border border-border p-2"
            data-testid="debug-output"
          >
            {out}
          </pre>
        )}
      </div>
      <details className="mt-3">
        <summary className="cursor-pointer text-muted">
          {t.me.rawClaims}
        </summary>
        <pre className="mt-1 max-h-48 overflow-auto rounded border border-border p-2">
          {JSON.stringify(authz.claims, null, 2)}
        </pre>
      </details>
    </aside>
  );
}

function Row({ k, v }: { k: string; v: string | undefined }) {
  return (
    <>
      <dt className="text-muted">{k}</dt>
      <dd className="break-all">{v || "—"}</dd>
    </>
  );
}
