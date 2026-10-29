import {
  managementClient,
  must,
  storedLoginId,
} from "../../scripts/lib/descope";
import { testOtp } from "../../scripts/lib/test-otp";
import { GUEST_USER } from "../../scripts/seed-data";

export const TEST_USER = GUEST_USER;

/**
 * Use configured Static OTP, otherwise generate a fresh test-user OTP via management API.
 * Uses the stored login ID (tenant-qualified under tenant user isolation).
 */
export async function otpFor(
  loginId: string = TEST_USER.loginId,
  tenantId?: string,
): Promise<string> {
  const { descope } = managementClient();
  const stored = await storedLoginId(descope, loginId, tenantId);
  return testOtp(process.env.DESCOPE_TEST_OTP, async () => {
    const res = must(
      await descope.client.management.user.generateOTPForTestUser(
        "email",
        stored,
      ),
      `generateOTPForTestUser(${stored})`,
    );
    const code = res.data?.code;
    if (!code) throw new Error("no OTP code returned");
    return code;
  });
}

/**
 * Generate a magic link for a seeded test user. `uri` is the page that will receive `?t=<token>`;
 * loading our /login there lets the hosted flow verify the token and complete sign-in.
 */
export async function magicLinkFor(
  uri: string,
  loginId: string = TEST_USER.loginId,
  tenantId?: string,
): Promise<string> {
  const { descope } = managementClient();
  const stored = await storedLoginId(descope, loginId, tenantId);
  const res = must(
    await descope.client.management.user.generateMagicLinkForTestUser(
      "email",
      stored,
      uri,
    ),
    `generateMagicLinkForTestUser(${stored})`,
  );
  const link = res.data?.link;
  if (!link) throw new Error("no magic link returned");
  return link;
}

/**
 * A test user's enchanted link landing on the kit's enchanted-link page (`/login?el=1&t=…`),
 * plus the pendingRef a waiting tab polls with `enchantedLink.waitForSession`.
 */
export async function enchantedLinkFor(
  loginId: string,
  tenantId?: string,
): Promise<{ url: string; pendingRef: string }> {
  const { descope } = managementClient();
  const stored = await storedLoginId(descope, loginId, tenantId);
  const res = must(
    await descope.client.management.user.generateEnchantedLinkForTestUser(
      stored,
      "http://localhost:5173/login",
    ),
    `generateEnchantedLinkForTestUser(${stored})`,
  );
  const token = res.data?.link
    ? new URL(res.data.link).searchParams.get("t")
    : null;
  if (!token || !res.data?.pendingRef)
    throw new Error("no enchanted link token or pendingRef returned");
  const url = new URL("/login", "http://localhost:5173");
  url.searchParams.set("el", "1");
  url.searchParams.set("t", token);
  return { url: url.toString(), pendingRef: res.data.pendingRef };
}

/** The `t` token of a management-generated magic link, for verifying it in an open page. */
export async function magicLinkToken(
  loginId: string,
  tenantId?: string,
): Promise<string> {
  const link = await magicLinkFor(
    "http://localhost:5173/login",
    loginId,
    tenantId,
  );
  const token = /[?&]t=([^&#]+)/.exec(link)?.[1];
  if (!token) throw new Error("magic link carries no t= token");
  return decodeURIComponent(token);
}

/**
 * A landing URL for a test user's magic link: `path` (which may carry its own query, e.g.
 * returnTo/tenant) plus the token. Built here rather than passing `path` as the link's URI, so
 * the query never depends on how Descope appends `t`.
 */
export async function magicLinkTo(
  path: string,
  loginId: string,
  tenantId?: string,
): Promise<string> {
  const url = new URL(path, "http://localhost:5173");
  url.searchParams.set("t", await magicLinkToken(loginId, tenantId));
  return url.toString();
}

/** Remove every passkey of a seeded test user, so passkey specs start and end clean. */
export async function removePasskeys(loginId: string, tenantId?: string) {
  const { descope } = managementClient();
  const stored = await storedLoginId(descope, loginId, tenantId);
  must(
    await descope.client.management.user.removeAllPasskeys(stored),
    `removeAllPasskeys(${stored})`,
  );
}
