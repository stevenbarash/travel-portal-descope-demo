import { expect, type Page, test } from "@playwright/test";
import {
  completeEmailVerification,
  continueWithEmail,
  declineSignInOffers,
  GUEST,
  loginViaFlow,
} from "./helpers/login";

/** The /me page shows what the API returned after validating the session server-side. */
async function expectServerValidatedSession(page: Page) {
  await expect(page).toHaveURL(/\/me$/);
  await expect(page.getByText("Server says")).toBeVisible();
  await expect(
    page.locator("dd", { hasText: /^U[A-Za-z0-9]+$/ }).first(),
  ).toBeVisible();
}

/** Exit criterion: a raw call with the bearer token returns claims. */
async function expectWhoamiWithBearer(page: Page) {
  const token = await page.evaluate(() => window.localStorage.getItem("DS"));
  expect(token, "session token in localStorage under DS").toBeTruthy();
  const res = await page.request.get("/api/whoami", {
    headers: { authorization: `Bearer ${token}` },
  });
  expect(res.status()).toBe(200);
  const body = (await res.json()) as { userId: string };
  expect(body.userId).toMatch(/^U/);
}

test("protected page redirects, the sign-in flow completes (email code), server validates", async ({
  page,
  context,
}) => {
  await page.goto("/me");
  await expect(page).toHaveURL(/\/login\?returnTo=%2Fme$/);

  // tp-sign-up-or-in: identifier first, then the email-verification subflow (test users have
  // no passkey or password).
  await continueWithEmail(page, GUEST.loginId);
  const how = await completeEmailVerification(page, context, GUEST);
  if (how === "magic-link")
    await page.goto("/me"); // tokens are shared per origin
  else
    await declineSignInOffers(
      page,
      page.getByRole("heading", { name: "My account" }),
    );

  await expectServerValidatedSession(page);
  await expectWhoamiWithBearer(page);
});

test("FR switch: the app and the sign-in flow render in French, EN switches back", async ({
  page,
}) => {
  await page.goto("/login");
  const english = page
    .getByText(/^(Sign in or create an account|Welcome to .+)$/)
    .first();
  await expect(english).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: "FR", exact: true }).click();
  await expect(
    page
      .getByText(/^(Connectez-vous ou créez un compte|Bienvenue chez .+)$/)
      .first(),
  ).toBeVisible({ timeout: 30_000 });
  // The app's own copy follows the same switch.
  await expect(
    page.getByRole("heading", { name: "Se connecter" }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");

  await page.getByRole("button", { name: "EN", exact: true }).click();
  await expect(english).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});

test("my account: Descope's user profile widget renders for the signed-in customer", async ({
  page,
}) => {
  await loginViaFlow(page, GUEST, "/me");
  const profile = page.getByTestId("user-profile");
  // The widget renders the customer's own details (Descope test users show their login ID).
  await expect(profile.getByText(GUEST.loginId).first()).toBeVisible({
    timeout: 30_000,
  });
});
