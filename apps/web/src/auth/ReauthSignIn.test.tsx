// @vitest-environment happy-dom
import { act } from "react";
import { MemoryRouter } from "react-router";
import { beforeEach, expect, it, vi } from "vitest";
import { deferred, mountEachTest } from "../test/dom";
import { ReauthDialog } from "./ReauthDialog";

/**
 * A sent enchanted link is polled in short windows, each held open by the test. A successful
 * poll would store that account's session, so polling must stop when the user cancels or the
 * dialog closes, and the dialog must not offer another account while a poll can still land.
 */
const sdk = vi.hoisted(() => ({
  windows: [] as { resolve: (v: { ok: boolean }) => void }[],
  enchantedLink: {
    signUpOrIn: vi.fn(async () => ({
      ok: true,
      data: { pendingRef: "ref", linkId: "42" },
    })),
    waitForSession: vi.fn(),
  },
  webauthn: { signIn: vi.fn() },
}));
vi.mock("@descope/react-sdk", () => ({ useDescope: () => sdk }));

const dom = mountEachTest();
beforeEach(() => {
  sdk.windows = [];
  sdk.enchantedLink.waitForSession.mockReset();
  sdk.enchantedLink.waitForSession.mockImplementation(() => {
    const d = deferred<{ ok: boolean }>();
    sdk.windows.push(d);
    return d.promise;
  });
});

const q = (sel: string) => dom.host.querySelector(sel);
const byText = (text: string) =>
  [...dom.host.querySelectorAll("button, a")].find(
    (el) => el.textContent?.trim() === text,
  ) as HTMLElement | undefined;
/** End the current poll window with a timeout, as the SDK does. */
const windowTimesOut = () =>
  act(async () => sdk.windows.at(-1)?.resolve({ ok: false }));

async function sendLink() {
  await act(async () =>
    dom.root.render(
      <MemoryRouter>
        <ReauthDialog loginHint="avery@example.com" />
      </MemoryRouter>,
    ),
  );
  await act(async () =>
    q("form")?.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    ),
  );
  expect(q('[data-testid="reauth-link-sent"]')).not.toBeNull();
}

it("keeps polling in windows, and hides the account switch while it can still land", async () => {
  await sendLink();
  expect(byText("Use a different account")).toBeUndefined();
  await windowTimesOut();
  await windowTimesOut();
  expect(sdk.enchantedLink.waitForSession).toHaveBeenCalledTimes(3);
  expect(sdk.enchantedLink.waitForSession).toHaveBeenLastCalledWith("ref", {
    pollingIntervalMs: 1000,
    timeoutMs: 5000,
  });
});

it("Cancel stops polling after the current window, then offers the form again", async () => {
  await sendLink();
  await act(async () => byText("Cancel")?.click());
  expect(byText("Stopping…")).toBeDefined();
  await windowTimesOut();
  expect(sdk.enchantedLink.waitForSession).toHaveBeenCalledTimes(1);
  expect(q('[data-testid="reauth-link-sent"]')).toBeNull();
  expect(byText("Use a different account")).toBeDefined();
  expect(q(".text-danger")).toBeNull(); // cancelling isn't an error
});

it("stops polling once the dialog is gone", async () => {
  await sendLink();
  await act(async () => dom.root.render(<p>signed in another way</p>));
  await windowTimesOut();
  expect(sdk.enchantedLink.waitForSession).toHaveBeenCalledTimes(1);
});
