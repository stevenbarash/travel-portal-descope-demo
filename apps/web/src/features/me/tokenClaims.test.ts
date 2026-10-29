import { expect, it } from "vitest";
import { personalDataClaims } from "./tokenClaims";

it("a minimal token carries no personal data", () => {
  expect(
    personalDataClaims({
      sub: "U2abc",
      iss: "P2x",
      exp: 1,
      roles: ["admin"],
      tenants: { acme: {} },
    }),
  ).toEqual([]);
});

it("names every personal-data claim present, and nothing else", () => {
  expect(
    personalDataClaims({
      sub: "U2abc",
      email: "a@example.com",
      name: "Avery",
      phone_number: "+1555",
      custom: "x",
    }),
  ).toEqual(["email", "name", "phone_number"]);
});

it("ignores inherited properties and explicit undefined", () => {
  const claims = Object.create({ email: "inherited" }) as Record<
    string,
    unknown
  >;
  claims.name = undefined;
  expect(personalDataClaims(claims)).toEqual([]);
});
