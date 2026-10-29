import { expect, type Page, test } from "@playwright/test";
import { magicLinkTo, removePasskeys } from "./helpers/descope";
import { continueWithEmail, GUEST } from "./helpers/login";
import { addVirtualAuthenticator } from "./helpers/passkey";

/**
 * Passkeys as the baseline (req 1): enroll after a first sign-in, then a returning customer signs
 * in with the passkey through Parkdean's identifier-first flow, no code to type. Uses a Chromium
 * virtual authenticator. The guest's passkeys are removed before and after, so no other spec
 * sees one.
 *
 * Enrollment runs in SDK mode: a management-generated magic link isn't bound to a flow execution,
 * so it can't resume the hosted flow into its passkey offer.
 */
const USER = GUEST;
test.describe.configure({ mode: "serial" });
test.beforeAll(() => removePasskeys(USER.loginId));
test.afterAll(() => removePasskeys(USER.loginId));

// Descope renders each button twice for Playwright (descope-button + its vaadin-button): .first().
const offer = (page: Page) =>
  page.getByRole("button", { name: "Add a passkey" }).first();
const loggedIn = (page: Page) => page.getByRole("button", { name: "Log out" });

/** Auth mode per page load: SDK unless the test switched this tab to flow mode. */
async function useMode(page: Page) {
  await page.addInitScript(() =>
    window.localStorage.setItem(
      "kit.authMode",
      window.sessionStorage.getItem("kit.e2e.mode") ?? "sdk",
    ),
  );
}

/** SDK-mode sign-in by magic link, landing in this page so its authenticator is used. */
async function signInByLink(page: Page) {
  await useMode(page);
  await page.goto(await magicLinkTo("/login?returnTo=%2Fme", USER.loginId));
  // "Log out" appears before the offer renders; wait for the offer or for leaving /login.
  await expect
    .poll(
      async () =>
        new URL(page.url()).pathname !== "/login" ||
        (await offer(page).isVisible()),
      { timeout: 30_000 },
    )
    .toBe(true);
  test.skip(
    !(await offer(page).isVisible()),
    "no passkey offer (the browser reported no WebAuthn support)",
  );
}

test("magic link sign-in: 'Not now' on the passkey offer still signs in", async ({
  page,
}) => {
  await addVirtualAuthenticator(page);
  await signInByLink(page);
  await page.getByRole("button", { name: "Not now" }).first().click();
  await expect(loggedIn(page)).toBeVisible({ timeout: 30_000 });
  await expect(page).toHaveURL(/\/me$/);
});

test("passkey: enroll after a magic link, then sign in with it through Parkdean's flow", async ({
  page,
}) => {
  const authenticator = await addVirtualAuthenticator(page);
  await signInByLink(page);
  await offer(page).click();
  // The page leaves /login once the passkey is saved; an error keeps it there.
  const refused = page.getByText(
    // "Missing domain in WebAuthn settings": the project has no passkey domain (console only).
    // "Authentication method disabled": Passkeys is off for SDK/API use in Authentication Methods
    // (flows aren't gated by that toggle, so the flow's own passkey offer still works).
    /webauthn settings|missing domain|origin|relying party|rp ?id|not allowed|couldn't add|method disabled/i,
  );
  await expect
    .poll(
      async () =>
        new URL(page.url()).pathname !== "/login" ||
        (await refused.first().isVisible()),
      { timeout: 30_000 },
    )
    .toBe(true);
  // Read the text only when it's showing: textContent() waits for the element.
  if (await refused.first().isVisible())
    test.skip(
      true,
      `project passkey settings refused SDK enrollment: ${await refused.first().textContent()}`,
    );
  expect(await authenticator.credentialCount()).toBe(1);

  // Returning customer, hosted flow: email first, then the passkey, no email round trip
  // (pd-sign-up-or-in checks unauthUser.webauthn and device.webAuthnSupport).
  await loggedIn(page).click();
  // Sign-out is async: going to /login first would bounce the still-signed-in user to returnTo.
  await expect(loggedIn(page)).toHaveCount(0, { timeout: 15_000 });
  await page.evaluate(() =>
    window.sessionStorage.setItem("kit.e2e.mode", "flow"),
  );
  await page.goto("/login?returnTo=%2Fme");
  await expect(page.getByText("Mode: flow")).toBeVisible();
  await continueWithEmail(page, USER.loginId);
  await expect(loggedIn(page)).toBeVisible({ timeout: 30_000 });
  await expect(page).toHaveURL(/\/me$/);
});
