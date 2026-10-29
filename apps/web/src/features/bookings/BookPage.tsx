import { Descope, useSession, useUser } from "@descope/react-sdk";
import {
  type Booking,
  Booking as BookingSchema,
  CreateBooking,
  DESTINATIONS,
  destinationName,
  type FamilyMember,
  MyFamily,
} from "@kit/contracts";
import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import { Link } from "react-router";
import { ApiRequestError, apiFetch, apiGet } from "../../api/client";
import { PageHeader } from "../../app/ui";
import { useAuthConfig } from "../../auth/AuthProvider";
import { formatDate, type Locale, useLocale } from "../../i18n/locale";
import { type Messages, useT } from "../../i18n/messages";
import {
  type BookingDraft,
  clearDraft,
  loadDraft,
  newDraft,
  saveDraft,
} from "./draft";

/**
 * "Book a break" — public, no login needed to browse (anonymous guests are free).
 *  1. The customer picks a break and enters their email and name, like any booking form.
 *  2. "Continue to book" opens Travel Portal's own sign-up-or-in flow right here, with the booking
 *     details passed in as flow input: the email is pre-filled, the name is saved without asking
 *     again (req 3, +), and Apple Pay customers see Apple first (req 20).
 *  3. After sign-in they land back on this booking, at the confirm step (req 15). The draft is in
 *     localStorage, so it survives a redirect, a reload or a magic link opened in another tab.
 *  4. "Who's coming?" lists their Descope family (guardians and dependents); the API checks every
 *     pick against the family Descope has for them.
 */
export function BookPage() {
  const [draft, setDraft] = useState<BookingDraft>(
    () => loadDraft() ?? newDraft(),
  );
  const [confirmed, setConfirmed] = useState<Booking | null>(null);
  const { isAuthenticated, isSessionLoading } = useSession();
  const t = useT();

  const update = (patch: Partial<BookingDraft>) =>
    setDraft((d) => {
      const next = { ...d, ...patch };
      saveDraft(next);
      return next;
    });

  // Signed in elsewhere (another tab, a redirect back from /login): pick up at the confirm step.
  useEffect(() => {
    if (isAuthenticated && draft.step === "signin") update({ step: "review" });
  });

  if (confirmed) return <Confirmed booking={confirmed} />;

  return (
    <section className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title={t.book.title}
        subtitle={t.book.subtitle(DESTINATIONS.length)}
      />
      <Steps step={draft.step} />
      {draft.step === "details" && (
        <DetailsStep
          draft={draft}
          update={update}
          signedIn={isAuthenticated}
          onContinue={() =>
            update({ step: isAuthenticated ? "review" : "signin" })
          }
        />
      )}
      {draft.step === "signin" &&
        (isSessionLoading ? (
          <p className="text-muted">{t.common.checkingSession}</p>
        ) : (
          <SignInStep
            draft={draft}
            onBack={() => update({ step: "details" })}
            onSignedIn={() => update({ step: "review" })}
          />
        ))}
      {draft.step === "review" && (
        <ReviewStep
          draft={draft}
          onBack={() => update({ step: "details" })}
          onConfirmed={(b) => {
            clearDraft();
            setConfirmed(b);
          }}
        />
      )}
    </section>
  );
}

const STEPS = ["details", "signin", "review"] as const;

