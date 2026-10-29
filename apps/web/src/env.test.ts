import { describe, expect, it } from "vitest";
import { parseWebEnv } from "./env";

describe("parseWebEnv", () => {
  it("reports the missing project id", () => {
    const r = parseWebEnv({});
    expect(r.ok).toBe(false);
    if (!r.ok)
      expect(r.issues.map((i) => i.path)).toContain("VITE_DESCOPE_PROJECT_ID");
  });
  it("applies demo-switch defaults", () => {
    const r = parseWebEnv({ VITE_DESCOPE_PROJECT_ID: "P2test" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.env.VITE_SESSION_VIA_COOKIE).toBe(false);
      expect(r.env.VITE_DESCOPE_FLOW_ID).toBe("tp-sign-up-or-in");
    }
  });
});
