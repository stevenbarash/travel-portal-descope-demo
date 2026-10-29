import { describe, expect, it } from "vitest";
import { localIsoDate } from "./draft";

describe("localIsoDate", () => {
  it("uses the local calendar day, not the UTC one", () => {
    // 00:30 local on 18 Dec is still 17 Dec in UTC anywhere east of Greenwich.
    expect(localIsoDate(new Date(2026, 11, 18, 0, 30))).toBe("2026-12-18");
    expect(localIsoDate(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });
});