function Steps({ step }: { step: BookingDraft["step"] }) {
  const t = useT();
  const at = STEPS.indexOf(step);
  return (
    <ol className="flex gap-2 text-xs" data-testid="book-steps">
      {STEPS.map((id, i) => (
        <li
          key={id}
          className={`flex-1 rounded border px-2 py-1 ${i === at ? "border-primary bg-primary text-primary-foreground" : i < at ? "border-border text-foreground" : "border-border text-muted"}`}
          aria-current={i === at ? "step" : undefined}
        >
          {i + 1}. {t.book.steps[id]}
        </li>
      ))}
    </ol>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the control is passed in as children.
    <label className="block text-sm">
      <span className="text-muted">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

const input =
  "w-full rounded border border-border bg-background px-3 py-2 text-foreground";

function DetailsStep({
  draft,
  update,
  signedIn,
  onContinue,
}: {
  draft: BookingDraft;
  update: (patch: Partial<BookingDraft>) => void;
  signedIn: boolean;
  onContinue: () => void;
}) {
  const t = useT();
  const [error, setError] = useState<string | null>(null);
  function submit(e: FormEvent) {
    e.preventDefault();
    const holiday = CreateBooking.safeParse(draft);
    if (!holiday.success) {
      setError(t.book.invalidHoliday);
      return;
    }
    if (!signedIn && !/^\S+@\S+\.\S+$/.test(draft.email.trim())) {
      setError(t.book.invalidEmail);
      return;
    }
    setError(null);
    onContinue();
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-4 rounded border border-border bg-surface p-4"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t.book.destination}>
          <select
            className={input}
            data-testid="book-destination"
            value={draft.destination}
            onChange={(e) =>
              update({
                destination: e.target.value as BookingDraft["destination"],
              })
            }
          >
            {DESTINATIONS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}, {p.region}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t.book.stayIn}>
          <select
            className={input}
            data-testid="book-accommodation"
            value={draft.accommodation}
            onChange={(e) =>
              update({
                accommodation: e.target.value as BookingDraft["accommodation"],
              })
            }
          >
            <option value="hotel">{t.accommodation.hotel}</option>
            <option value="apartment">{t.accommodation.apartment}</option>
          </select>
        </Field>
        <Field label={t.book.arriving}>
          <input
            type="date"
            className={input}
            data-testid="book-arrival"
            value={draft.arrival}
            onChange={(e) => update({ arrival: e.target.value })}
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label={t.book.nightsLabel}>
            <input
              type="number"
              min={1}
              max={14}
              className={input}
              value={draft.nights}
              onChange={(e) => update({ nights: Number(e.target.value) })}
            />
          </Field>
          <Field label={t.book.guestsLabel}>
            <input
              type="number"
              min={1}
              max={8}
              className={input}
              value={draft.guests}
              onChange={(e) => update({ guests: Number(e.target.value) })}
            />
          </Field>
        </div>
      </div>

      {!signedIn && (
        <div className="grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
          <Field label={t.common.email}>
            <input
              type="email"
              className={input}
              data-testid="book-email"
              autoComplete="email"
              value={draft.email}
              onChange={(e) => update({ email: e.target.value })}
            />
          </Field>
          <Field label={t.book.leadGuest}>
            <input
              className={input}
              data-testid="book-name"
              autoComplete="name"
              value={draft.name}
              onChange={(e) => update({ name: e.target.value })}
            />
          </Field>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              data-testid="book-applepay"
              checked={draft.applePay}
              onChange={(e) => update({ applePay: e.target.checked })}
            />
            {t.book.applePay}
          </label>
        </div>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}
      <button
        type="submit"
        className="rounded bg-primary px-4 py-2 font-medium text-primary-foreground"
        data-testid="book-continue"
      >
        {t.book.continue}
      </button>
    </form>
  );
}

/** Travel Portal's own flow, embedded in the booking page, with the booking details as its input. */
function SignInStep({
  draft,
  onBack,
  onSignedIn,
}: {
  draft: BookingDraft;
  onBack: () => void;
  onSignedIn: () => void;
}) {
  const { flowId, styleId, descopeTheme } = useAuthConfig();
  const locale = useLocale();
  const t = useT();
  return (
    <div className="space-y-3">
      <div className="rounded border border-border bg-surface p-3 text-sm">
        <span className="text-muted">{t.book.yourBreak}</span>
        {summary(draft, t, locale)}
        <button
          type="button"
          className="ml-2 text-accent underline"
          onClick={onBack}
        >
          {t.book.changeLink}
        </button>
      </div>
      <p className="text-sm text-muted">{t.book.signInIntro}</p>
      <div className="mx-auto max-w-sm" data-testid="book-signin">
        <Descope
          flowId={flowId}
          styleId={styleId}
          theme={descopeTheme}
          locale={locale}
          // Flow input: the email pre-fills the welcome screen, displayName is saved by the
          // progressive-profile subflow, applePay puts "Continue with Apple" first.
          form={{
            email: draft.email.trim(),
            displayName: draft.name.trim(),
            applePay: draft.applePay,
          }}
          onSuccess={onSignedIn}
          onError={(e) => console.error("flow error", e.detail)}
        />
      </div>
    </div>
  );
}

function ReviewStep({
  draft,
  onBack,
  onConfirmed,
}: {
  draft: BookingDraft;
  onBack: () => void;
  onConfirmed: (b: Booking) => void;
}) {
  const { user } = useUser();
  const t = useT();
  const locale = useLocale();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [members, setMembers] = useState<FamilyMember[] | null>(null);
  const [party, setParty] = useState<Set<string>>(new Set());

  // Everyone in the family is coming unless unticked.
  useEffect(() => {
    apiGet("/api/family", MyFamily)
      .then((f) => {
        const all = f.family?.members ?? [];
        setMembers(all);
        setParty(new Set(all.map((m) => m.userId)));
      })
      .catch(() => setMembers([])); // no family: the guest count from step 1 stands
  }, []);
  const withFamily = (members?.length ?? 0) > 0;

  function toggle(userId: string) {
    setParty((p) => {
      const next = new Set(p);
      if (!next.delete(userId)) next.add(userId);
      return next;
    });
  }

  async function confirm() {
    if (withFamily && party.size === 0) {
      setError(t.book.partyNeeded);
      return;
    }
    const holiday = CreateBooking.parse({
      ...draft,
      partyIds: withFamily ? [...party] : undefined,
    });
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch("/api/bookings", {
        method: "POST",
        body: JSON.stringify(holiday),
      });
      onConfirmed(BookingSchema.parse(await res.json()));
    } catch (e) {
      setError(
        e instanceof ApiRequestError
          ? `${e.status} ${e.code}: ${e.message}`
          : String(e),
      );
      setBusy(false);
    }
  }

  return (
    <div
      className="space-y-4 rounded border border-border bg-surface p-4"
      data-testid="book-review"
    >
      <p className="text-sm text-accent" data-testid="book-welcome-back">
        {t.book.welcome(user?.name)}
      </p>
      <dl className="grid grid-cols-[8rem_1fr] gap-y-1 text-sm">
        <dt className="text-muted">{t.book.destination}</dt>
        <dd data-testid="book-review-destination">
          {destinationName(draft.destination)}
        </dd>
        <dt className="text-muted">{t.book.stay}</dt>
        <dd>{t.accommodation[draft.accommodation]}</dd>
        <dt className="text-muted">{t.book.arriving}</dt>
        <dd>{formatDate(draft.arrival, locale)}</dd>
        <dt className="text-muted">{t.book.nightsLabel}</dt>
        <dd>{draft.nights}</dd>
        {!withFamily && (
          <>
            <dt className="text-muted">{t.book.guestsLabel}</dt>
            <dd>{draft.guests}</dd>
          </>
        )}
        <dt className="text-muted">{t.book.account}</dt>
        <dd>{user?.email ?? user?.loginIds?.[0] ?? "…"}</dd>
      </dl>
      {withFamily && (
        <fieldset
          className="space-y-2 border-t border-border pt-3"
          data-testid="book-party"
        >
          <legend className="text-sm font-semibold">{t.book.whoComing}</legend>
          <p className="text-xs text-muted">{t.book.partyHint}</p>
          <div className="flex flex-wrap gap-2">
            {members?.map((m) => (
              <label
                key={m.userId}
                className={`flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1 text-sm ${party.has(m.userId) ? "border-accent" : "border-border text-muted"}`}
              >
                <input
                  type="checkbox"
                  checked={party.has(m.userId)}
                  onChange={() => toggle(m.userId)}
                />
                {m.name ?? m.loginId}
                {m.relationship && (
                  <span className="text-xs text-muted">{m.relationship}</span>
                )}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex gap-3">
        <button
          type="button"
          className="rounded bg-primary px-4 py-2 font-medium text-primary-foreground disabled:opacity-50"
          data-testid="book-confirm"
          disabled={busy || members === null}
          onClick={confirm}
        >
          {t.book.confirm}
        </button>
        <button
          type="button"
          className="rounded border border-border px-4 py-2"
          onClick={onBack}
        >
          {t.common.change}
        </button>
      </div>
    </div>
  );
}

function Confirmed({ booking }: { booking: Booking }) {
  const t = useT();
  const locale = useLocale();
  return (
    <section
      className="mx-auto max-w-2xl space-y-3 rounded border border-border bg-surface p-6 text-center"
      data-testid="book-confirmed"
    >
      <h2 className="text-2xl font-semibold">{t.book.booked}</h2>
      <p>
        {t.book.bookedSummary(
          destinationName(booking.destination),
          t.nights(booking.nights),
          formatDate(booking.arrival, locale),
        )}
      </p>
      <p className="text-sm text-muted">
        {t.book.reference}{" "}
        <strong data-testid="book-reference">{booking.reference}</strong>
      </p>
      <Link
        to="/bookings"
        className="inline-block rounded bg-primary px-4 py-2 font-medium text-primary-foreground"
      >
        {t.book.seeAll}
      </Link>
    </section>
  );
}

function summary(d: BookingDraft, t: Messages, locale: Locale) {
  return `${destinationName(d.destination)} · ${t.accommodation[d.accommodation]} · ${t.nights(d.nights)} ${t.book.from} ${formatDate(d.arrival, locale)} · ${t.guests(d.guests)}`;
}
