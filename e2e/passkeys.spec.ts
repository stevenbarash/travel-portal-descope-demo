import { expect, type Page, test } from "@playwright/test";
import { removePasskeys } from "./helpers/descope";
import {
  completeEmailVerification,
  continueWithEmail,
  GUEST,
} from "./helpers/login";
import { addVirtualAuthenticator } from "./helpers/passkey";

/**
 * Passkeys as the baseline (req 1): enroll from the sign-in flow's own passkey offer after a first
 * sign-in, then a returning customer signs in with the passkey through the identifier-first flow,
 * no code to type. Uses a Chromium virtual authenticator. The guest's passkeys are removed before
 * and after, so no other spec sees one.
 *
 * Verification uses a typed code, not a magic link: a management-generated link isn't bound to a
 * flow execution, so it can't resume the hosted flow into its passkey offer.
 */
const USER = GUEST;
test.describe.configure({ mode: "serial" });
test.beforeAll(() => removePasskeys(USER.loginId));
test.afterAll(() => removePasskeys(USER.loginId));

// Descope renders each button twice for Playwright (descope-button + its vaadin-button): .first().
const offer = (page: Page) =>
  page.getByRole("button", { name: /^create (a )?passkey$/i }).first();
const loggedIn = (page: Page) => page.getByRole("button", { name: "Log out" });
const onLogin = (page: Page) => new URL(page.url()).pathname === "/login";

/** Code sign-in through the hosted flow, stopping at its passkey offer in this page's browser. */
async function signInToPasskeyOffer(page: Page) {
  await page.goto("/login?returnTo=%2Fme");
  await continueWithEmail(page, USER.loginId);
  const how = await completeEmailVerification(page, page.context(), USER, {
    allowMagicLink: false,
  });
  test.skip(
    how === "magic-link-unsupported",
    "the flow asked for a magic link, which can't resume into its passkey offer",
  );
  // The session exists before the offer renders; wait for the offer or for leaving /login.
  await expect
    .poll(async () => !onLogin(page) || (await offer(page).isVisible()), {
      timeout: 30_000,
    })
    .toBe(true);
  test.skip(
    !(await offer(page).isVisible()),
    "no passkey offer (the browser reported no WebAuthn support, or the flow skipped it)",
  );
}

test("code sign-in: 'Not now' on the flow's passkey offer still signs in", async ({
  page,
}) => {
  await addVirtualAuthenticator(page);
  await signInToPasskeyOffer(page);
  await page.getByRole("button", { name: "Not now" }).first().click();
  await expect(loggedIn(page)).toBeVisible({ timeout: 30_000 });
  await expect(page).toHaveURL(/\/me$/);
});

test("passkey: enroll from the flow's offer, then sign in with it through the flow", async ({
  page,
}) => {
  const authenticator = await addVirtualAuthenticator(page);
  await signInToPasskeyOffer(page);
  await offer(page).click();
  // The flow finishes (leaving /login) once the passkey is saved; an error keeps it there.
  const refused = page.getByText(
    // "Missing domain in WebAuthn settings": the project has no passkey domain (console only).
    /webauthn settings|missing domain|origin|relying party|rp ?id|not allowed|couldn't add/i,
  );
  await expect
    .poll(async () => !onLogin(page) || (await refused.first().isVisible()), {
      timeout: 30_000,
    })
    .toBe(true);
  // Read the text only when it's showing: textContent() waits for the element.
  if (await refused.first().isVisible())
    test.skip(
      true,
      `project passkey settings refused enrollment: ${await refused.first().textContent()}`,
    );
  expect(await authenticator.credentialCount()).toBe(1);

  // Returning customer: email first, then the passkey, no email round trip (the sign-up-or-in
  // flow checks unauthUser.webauthn and device.webAuthnSupport).
  await loggedIn(page).click();
  // Sign-out is async: going to /login first would bounce the still-signed-in user to returnTo.
  await expect(loggedIn(page)).toHaveCount(0, { timeout: 15_000 });
  await page.goto("/login?returnTo=%2Fme");
  await continueWithEmail(page, USER.loginId);
  await expect(loggedIn(page)).toBeVisible({ timeout: 30_000 });
  await expect(page).toHaveURL(/\/me$/);
});
