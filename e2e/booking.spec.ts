import { expect, test } from "@playwright/test";
import {
  completeEmailVerification,
  continueWithEmail,
  declinePdOffers,
  GUEST,
  loginViaSdk,
} from "./helpers/login";

/**
 * The moment the demo builds toward: book a break without an account, sign up from the booking
 * without re-entering details (req 3), land back on the same booking (req 15), and see every
 * booking under one profile.
 */

test("signed out: booking details flow into Travel Portal's sign-in, then back to the same booking", async ({
  page,
  context,
}) => {
  await page.goto("/book");
  await page.evaluate(() => window.localStorage.removeItem("tp.bookingDraft"));
  await page.reload();
  await page.getByTestId("book-destination").selectOption("cape-town");
  await page.getByTestId("book-accommodation").selectOption("hotel");
  await page.getByTestId("book-email").fill(GUEST.loginId);
  await page.getByTestId("book-name").fill(GUEST.displayName);
  await page.getByTestId("book-applepay").check();
  await page.getByTestId("book-continue").click();

  // The flow is embedded on the booking page with the email already filled in (req 3).
  const signin = page.getByTestId("book-signin");
  const email = signin.getByRole("textbox", { name: /email/i }).first();
  await expect(email).toHaveValue(GUEST.loginId, { timeout: 20_000 });

  // Apple Pay customer: "Continue with Apple" comes before Google (req 20).
  // Accessible names are the buttons' aria-labels ("Sign in with Apple"), not their text.
  const apple = signin.getByRole("button", { name: /apple/i });
  const google = signin.getByRole("button", { name: /google/i });
  const appleY = (await apple.first().boundingBox())?.y ?? 0;
  const googleY = (await google.first().boundingBox())?.y ?? 0;
  expect(appleY).toBeLessThan(googleY);

  await continueWithEmail(signin);
  const how = await completeEmailVerification(page, context, GUEST, {
    allowMagicLink: false,
  });
  test.skip(
    how === "magic-link-unsupported",
    "flow chose a magic link; the code path is what this test drives",
  );
  const review = page.getByTestId("book-review");
  await declinePdOffers(page, review);

  // Back on the same booking, at the confirm step (req 15).
  await expect(page.getByTestId("book-review-destination")).toHaveText(
    "Cape Town",
  );
  // Who's coming: the guest's Descope family, everyone ticked. Leave the dog at home.
  const party = page.getByTestId("book-party");
  await expect(party).toContainText("Mia Guest");
  await party.getByRole("checkbox", { name: /Biscuit/ }).uncheck();
  await page.getByTestId("book-confirm").click();
  await expect(page.getByTestId("book-reference")).toHaveText(/^PD\d{7}$/);

  // One profile, every booking: the returning guest's history plus the new one.
  await page.getByRole("link", { name: "See all my bookings" }).click();
  await expect(page.getByTestId("booking-row")).toHaveCount(4);
  const newquay = page
    .getByTestId("booking-row")
    .filter({ hasText: "Cape Town" });
  await expect(newquay).toBeVisible();
  await expect(newquay.getByTestId("booking-party")).toContainText("Mia");
  await expect(newquay.getByTestId("booking-party")).not.toContainText(
    "Biscuit",
  );
});

test("a booking interrupted by sign-in resumes where the customer left off", async ({
  page,
}) => {
  // The customer filled the form and was sent off to sign in (another tab, a redirect, a link).
  await page.goto("/");
  await page.evaluate(() =>
    window.localStorage.setItem(
      "tp.bookingDraft",
      JSON.stringify({
        destination: "banff",
        accommodation: "apartment",
        arrival: "2027-08-06",
        nights: 7,
        guests: 5,
        email: "guest@example.com",
        name: "Gemma Guest",
        applePay: false,
        step: "signin",
      }),
    ),
  );
  await loginViaSdk(page, GUEST, "/book");
  await expect(page.getByTestId("book-review")).toBeVisible();
  await expect(page.getByTestId("book-review-destination")).toHaveText("Banff");
});

test("returning guest: every booking on one account", async ({ page }) => {
  await loginViaSdk(page, GUEST, "/bookings");
  // Their history (3), plus anything the signed-out booking test just added.
  await expect(page.getByTestId("booking-row").nth(2)).toBeVisible();
  await expect(page.getByTestId("booking-list")).toContainText("Cayton Bay");
  await expect(page.getByTestId("booking-list")).toContainText("Stayed");
  // Who was on each break, from the Descope family.
  await expect(page.getByTestId("booking-party").first()).toContainText(
    "Biscuit",
  );
});
