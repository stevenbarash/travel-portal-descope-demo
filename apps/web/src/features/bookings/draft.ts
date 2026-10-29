import type { Accommodation, DestinationId } from "@kit/contracts";

/**
 * A booking in progress, kept in localStorage so the customer comes back to it wherever they left
 * off (req 15): through a sign-in redirect, a page reload, or a magic link opened in another tab.
 */
export interface BookingDraft {
  destination: DestinationId;
  accommodation: Accommodation;
  arrival: string;
  nights: number;
  guests: number;
  /** Passed into the sign-up flow so the customer never types these twice (req 3). */
  email: string;
  name: string;
  /** Apple Pay customers see "Continue with Apple" first (req 20). */
  applePay: boolean;
  step: "details" | "signin" | "review";
}

/** localStorage key; one draft per browser, shared across tabs. */
const KEY = "tp.bookingDraft";

/** A Friday about two months out: a typical next break. */
function nextBreak(): string {
  const d = new Date();
  d.setDate(d.getDate() + 60);
  d.setDate(d.getDate() + ((5 - d.getDay() + 7) % 7));
  return localIsoDate(d);
}

/** YYYY-MM-DD for the viewer's local calendar day (toISOString would give the UTC day). */
export function localIsoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Sensible defaults so the form is bookable as-is. */
export function newDraft(): BookingDraft {
  return {
    destination: "santorini",
    accommodation: "apartment",
    arrival: nextBreak(),
    nights: 3,
    guests: 4,
    email: "",
    name: "",
    applePay: false,
    step: "details",
  };
}

/**
 * The saved draft, or null if there is none. Layered over the defaults so a draft saved before a
 * field existed still loads complete.
 */
export function loadDraft(): BookingDraft | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? { ...newDraft(), ...JSON.parse(raw) } : null;
  } catch {
    return null;
  }
}

/** Best-effort: never throws, so a blocked storage can't break the booking form. */
export function saveDraft(draft: BookingDraft) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(draft));
  } catch {
    // storage unavailable (private mode): the draft lives only in this page
  }
}

/** Called once the booking is confirmed, so the next visit starts fresh. */
export function clearDraft() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // nothing to clear
  }
}
