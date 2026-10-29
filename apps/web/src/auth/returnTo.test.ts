import { describe, expect, it } from "vitest";
import { safeReturnTo } from "./returnTo";

describe("safeReturnTo", () => {
  it("allows relative paths", () =>
    expect(safeReturnTo("/me?x=1")).toBe("/me?x=1"));
  it("rejects absolute and protocol-relative urls", () => {
    expect(safeReturnTo("https://evil.example")).toBe("/");
    expect(safeReturnTo("//evil.example")).toBe("/");
  });
  it("falls back when empty", () =>
    expect(safeReturnTo(null, "/home")).toBe("/home"));
});
