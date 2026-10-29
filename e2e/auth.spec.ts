import { expect, type Page, test } from "@playwright/test";
import {
  completeEmailVerification,
  continueWithEmail,
  declinePdOffers,
  GUEST,
  loginViaSdk,
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

test("flow mode: protected page redirects, TravelCorp's flow completes (email code), server validates", async ({
  page,
  context,
}) => {
  await context.addInitScript(() =>
    window.localStorage.setItem("kit.authMode", "flow"),
  );
  await page.goto("/me");
  await expect(page).toHaveURL(/\/login\?returnTo=%2Fme$/);

  // tp-sign-up-or-in: identifier first, then the email-verification subflow (test users have
  // no passkey or password).
  await continueWithEmail(page, GUEST.loginId);
  const how = await completeEmailVerification(page, context, GUEST);
  if (how === "magic-link")
    await page.goto("/me"); // tokens are shared per origin
  else
    await declinePdOffers(
      page,
      page.getByRole("heading", { name: "My account" }),
    );

  await expectServerValidatedSession(page);
  await expectWhoamiWithBearer(page);
});

test("FR switch: the app and TravelCorp's flow render in French, EN switches back", async ({
  page,
  context,
}) => {
  await context.addInitScript(() =>
    window.localStorage.setItem("kit.authMode", "flow"),
  );
  await page.goto("/login");
  const english = page
    .getByText(/^(Sign in or create an account|Welcome to TravelCorp)$/)
    .first();
  await expect(english).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: "FR", exact: true }).click();
  await expect(
    page
      .getByText(
        /^(Connectez-vous ou créez un compte|Bienvenue chez TravelCorp)$/,
      )
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

test("sdk mode: hand-built OTP UI completes, server validates", async ({
  page,
}) => {
  await loginViaSdk(page, GUEST, "/me");
  await expectServerValidatedSession(page);
  await expectWhoamiWithBearer(page);
});

test("my account: Descope's user profile widget renders for the signed-in customer", async ({
  page,
}) => {
  await loginViaSdk(page, GUEST, "/me");
  const profile = page.getByTestId("user-profile");
  // The widget renders the customer's own details (Descope test users show their login ID).
  await expect(profile.getByText(GUEST.loginId).first()).toBeVisible({
    timeout: 30_000,
  });
});
