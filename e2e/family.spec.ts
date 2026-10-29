import { expect, test } from "@playwright/test";
import { AGENT, GUEST, loginViaFlow, PARTNER } from "./helpers/login";

/**
 * Descope Family Accounts: one household, many people. Guardians (Gemma, Sam) sign in as
 * themselves; dependents (Mia, Leo, Biscuit) have no login. Seeded by `npm run seed`.
 */

test("guardian: sees the household, adds and removes a dependent, acts for a child", async ({
  page,
}) => {
  await loginViaFlow(page, GUEST, "/family");
  await expect(
    page.getByRole("heading", { name: "The Guest family" }),
  ).toBeVisible();
  const members = page.getByTestId("family-member");
  for (const name of ["Gemma Guest", "Sam Guest", "Mia Guest", "Biscuit"])
    await expect(members.filter({ hasText: name })).toBeVisible();
  // The session token carries the family and the guardian's family role.
  await expect(page.getByTestId("family-claim")).toContainText("Family Admin");

  // Add a dependent profile (no login), then remove it. Unique per run, in case a run died midway.
  const nana = `Nana ${Date.now().toString(36)}`;
  await page.getByTestId("family-add-name").fill(nana);
  await page.getByTestId("family-add-relationship").fill("Grandmother");
  await page.getByTestId("family-add-submit").click();
  const added = members.filter({ hasText: nana });
  await expect(added).toBeVisible({ timeout: 20_000 });
  await expect(added).toContainText("No login");
  await added.getByTestId("family-remove").click();
  await expect(added).toHaveCount(0, { timeout: 20_000 });

  // Act for Mia: Descope's token is Mia's, with Gemma as the actor.
  await members
    .filter({ hasText: "Mia Guest" })
    .getByTestId("family-act")
    .click();
  const acting = page.getByTestId("family-acting");
  await expect(acting).toContainText("Acting for Mia Guest", {
    timeout: 20_000,
  });
  await expect(acting.getByTestId("family-actor")).toHaveText(/^U/);
  // Mia's breaks: the two the whole family went on, not the grown-ups' weekend.
  await expect(acting.getByTestId("booking-row").nth(1)).toBeVisible();
});

test("co-guardian: signs in as themselves and sees the same household and bookings", async ({
  page,
}) => {
  await loginViaFlow(page, PARTNER, "/bookings");
  await expect(page.getByText("Shared with The Guest family")).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByTestId("booking-list")).toContainText("Lisbon");
  await page.getByRole("link", { name: "My family" }).click();
  await expect(
    page.getByTestId("family-member").filter({ hasText: "Sam Guest" }),
  ).toContainText("(you)");
});

test("customer without a family: no household, and the API refuses family changes", async ({
  page,
}) => {
  await loginViaFlow(page, AGENT, "/family");
  await expect(page.getByText("You're not in a family yet.")).toBeVisible({
    timeout: 20_000,
  });
  const token = await page.evaluate(() => window.localStorage.getItem("DS"));
  const res = await page.request.post("/api/family/dependents", {
    headers: { authorization: `Bearer ${token}` },
    data: { name: "Intruder", relationship: "Other" },
  });
  expect(res.status()).toBe(403);
});
