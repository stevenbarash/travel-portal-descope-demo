import { useSyncExternalStore } from "react";

/**
 * Site languages: the app's own copy (messages.ts), the embedded Descope flows
 * (descope/customer-flows/localization) and the My account widget all follow this one choice.
 */
export const LOCALES = ["en", "fr"] as const;
export type Locale = (typeof LOCALES)[number];

/** For Intl date formatting: Parkdean is a UK business, so English means en-GB. */
export const INTL_LOCALE: Record<Locale, string> = { en: "en-GB", fr: "fr-FR" };

const STORAGE_KEY = "kit.locale";

export function isLocale(value: unknown): value is Locale {
  return (LOCALES as readonly unknown[]).includes(value);
}

/** Saved choice wins; otherwise the browser's language if we have it, else English. */
export function resolveLocale(
  saved: string | null,
  browserLanguage: string | undefined,
): Locale {
  if (isLocale(saved)) return saved;
  const primary = browserLanguage?.split("-")[0]?.toLowerCase();
  return isLocale(primary) ? primary : "en";
}

function readSaved(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/** <html lang>: screen readers, hyphenation, and the browser's own translate prompt. */
function applyLang(locale: Locale) {
  if (typeof document !== "undefined") document.documentElement.lang = locale;
}

let current: Locale = resolveLocale(
  readSaved(),
  globalThis.navigator?.language,
);
applyLang(current);
const listeners = new Set<() => void>();

export function setLocale(next: Locale) {
  current = next;
  applyLang(next);
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // storage unavailable (private mode); the choice lasts for this page load
  }
  for (const listener of listeners) listener();
}

/** The site language, shared by the header switch, the app's copy and every embedded flow. */
export function useLocale(): Locale {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
  );
}

/** A booking date (YYYY-MM-DD) as "Fri 18 Dec 2026" / "ven. 18 déc. 2026". */
export function formatDate(iso: string, locale: Locale) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString(INTL_LOCALE[locale], {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
