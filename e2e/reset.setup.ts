import { expect, test as setup } from "@playwright/test";

// The dev server may be reused from an earlier run whose tests changed in-memory demo data.
setup("reset demo data", async ({ request }) => {
  const res = await request.post("/api/demo/reset");
  expect(
    res.status(),
    "POST /api/demo/reset failed: is KIT_DEMO_RESET=false in .env?",
  ).toBe(204);
});
