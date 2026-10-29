import type { Accommodation, ParkId } from "@kit/contracts";

/**
 * A booking in progress, kept in localStorage so the customer comes back to it wherever they left
 * off (req 15): through a sign-in redirect, a page reload, or a magic link opened in another tab.
 */
export interface BookingDraft {
  park: ParkId;
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

const KEY = "pd.bookingDraft";

/** A Friday about two months out: a typical next break. */
function nextBreak(): string {
  const d = new Date();
  d.setDate(d.getDate() + 60);
  d.setDate(d.getDate() + ((5 - d.getDay() + 7) % 7));
  return d.toISOString().slice(0, 10);
}

export function newDraft(): BookingDraft {
  return {
    park: "cayton-bay",
    accommodation: "lodge",
    arrival: nextBreak(),
    nights: 3,
    guests: 4,
    email: "",
    name: "",
    applePay: false,
    step: "details",
  };
}

export function loadDraft(): BookingDraft | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? { ...newDraft(), ...JSON.parse(raw) } : null;
  } catch {
    return null;
  }
}

export function saveDraft(draft: BookingDraft) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(draft));
  } catch {
    // storage unavailable (private mode): the draft lives only in this page
  }
}

export function clearDraft() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // nothing to clear
  }
}
