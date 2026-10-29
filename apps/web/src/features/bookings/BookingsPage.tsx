import { useUser } from "@descope/react-sdk";
import {
  type Booking,
  BookingList,
  MyFamily,
  PARKS,
  parkName,
} from "@kit/contracts";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { ApiRequestError, apiFetch, apiGet } from "../../api/client";
import { PageHeader } from "../../app/ui";
import {
  formatDate,
  INTL_LOCALE,
  type Locale,
  useLocale,
} from "../../i18n/locale";
import { useT } from "../../i18n/messages";

/**
 * One customer profile, every booking (the thing Parkdean's booking-only login can't do). In a
 * Descope family the list is the household's: Gemma and Sam each sign in as themselves and see
 * the same breaks.
 */
export function BookingsPage() {
  const { user } = useUser();
  const t = useT();
  const [data, setData] = useState<BookingList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [familyName, setFamilyName] = useState<string | undefined>();

  useEffect(() => {
    apiGet("/api/family", MyFamily)
      .then((f) => setFamilyName(f.family?.name))
      .catch(() => undefined); // the subtitle just stays generic
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: bumping `revision` refetches after a cancel.
  useEffect(() => {
    let ignore = false;
    apiGet("/api/bookings", BookingList)
      .then((v) => !ignore && setData(v))
      .catch((e) => !ignore && setError(errorMessage(e)));
    return () => {
      ignore = true;
    };
  }, [revision]);

  async function cancel(b: Booking) {
    try {
      await apiFetch(`/api/bookings/${b.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "cancelled" }),
      });
      setRevision((r) => r + 1);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <section className="space-y-6">
      <PageHeader
        title={user?.name ? t.bookings.titleFor(user.name) : t.nav.bookings}
        subtitle={
          familyName
            ? t.bookings.familySubtitle(familyName)
            : t.bookings.subtitle
        }
        action={
          <Link
            to="/book"
            className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground"
          >
            {t.nav.book}
          </Link>
        }
      />
      {error && <p className="text-sm text-danger">{error}</p>}
      <BookingTable bookings={data?.bookings} onCancel={cancel} />
    </section>
  );
}

/** Shared with the customer service console. Without `onCancel` it's read-only. */
export function BookingTable({
  bookings,
  onCancel,
}: {
  bookings: Booking[] | undefined;
  onCancel?: (b: Booking) => void;
}) {
  const t = useT();
  const locale = useLocale();
  const today = new Date().toISOString().slice(0, 10);
  return (
    <ul className="space-y-3" data-testid="booking-list">
      {!bookings && <li className="text-sm text-muted">{t.common.loading}</li>}
      {bookings?.length === 0 && (
        <li className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted">
          {t.bookings.none}
        </li>
      )}
      {bookings?.map((b) => {
        const past = b.arrival < today;
        const state =
          b.status === "cancelled" ? "cancelled" : past ? "stayed" : "upcoming";
        return (
          <li
            key={b.id}
            className={`flex flex-wrap items-center gap-4 rounded-xl border border-border p-4 text-sm ${state === "upcoming" ? "" : "bg-surface"}`}
            data-testid="booking-row"
          >
            <div className="min-w-0 flex-1">
              <div className="text-base font-semibold">
                {parkName(b.park)}{" "}
                <span className="font-normal text-muted">
                  · {regionOf(b.park)}
                </span>
              </div>
              <div className="text-muted">
                {t.accommodation[b.accommodation]} ·{" "}
                {formatDate(b.arrival, locale)} · {t.nights(b.nights)} ·{" "}
                {t.guests(b.guests)}
              </div>
              {b.party?.length ? (
                <div className="mt-1" data-testid="booking-party">
                  {t.bookings.with(partyNames(b.party, locale))}
                </div>
              ) : null}
            </div>
            <code className="text-xs text-muted">{b.reference}</code>
            <span
              className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${state === "upcoming" ? "border-accent text-accent" : "border-border text-muted"}`}
            >
              {t.bookings[state]}
            </span>
            {onCancel && state === "upcoming" && (
              <button
                type="button"
                className="text-xs text-danger underline"
                onClick={() => onCancel(b)}
              >
                {t.bookings.cancel}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** "Gemma, Sam, Mia and Leo": first names, as a list in the page's language. */
function partyNames(party: { name: string }[], locale: Locale) {
  return new Intl.ListFormat(INTL_LOCALE[locale], {
    type: "conjunction",
  }).format(party.map((p) => p.name.split(/\s+/)[0] ?? p.name));
}

const regionOf = (id: string) => PARKS.find((p) => p.id === id)?.region ?? "";

function errorMessage(e: unknown) {
  return e instanceof ApiRequestError
    ? `${e.status} ${e.code}: ${e.message}`
    : String(e);
}
