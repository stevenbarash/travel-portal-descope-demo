import { DependentSession, type FamilyMember, MyFamily } from "@kit/contracts";
import { type FormEvent, useEffect, useState } from "react";
import { ApiRequestError, apiFetch, apiGet } from "../../api/client";
import { PageHeader } from "../../app/ui";
import { useAuthz } from "../../auth/useAuthz";
import { useT } from "../../i18n/messages";
import { BookingTable } from "../bookings/BookingsPage";

/**
 * My family (Descope Family Accounts). One household on one account:
 *  - guardians (Gemma, Sam) each sign in as themselves and hold the "Family Admin" family role;
 *  - dependents (the children, the dog) are profiles with no login, added and removed by a guardian;
 *  - "Act for" asks Descope for a token for the dependent that names the guardian in `act`.
 * The family and the guardian check come from the session's `families` claim, on the API.
 */
export function FamilyPage() {
  const t = useT();
  const authz = useAuthz();
  const [data, setData] = useState<MyFamily | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [acting, setActing] = useState<DependentSession | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: bumping `revision` refetches after a change.
  useEffect(() => {
    let ignore = false;
    apiGet("/api/family", MyFamily)
      .then((v) => !ignore && setData(v))
      .catch((e) => !ignore && setError(errorMessage(e)));
    return () => {
      ignore = true;
    };
  }, [revision]);

  // One family action at a time: `busy` holds its key so every action button disables while it
  // runs, and API errors (e.g. 403 without the guardian's family permission) land in the banner.
  // Resolves to whether the action succeeded, since errors are swallowed into the banner here.
  async function run(
    key: string,
    action: () => Promise<void>,
  ): Promise<boolean> {
    setBusy(key);
    setError(null);
    try {
      await action();
      return true;
    } catch (e) {
      setError(errorMessage(e));
      return false;
    } finally {
      setBusy(null);
    }
  }

  const remove = (m: FamilyMember) =>
    run(`remove:${m.userId}`, async () => {
      await apiFetch(`/api/family/dependents/${m.userId}`, {
        method: "DELETE",
      });
      // Close the act-for panel if it was showing the dependent who just left the family.
      if (acting?.dependent.userId === m.userId) setActing(null);
      setRevision((r) => r + 1);
    });

  const actFor = (m: FamilyMember) =>
    run(`act:${m.userId}`, async () => {
      // Descope issues the dependent's token only if the guardian holds the family permission; the
      // API returns it decoded, with the dependent's bookings read as them.
      const res = await apiFetch(`/api/family/dependents/${m.userId}/act`, {
        method: "POST",
      });
      setActing(DependentSession.parse(await res.json()));
    });

  const family = data?.family;
  return (
    <section className="space-y-6">
      <PageHeader
        title={family?.name ?? t.family.title}
        subtitle={t.family.subtitle}
      />
      {error && <p className="text-sm text-danger">{error}</p>}
      {!data && !error && <p className="text-muted">{t.common.loading}</p>}

      {data && !family && (
        <div className="rounded-lg border border-border bg-surface p-6 text-center">
          <p className="font-medium">{t.family.none}</p>
          <p className="mt-1 text-sm text-muted">{t.family.noneBody}</p>
        </div>
      )}

      {family && (
        <ul className="grid gap-3 sm:grid-cols-2" data-testid="family-members">
          {family.members.map((m) => {
            const isMe = m.userId === authz.userId;
            return (
              <li
                key={m.userId}
                className="flex items-start gap-3 rounded-lg border border-border p-4"
                data-testid="family-member"
              >
                <Avatar name={m.name ?? m.loginId} dependent={m.dependent} />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">
                    {m.name ?? m.loginId}
                    {isMe && (
                      <span className="font-normal text-muted">
                        {" "}
                        ({t.family.you})
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-muted">
                    {[m.relationship, m.dependent ? undefined : m.email]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                  <span
                    className={`mt-2 inline-block rounded-full border px-2 py-0.5 text-xs ${m.dependent ? "border-border text-muted" : "border-accent text-accent"}`}
                  >
                    {m.dependent ? t.family.dependent : t.family.guardian}
                  </span>
                </div>
                {/* canManage is the API's read of the guardian's family permission; the API guards these calls regardless. */}
                {m.dependent && data.canManage && (
                  <div className="flex flex-col items-end gap-1 text-sm">
                    <button
                      type="button"
                      className="rounded border border-border px-2 py-1 hover:bg-surface disabled:opacity-50"
                      data-testid="family-act"
                      disabled={busy !== null}
                      onClick={() => actFor(m)}
                    >
                      {t.family.actFor(firstName(m))}
                    </button>
                    <button
                      type="button"
                      className="text-xs text-danger underline disabled:opacity-50"
                      data-testid="family-remove"
                      disabled={busy !== null}
                      onClick={() => remove(m)}
                    >
                      {t.family.remove}
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {acting && (
        <ActingPanel session={acting} onStop={() => setActing(null)} />
      )}

      {family &&
        (data.canManage ? (
          <AddDependentForm
            adding={busy === "add"}
            disabled={busy !== null}
            onAdd={(name, relationship) =>
              run("add", async () => {
                // Success is the 2xx alone: the refetch validates the new member against the
                // contract, so a parse failure here can't make a created dependent look failed
                // (and a retry add a duplicate).
                await apiFetch("/api/family/dependents", {
                  method: "POST",
                  body: JSON.stringify({ name, relationship }),
                });
                setRevision((r) => r + 1);
              })
            }
          />
        ) : (
          <p className="text-sm text-muted">{t.family.guardianOnly}</p>
        ))}

      {family && (
        <details className="rounded-lg border border-border bg-surface p-4 text-sm">
          <summary className="cursor-pointer font-semibold">
            {t.family.behind}
          </summary>
          <p className="mt-2 text-muted">{t.family.behindBody}</p>
          {/* The same `families` claim the API reads, decoded from the session in the browser. */}
          <pre
            className="mt-2 overflow-auto rounded border border-border bg-background p-2 text-xs"
            data-testid="family-claim"
          >
            {JSON.stringify({ families: authz.families }, null, 2)}
          </pre>
        </details>
      )}
    </section>
  );
}

/** Guardian-only: adds a dependent, a family profile with no login of its own. */
function AddDependentForm({
  adding,
  disabled,
  onAdd,
}: {
  /** This form's own request is in flight (drives the button label). */
  adding: boolean;
  /** Any family action is in flight; they share one `busy` slot, so only one may run at a time. */
  disabled: boolean;
  /** Resolves true once the dependent is added; false when the API rejected it. */
  onAdd: (name: string, relationship: string) => Promise<boolean>;
}) {
  const t = useT();
  const [name, setName] = useState("");
  const [relationship, setRelationship] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !relationship.trim()) return;
    // Keep the inputs on failure so the guardian can retry without retyping.
    if (!(await onAdd(name.trim(), relationship.trim()))) return;
    setName("");
    setRelationship("");
  }
  const input =
    "w-full rounded border border-border bg-background px-3 py-2 text-foreground";
  return (
    <form
      onSubmit={submit}
      className="space-y-3 rounded-lg border border-border bg-surface p-4"
      data-testid="family-add"
    >
      <h3 className="font-semibold">{t.family.add}</h3>
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <label className="block text-sm">
          <span className="text-muted">{t.family.name}</span>
          <input
            className={`mt-1 ${input}`}
            data-testid="family-add-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            required
          />
        </label>
        <label className="block text-sm">
          <span className="text-muted">{t.family.relationship}</span>
          <input
            className={`mt-1 ${input}`}
            data-testid="family-add-relationship"
            placeholder={t.family.relationshipHint}
            value={relationship}
            onChange={(e) => setRelationship(e.target.value)}
            maxLength={40}
            required
          />
        </label>
        <button
          type="submit"
          className="rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          data-testid="family-add-submit"
          disabled={disabled}
        >
          {adding ? t.family.adding : t.family.addButton}
        </button>
      </div>
    </form>
  );
}

/**
 * Acting for a dependent: their bookings, plus the token's `sub` (the dependent) and `act` (the
 * guardian) to show both identities are carried, not swapped.
 */
function ActingPanel({
  session,
  onStop,
}: {
  session: DependentSession;
  onStop: () => void;
}) {
  const t = useT();
  const name = session.dependent.name ?? session.dependent.loginId;
  return (
    <div
      className="space-y-3 rounded-lg border-2 border-accent p-4"
      data-testid="family-acting"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">{t.family.actingTitle(name)}</h3>
          <p className="text-sm text-muted">{t.family.actingBody}</p>
        </div>
        <button
          type="button"
          className="shrink-0 rounded border border-border px-3 py-1 text-sm hover:bg-surface"
          onClick={onStop}
        >
          {t.family.stop}
        </button>
      </div>
      <BookingTable bookings={session.bookings} />
      <dl className="grid grid-cols-[9rem_1fr] gap-y-1 text-xs">
        <dt className="text-muted">{t.family.subject}</dt>
        <dd>
          <code>{session.subject}</code>
        </dd>
        <dt className="text-muted">{t.family.actor}</dt>
        <dd>
          <code data-testid="family-actor">{session.actor ?? "—"}</code>
        </dd>
        <dt className="text-muted">{t.family.familyClaim}</dt>
        <dd>
          <code>{session.familyId ?? "—"}</code>
        </dd>
      </dl>
      <details className="text-xs">
        <summary className="cursor-pointer text-muted">
          {t.family.tokenClaims}
        </summary>
        <pre className="mt-2 overflow-auto rounded bg-surface p-2">
          {JSON.stringify(session.claims, null, 2)}
        </pre>
      </details>
    </div>
  );
}

/** Initials in a circle; dependents get the outlined variant. */
export function Avatar({
  name,
  dependent,
}: {
  name: string;
  dependent: boolean;
}) {
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <span
      aria-hidden
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${dependent ? "border border-border bg-surface text-foreground" : "bg-primary text-primary-foreground"}`}
    >
      {initials}
    </span>
  );
}

const firstName = (m: FamilyMember) =>
  (m.name ?? m.loginId).split(/\s+/)[0] ?? m.loginId;

/** "403 forbidden: …": the API's status and reason, as-is. */
function errorMessage(e: unknown) {
  return e instanceof ApiRequestError
    ? `${e.status} ${e.code}: ${e.message}`
    : String(e);
}
