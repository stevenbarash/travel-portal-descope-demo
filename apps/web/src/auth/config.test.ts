import { describe, expect, it } from "vitest";
import { resolveAuthMode } from "./config";

describe("resolveAuthMode", () => {
  it("uses env when no override", () => {
    expect(resolveAuthMode("flow", null)).toBe("flow");
    expect(resolveAuthMode("sdk", null)).toBe("sdk");
  });
  it("override wins when valid", () => {
    expect(resolveAuthMode("flow", "sdk")).toBe("sdk");
  });
  it("ignores garbage overrides", () => {
    expect(resolveAuthMode("flow", "banana")).toBe("flow");
  });
});
