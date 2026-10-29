/**
 * Claims that identify a person directly. A "minimal token" ask (healthcare, finance, "no PII in
 * the JWT") means none of these in the session token: services look the user up by `sub`.
 * Remove them with a JWT template in the Descope console.
 */
export const PERSONAL_DATA_CLAIMS = [
  "email",
  "email_verified",
  "name",
  "given_name",
  "family_name",
  "middle_name",
  "nickname",
  "preferred_username",
  "phone",
  "phone_number",
  "phone_number_verified",
  "picture",
  "birthdate",
  "address",
] as const;

/** The personal-data claims present in a token payload, in PERSONAL_DATA_CLAIMS order. */
export function personalDataClaims(claims: Record<string, unknown>): string[] {
  return PERSONAL_DATA_CLAIMS.filter(
    (k) => Object.hasOwn(claims, k) && claims[k] !== undefined,
  );
}
