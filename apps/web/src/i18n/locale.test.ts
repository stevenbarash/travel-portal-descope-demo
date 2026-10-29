import { describe, expect, it } from "vitest";
import { formatDate, resolveLocale } from "./locale";
import { messages } from "./messages";

describe("resolveLocale", () => {
  it("saved choice wins over the browser", () => {
    expect(resolveLocale("en", "fr-FR")).toBe("en");
    expect(resolveLocale("fr", "en-GB")).toBe("fr");
  });
  it("falls back to the browser's primary language", () => {
    expect(resolveLocale(null, "fr-CA")).toBe("fr");
    expect(resolveLocale(null, "en-GB")).toBe("en");
  });
  it("defaults to English for unsupported or garbage values", () => {
    expect(resolveLocale("de", "es-ES")).toBe("en");
    expect(resolveLocale(null, undefined)).toBe("en");
  });
});

/** Every key path in a message tree, functions included as leaves. */
function keys(tree: object, prefix = ""): string[] {
  return Object.entries(tree).flatMap(([k, v]) =>
    v && typeof v === "object" ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}

describe("messages", () => {
  it("French has exactly the English keys", () => {
    expect(keys(messages.fr).sort()).toEqual(keys(messages.en).sort());
  });
  it("no French string is empty", () => {
    const empty = keys(messages.fr).filter((path) => {
      const leaf = path
        .split(".")
        .reduce<unknown>(
          (node, k) => (node as Record<string, unknown>)[k],
          messages.fr,
        );
      return typeof leaf === "string" && leaf.trim() === "";
    });
    expect(empty).toEqual([]);
  });
});

describe("formatDate", () => {
  it("shows the booked day in every timezone", () => {
    const original = process.env.TZ;
    try {
      for (const tz of [
        "Pacific/Kiritimati",
        "Pacific/Auckland",
        "Pacific/Honolulu",
      ]) {
        process.env.TZ = tz;
        expect(formatDate("2026-12-18", "en")).toMatch(/\b18\b/);
      }
    } finally {
      process.env.TZ = original;
    }
  });
});
