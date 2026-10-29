import { expect, test } from "@playwright/test";
import { AGENT, GUEST, loginViaFlow } from "./helpers/login";

/** Secure tools for customer service (req 21): find, view, impersonate, audit. */

test("agent: finds a customer, sees their bookings, views the account as them", async ({
  page,
}) => {
  await loginViaFlow(page, AGENT, "/service");
  await page.getByTestId("service-search").fill(GUEST.loginId);
  await page.getByRole("button", { name: "Find customer" }).click();
  await page.getByTestId("service-result").first().click();

  const panel = page.getByTestId("service-customer");
  // Their Descope family: both guardians and the dependents.
  const family = panel.getByTestId("service-family");
  await expect(family).toContainText("The Guest family", { timeout: 20_000 });
  await expect(family).toContainText("Sam Guest");
  await expect(family).toContainText("Biscuit");
  // The guest's history (3), plus anything booking.spec just added.
  const rows = panel
    .getByTestId("booking-list")
    .first()
    .getByTestId("booking-row");
  await expect(rows.nth(2)).toBeVisible();
  const count = await rows.count();
  await expect(panel.getByTestId("service-audit-row").first()).toBeVisible({
    timeout: 20_000,
  });

  await panel.getByTestId("service-impersonate").click();
  const impersonation = panel.getByTestId("service-impersonation");
  await expect(impersonation).toBeVisible({ timeout: 20_000 });
  // The token is the customer's; the agent is named as the actor.
  await expect(impersonation.getByTestId("service-actor")).toHaveText(/^U/);
  // As the customer, the same bookings the agent saw.
  await expect(impersonation.getByTestId("booking-row")).toHaveCount(count);
});

test("guest: no customer service link, the page is refused, and so is the API", async ({
  page,
}) => {
  await loginViaFlow(page, GUEST, "/bookings");
  await expect(
    page.getByRole("link", { name: "Customer service" }),
  ).toHaveCount(0);
  await page.goto("/service");
  await expect(page.getByTestId("forbidden")).toBeVisible();
  const token = await page.evaluate(() => window.localStorage.getItem("DS"));
  const res = await page.request.get("/api/service/customers", {
    headers: { authorization: `Bearer ${token}` },
  });
  expect(res.status()).toBe(403);
});
