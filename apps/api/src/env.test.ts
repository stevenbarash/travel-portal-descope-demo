import { describe, expect, it } from "vitest";
import { EnvError, parseEnv } from "./env";

describe("parseEnv", () => {
  it("names the missing variable", () => {
    expect(() => parseEnv({})).toThrowError(EnvError);
    expect(() => parseEnv({})).toThrowError(/DESCOPE_PROJECT_ID/);
  });
  it("treats empty strings as unset", () => {
    expect(() => parseEnv({ DESCOPE_PROJECT_ID: "" })).toThrowError(
      /DESCOPE_PROJECT_ID/,
    );
  });
  it("applies defaults", () => {
    const env = parseEnv({ DESCOPE_PROJECT_ID: "P2test" });
    expect(env.PORT).toBe(3001);
    expect(env.WEB_ORIGIN).toEqual(["http://localhost:5173"]);
  });
  it("accepts a comma-separated origin list and rejects a bad entry", () => {
    const env = parseEnv({
      DESCOPE_PROJECT_ID: "P2test",
      WEB_ORIGIN: "http://localhost:5173, https://demo.example.com",
    });
    expect(env.WEB_ORIGIN).toEqual([
      "http://localhost:5173",
      "https://demo.example.com",
    ]);
    expect(() =>
      parseEnv({ DESCOPE_PROJECT_ID: "P2test", WEB_ORIGIN: "nope" }),
    ).toThrowError(/WEB_ORIGIN/);
  });
});
