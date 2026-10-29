import {
  AuditTrail,
  type Customer,
  CustomerDetail,
  CustomerSearch,
  ImpersonationResult,
  KIT_PERMISSIONS,
} from "@kit/contracts";
import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import { ApiRequestError, apiFetch, apiGet } from "../../api/client";
import { PageHeader } from "../../app/ui";
import { useAuthz } from "../../auth/useAuthz";
import { INTL_LOCALE, useLocale } from "../../i18n/locale";
import { useT } from "../../i18n/messages";
import { BookingTable } from "../bookings/BookingsPage";
import { Avatar } from "../family/FamilyPage";

/**
 * Customer service console (req 21). Agents find a customer, see their bookings, their family
 * (Descope Family Accounts) and sign-in history, and can view the account exactly as the customer
 * sees it (impersonation). The page is role-gated for experience; the API checks User Admin /
 * Impersonate on every call, and Descope records each impersonation in the audit trail.
 */
export function ServicePage() {
  const authz = useAuthz();
  const t = useT();
  // UX only: agents without Impersonate get a disabled button with the reason instead of a 403.
  // The API's requirePermissions guard is what actually enforces it.
  const canImpersonate = authz.hasPermission(KIT_PERMISSIONS.impersonate);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Customer[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function search(e?: FormEvent) {
    e?.preventDefault();
    setError(null);
    try {
      const res = await apiGet(
        `/api/service/customers?q=${encodeURIComponent(q.trim())}`,
        CustomerSearch,
      );
      setResults(res.customers);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <section className="space-y-6">
      <PageHeader title={t.service.title} subtitle={t.service.subtitle} />

      <form onSubmit={search} className="flex gap-2">
        <input
          className="flex-1 rounded border border-border bg-background px-3 py-2"
          data-testid="service-search"
          placeholder={t.service.searchPlaceholder}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button
          type="submit"
          className="rounded bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
        >
          {t.service.find}
        </button>
      </form>
      {error && <p className="text-sm text-danger">{error}</p>}

      {results && (
        <ul
          className="divide-y divide-border rounded border border-border"
          data-testid="service-results"
        >
          {results.length === 0 && (
            <li className="p-3 text-sm text-muted">{t.service.none}</li>
          )}
          {results.map((c) => (
            <li key={c.userId}>
              <button
                type="button"
                className={`flex w-full items-center gap-4 p-3 text-left text-sm hover:bg-surface ${selected === c.userId ? "bg-surface" : ""}`}
                data-testid="service-result"
                onClick={() => setSelected(c.userId)}
              >
                <span className="flex-1">
                  <span className="font-medium">{c.name ?? "—"}</span>{" "}
                  <span className="text-muted">{c.email ?? c.loginId}</span>
                </span>
                <span className="text-xs text-muted">
                  {c.methods.join(", ") || "email"}
                </span>
                <span className="text-xs text-muted">
                  {t.service.statusValue[c.status] ?? c.status}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {selected && (
        <CustomerPanel
          key={selected}
          userId={selected}
          canImpersonate={canImpersonate}
        />
      )}
    </section>
  );
}

/** One customer's profile, family, bookings, "view as" and audit trail. Keyed by userId. */
function CustomerPanel({
  userId,
  canImpersonate,
}: {
  userId: string;
  canImpersonate: boolean;
}) {
  const [detail, setDetail] = useState<CustomerDetail | null>(null);
  const [audit, setAudit] = useState<AuditTrail | null>(null);
  const [asCustomer, setAsCustomer] = useState<ImpersonationResult | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const t = useT();
  const locale = useLocale();
  const [busy, setBusy] = useState(false);
  const base = `/api/service/customers/${encodeURIComponent(userId)}`;

  function loadAudit() {
    apiGet(`${base}/audit`, AuditTrail)
      .then(setAudit)
      .catch((e) => setError(errorMessage(e)));
  }
  // biome-ignore lint/correctness/useExhaustiveDependencies: loads once per customer (the panel is keyed by userId).
  useEffect(() => {
    apiGet(base, CustomerDetail)
      .then(setDetail)
      .catch((e) => setError(errorMessage(e)));
    loadAudit();
  }, [base]);

  async function impersonate() {
    setBusy(true);
    setError(null);
    try {
      // The API asks Descope for an impersonation token, checks its `sub` is this customer, and
      // reads their bookings as that identity. The agent's own session is untouched: nothing here
      // signs the browser in as the customer. `actor` is the agent, from the token's `act` claim.
      const res = await apiFetch(`${base}/impersonate`, { method: "POST" });
      setAsCustomer(ImpersonationResult.parse(await res.json()));
      // The impersonation itself lands in the trail a moment later.
      setTimeout(loadAudit, 2_000);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const c = detail?.customer;
  return (
    <div className="space-y-4" data-testid="service-customer">
      <Panel title={c ? (c.name ?? c.loginId) : t.common.loading}>
        {c && (
          <dl className="grid grid-cols-[9rem_1fr] gap-y-1 text-sm">
            <dt className="text-muted">{t.common.email}</dt>
            <dd>{c.email ?? c.loginId}</dd>
            <dt className="text-muted">{t.service.methods}</dt>
            <dd>{c.methods.join(", ") || t.service.methodsDefault}</dd>
            <dt className="text-muted">{t.service.status}</dt>
            <dd>{t.service.statusValue[c.status] ?? c.status}</dd>
            <dt className="text-muted">{t.service.since}</dt>
            <dd>
              {c.createdAt
                ? new Date(c.createdAt).toLocaleDateString(INTL_LOCALE[locale])
                : "—"}
            </dd>
          </dl>
        )}
        {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      </Panel>

      <Panel title={t.service.family}>
        {!detail ? (
          <p className="text-sm text-muted">{t.common.loading}</p>
        ) : !detail.family ? (
          <p className="text-sm text-muted">{t.service.noFamily}</p>
        ) : (
          <div data-testid="service-family">
            <p className="mb-2 text-sm font-medium">{detail.family.name}</p>
            <ul className="flex flex-wrap gap-3">
              {detail.family.members.map((m) => (
                <li key={m.userId} className="flex items-center gap-2 text-sm">
                  <Avatar name={m.name ?? m.loginId} dependent={m.dependent} />
                  <span>
                    <span className="font-medium">{m.name ?? m.loginId}</span>
                    <span className="block text-xs text-muted">
                      {[m.relationship, m.roles.join(", ")]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Panel>

      <Panel title={t.service.bookings}>
        <BookingTable bookings={detail?.bookings} />
      </Panel>

      <Panel title={t.service.viewAs}>
        {!asCustomer ? (
          <>
            <p className="mb-3 text-sm text-muted">{t.service.viewAsBody}</p>
            <button
              type="button"
              className="rounded bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
              data-testid="service-impersonate"
              disabled={!canImpersonate || busy}
              title={
                canImpersonate
                  ? undefined
                  : t.service.requires(KIT_PERMISSIONS.impersonate)
              }
              onClick={impersonate}
            >
              {t.service.viewAs}
            </button>
          </>
        ) : (
          <div className="space-y-3" data-testid="service-impersonation">
            <p className="rounded border border-accent p-2 text-sm">
              {t.service.viewingAs}{" "}
              <strong>{asCustomer.customer.name ?? t.service.customer}</strong>{" "}
              · {t.service.tokenSubject} <code>{asCustomer.subject}</code> ·{" "}
              {t.service.actingAgent}{" "}
              <code data-testid="service-actor">{asCustomer.actor ?? "—"}</code>
            </p>
            <BookingTable bookings={asCustomer.bookings} />
            <details className="text-xs">
              <summary className="cursor-pointer text-muted">
                {t.service.tokenClaims}
              </summary>
              <pre className="mt-2 overflow-auto rounded bg-surface p-2">
                {JSON.stringify(asCustomer.claims, null, 2)}
              </pre>
            </details>
            <button
              type="button"
              className="text-sm underline"
              onClick={() => setAsCustomer(null)}
            >
              {t.service.stop}
            </button>
          </div>
        )}
      </Panel>

      <Panel title={t.service.audit}>
        <ul className="space-y-1 text-sm" data-testid="service-audit">
          {!audit && <li className="text-muted">{t.common.loading}</li>}
          {audit?.entries.length === 0 && (
            <li className="text-muted">{t.service.noActivity}</li>
          )}
          {audit?.entries
            .filter((a) => a.action)
            .slice(0, 15)
            .map((a) => (
              <li
                key={`${a.occurred}-${a.action}`}
                className="flex gap-3"
                data-testid="service-audit-row"
              >
                <span className="w-40 shrink-0 text-muted">
                  {new Date(a.occurred).toLocaleString(INTL_LOCALE[locale])}
                </span>
                <span className="font-medium">{a.action}</span>
                <span className="text-muted">
                  {[a.method, a.device, a.geo].filter(Boolean).join(" · ")}
                </span>
              </li>
            ))}
        </ul>
      </Panel>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-border p-4">
      <h3 className="mb-3 font-semibold">{title}</h3>
      {children}
    </section>
  );
}

/** "403 forbidden: Missing permission: …": the API's reason is the useful part for agents. */
function errorMessage(e: unknown) {
  return e instanceof ApiRequestError
    ? `${e.status} ${e.code}: ${e.message}`
    : String(e);
}
