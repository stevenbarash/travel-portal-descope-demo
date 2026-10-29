// @vitest-environment happy-dom
import { act, useState } from "react";
import { createMemoryRouter, RouterProvider, useLocation } from "react-router";
import { beforeEach, expect, it, vi } from "vitest";
import { mountEachTest } from "../test/dom";
import { RequireAuth } from "./RequireAuth";
import { useCurrentTenantId } from "./useAuthz";

/** Session store the mocked useSession subscribes to, like the SDK's provider does. */
const state = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  const s = {
    isAuthenticated: true,
    isSessionLoading: false,
    subscribe: (l: () => void) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    set(isAuthenticated: boolean) {
      s.isAuthenticated = isAuthenticated;
      for (const l of listeners) l();
    },
  };
  return s;
});
vi.mock("@descope/react-sdk", async () => {
  const { useSyncExternalStore } = await import("react");
  return {
    useSession: () => {
      const isAuthenticated = useSyncExternalStore(
        state.subscribe,
        () => state.isAuthenticated,
      );
      return {
        isAuthenticated,
        isSessionLoading: state.isSessionLoading,
        sessionToken: isAuthenticated ? "token" : "",
        claims: {},
      };
    },
    useUser: () => ({
      user: state.isAuthenticated
        ? { email: "avery@example.com", loginIds: ["avery@example.com"] }
        : undefined,
      isUserLoading: false,
    }),
  };
});
// The dialog's login is exercised end to end; here only its presence matters.
vi.mock("./ReauthDialog", () => ({
  ReauthDialog: ({
    tenantId,
    loginHint,
  }: {
    tenantId?: string;
    loginHint?: string;
  }) => (
    <div data-testid="reauth-dialog" data-login-hint={loginHint}>
      {tenantId ?? "personal"}
    </div>
  ),
}));
// A signed-in user in `acme` until the session ends.
vi.mock("./authz", async (original) => ({
  ...(await original<typeof import("./authz")>()),
  decodeJwtPayload: () =>
    state.isAuthenticated
      ? { tenants: { acme: { roles: ["admin"], permissions: [] } } }
      : {},
}));

/** A page with local state, like a half-typed form. */
function Draft() {
  const [text, setText] = useState("");
  const tenant = useCurrentTenantId();
  return (
    <>
      <input
        data-testid="draft"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <span data-testid="tenant">{tenant ?? "none"}</span>
    </>
  );
}

/** Stands in for /login and shows the URL RequireAuth sent the user to. */
function LoginProbe() {
  const { search } = useLocation();
  return <p data-testid="login">{search}</p>;
}

const dom = mountEachTest();
beforeEach(() => {
  state.isAuthenticated = true;
  state.isSessionLoading = false;
});
const sessionEnds = () => act(async () => state.set(false));
const signsBackIn = () => act(async () => state.set(true));

function setup(initial = "/items") {
  const router = createMemoryRouter(
    [
      { path: "/login", element: <LoginProbe /> },
      {
        element: <RequireAuth />,
        children: [{ path: "/items", element: <Draft /> }],
      },
    ],
    { initialEntries: [initial] },
  );
  return () =>
    act(async () => dom.root.render(<RouterProvider router={router} />));
}
const q = (id: string) =>
  dom.host.querySelector(`[data-testid="${id}"]`) as HTMLInputElement | null;

it("keeps the page, its state and its tenant when the session ends on it", async () => {
  const render = setup();
  await render();
  const input = q("draft");
  expect(input).not.toBeNull();
  // A controlled input remembers what was typed only in React state.
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    setter?.call(input, "half-typed");
    input?.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(q("draft")?.value).toBe("half-typed");

  await sessionEnds();
  expect(q("reauth-dialog")?.textContent).toBe("acme");
  // Prefilled with who was signed in, captured while the session was live.
  expect(q("reauth-dialog")?.dataset.loginHint).toBe("avery@example.com");
  expect(q("draft")).toBe(input); // same element: never remounted
  expect(q("draft")?.value).toBe("half-typed");
  expect(q("tenant")?.textContent).toBe("acme");
  expect(q("login")).toBeNull();

  await signsBackIn();
  expect(q("reauth-dialog")).toBeNull();
  expect(q("draft")?.value).toBe("half-typed");
});

it("sends someone who never had a session on the page to /login", async () => {
  state.isAuthenticated = false;
  await setup()();
  expect(q("login")).not.toBeNull();
  expect(q("reauth-dialog")).toBeNull();
});

it("keeps a sign-in link's token top-level when it lands on a protected page", async () => {
  state.isAuthenticated = false;
  await setup("/items?filter=open&t=TOKEN&el=1")();
  const search = new URLSearchParams(q("login")?.textContent ?? "");
  expect(search.get("t")).toBe("TOKEN");
  expect(search.get("el")).toBe("1");
  expect(search.get("returnTo")).toBe("/items?filter=open");
});
