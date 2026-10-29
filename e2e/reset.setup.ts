import { expect, test as setup } from "@playwright/test";

// Restore the API's in-memory demo data. Fresh servers start clean, but in UI/watch mode they stay
// up between re-runs, so earlier tests may already have changed bookings or families.
setup("reset demo data", async ({ request }) => {
  const res = await request.post("/api/demo/reset");
  expect(
    res.status(),
    "POST /api/demo/reset failed: is KIT_DEMO_RESET=false in .env?",
  ).toBe(204);
});
