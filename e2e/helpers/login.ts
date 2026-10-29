import { type BrowserContext, expect, type Page } from "@playwright/test";
import {
  AGENT_USER,
  GUEST_USER,
  PARTNER_USER,
  type SeedUser,
} from "../../scripts/seed-data";
import { magicLinkTo, otpFor } from "./descope";

export const GUEST = GUEST_USER;
export const AGENT = AGENT_USER;
export const PARTNER = PARTNER_USER;
export type { SeedUser };

/** Seeded users always log in scoped to their first tenant; required under tenant user isolation. */
export const loginTenantOf = (user: SeedUser): string | undefined =>
  user.tenants[0]?.tenantId;

/** The app the smoke suite runs against (Playwright's baseURL). */
export const APP_URL = "http://localhost:5173";

/**
 * After a magic-link sign-in the kit offers a passkey (flow: the promote-passkeys subflow; SDK
 * mode: its own offer). Decline it so the sign-in finishes; passkeys.spec covers accepting.
 */
export async function declinePasskeyOffer(page: Page) {
  const loggedIn = page.getByRole("button", { name: "Log out" });
  const notNow = page.getByRole("button", { name: "Not now" });
  // "Log out" is no signal: the session exists while the offer is still on screen. Sign-in is
  // done only once /login navigates to returnTo, so wait for the offer or for leaving /login.
  const onLogin = () => new URL(page.url()).pathname === "/login";
  await expect
    .poll(async () => !onLogin() || (await notNow.isVisible()), {
      timeout: 30_000,
    })
    .toBe(true);
  if (await notNow.isVisible()) await notNow.click();
  await expect.poll(onLogin, { timeout: 30_000 }).toBe(false);
  await expect(loggedIn).toBeVisible();
}

/**
 * Deterministic login through the kit's own SDK-mode UI: land on a management-generated magic
 * link for a seeded test user (no inbox), which SdkLogin verifies from `?t=`.
 */
export async function loginViaSdk(
  page: Page,
  user: SeedUser = GUEST,
  returnTo = "/me",
) {
  const tenant = loginTenantOf(user);
  await page.addInitScript(() =>
    window.localStorage.setItem("kit.authMode", "sdk"),
  );
  const q = new URLSearchParams({ returnTo });
  if (tenant) q.set("tenant", tenant);
  await page.goto(await magicLinkTo(`/login?${q}`, user.loginId, tenant));
  await declinePasskeyOffer(page);
}

/**
 * A hosted flow has asked for email verification. Complete it whichever way the flow chose:
 * a code screen gets a management-generated OTP; a "we sent a link" screen gets a management-
 * generated magic link opened in a second tab (verified via the web SDK if the flow ignores ?t=).
 * `root` scopes the lookups (e.g. to a dialog).
 */
export async function completeEmailVerification(
  page: Page,
  context: BrowserContext,
  user: SeedUser,
  {
    root = page,
    allowMagicLink = true,
  }: {
    root?: Page | ReturnType<Page["locator"]>;
    allowMagicLink?: boolean;
  } = {},
) {
  const loginId = user.loginId;
  const tenant = loginTenantOf(user);
  const codeInput = root
    .locator(
      'input[inputmode="numeric"], input[autocomplete="one-time-code"], input[type="tel"]',
    )
    .first();
  const linkScreen = root
    .getByText(/verification link|sign-in link|click the link/i)
    .first();
  await expect(codeInput.or(linkScreen).first()).toBeVisible({
    timeout: 20_000,
  });

  // A code screen can also offer "Email me a sign-in link instead": a visible code input wins.
  if (!(await codeInput.isVisible()) && (await linkScreen.isVisible())) {
    if (!allowMagicLink) return "magic-link-unsupported" as const;
    const link = await magicLinkTo(
      `/login${tenant ? `?tenant=${encodeURIComponent(tenant)}` : ""}`,
      loginId,
      tenant,
    );
    const landing = await context.newPage();
    await landing.goto(link);
    const loggedIn = landing.getByRole("button", { name: "Log out" });
    const notNow = landing.getByRole("button", { name: "Not now" });
    const handledByFlow = await loggedIn
      .or(notNow)
      .first()
      .waitFor({ state: "visible", timeout: 8_000 })
      .then(() => true)
      .catch(() => false);
    if (!handledByFlow) {
      const token = new URL(link).searchParams.get("t");
      expect(token, "magic link carries ?t=").toBeTruthy();
      const ok = await landing.evaluate(async (t) => {
        const res = await window.__kit?.sdk.magicLink.verify(t as string);
        return res?.ok ?? false;
      }, token);
      expect(ok, "sdk.magicLink.verify succeeded").toBe(true);
      // Verified outside the flow, so no promote step runs and /login doesn't navigate (it only
      // redirects users who were signed in when it opened). The session is enough here.
      await expect(loggedIn).toBeVisible({ timeout: 30_000 });
    } else await declinePasskeyOffer(landing);
    await landing.close();
    return "magic-link" as const;
  }

  const code = await otpFor(loginId, tenant);
  // Descope's passcode component is six auto-advancing digit boxes: type with real key events,
  // one digit at a time, or digits get dropped. Auto-submit fires on the sixth digit.
  await codeInput.click();
  await codeInput.pressSequentially(code, { delay: 120 });
  const verify = root
    .getByRole("button", { name: /verify|continue|submit/i })
    .first();
  if (await verify.isVisible().catch(() => false)) await verify.click();
  return "otp" as const;
}

/**
 * TravelCorp's welcome screen (tp-sign-up-or-in) comes in two A/B variants: "Continue" (email first)
 * or "Continue with email" (Apple first). Fill the email if it isn't pre-filled and continue.
 */
export async function continueWithEmail(
  root: Page | ReturnType<Page["locator"]>,
  email?: string,
) {
  const input = root.getByRole("textbox", { name: /email/i }).first();
  await expect(input).toBeVisible({ timeout: 20_000 });
  if (email) await input.fill(email);
  await root
    .getByRole("button", { name: /^continue( with email)?$/i })
    .first()
    .click();
}

/**
 * After verification, tp-sign-up-or-in may offer a passkey or password ("Not now" / "Skip for
 * now") and, for a first-seen customer, an authenticator app ("Not now"). Decline whichever
 * appear until `done` shows.
 */
export async function declinePdOffers(
  page: Page,
  done: ReturnType<Page["locator"]>,
) {
  const skip = page
    .getByRole("button", { name: /^(not now|skip for now)$/i })
    .first();
  for (let i = 0; i < 4; i++) {
    await expect
      .poll(async () => (await done.isVisible()) || (await skip.isVisible()), {
        timeout: 30_000,
      })
      .toBe(true);
    if (await done.isVisible()) return;
    await skip.click();
    // Offers can follow each other with the same button label; let the next screen render.
    await page.waitForTimeout(1_500);
  }
  await expect(done).toBeVisible();
}
