export type Diagnostic = {
  id: string;
  status: "ready" | "blocked" | "unverified" | "info";
  message: string;
};

function base(value: string | undefined) {
  try {
    const url = new URL(value || "https://api.descope.com");
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/"
    )
      return undefined;
    return url.origin;
  } catch {
    return undefined;
  }
}
/** Pure, offline checks. Messages deliberately contain no environment values. */
export function diagnose(
  env: Record<string, string | undefined>,
  hasFile: boolean,
): Diagnostic[] {
  const server = base(env.DESCOPE_BASE_URL);
  const browser = base(env.VITE_DESCOPE_BASE_URL);
  const configured =
    hasFile &&
    Boolean(
      env.DESCOPE_PROJECT_ID &&
        env.VITE_DESCOPE_PROJECT_ID &&
        env.DESCOPE_MANAGEMENT_KEY,
    );
  const matching = Boolean(
    configured &&
      env.DESCOPE_PROJECT_ID === env.VITE_DESCOPE_PROJECT_ID &&
      server &&
      server === browser,
  );
  const exposed = Object.keys(env).some(
    (key) =>
      key.startsWith("VITE_") &&
      /MANAGEMENT|SECRET|PASSWORD|TEST_OTP|PRIVATE_KEY/i.test(key) &&
      env[key],
  );
  return [
    {
      id: "environment",
      status: configured ? "ready" : "blocked",
      message: configured
        ? "Required root .env settings are present."
        : "Create root .env with both project settings and a management key; live smoke cannot run.",
    },
    {
      id: "target",
      status: matching ? "ready" : "blocked",
      message: matching
        ? "Browser/API project and base URL match."
        : "Browser/API target missing, invalid, or mismatched. Compare project and region in root .env.",
    },
    {
      id: "browser-secrets",
      status: exposed ? "blocked" : "ready",
      message: exposed
        ? "A secret setting has a VITE_ prefix; remove it before building."
        : "No recognized server-only secrets exposed with a VITE_ prefix.",
    },
    {
      id: "ports-config",
      status:
        (!env.PORT || env.PORT === "3001") &&
        (!env.WEB_ORIGIN ||
          env.WEB_ORIGIN.split(",")
            .map((o) => o.trim())
            .includes("http://localhost:5173"))
          ? "ready"
          : "blocked",
      message:
        "Default smoke runner requires API :3001 and web origin http://localhost:5173. Adapt Vite and Playwright together for other ports.",
    },
    {
      id: "demo-email",
      status: "info",
      message: env.DEMO_EMAIL?.trim()
        ? "DEMO_EMAIL is set: seed creates plus-addressed live demo users (pnpm users lists them)."
        : "DEMO_EMAIL is empty: seed creates only @example.com test users; set your work email for live demo logins.",
    },
    {
      id: "otp",
      status: "info",
      message: env.DESCOPE_TEST_OTP?.trim()
        ? "Static OTP selected locally. Verify Console Static OTP and verifier regex separately; value is hidden."
        : "Management-generated OTP selected. If Console uses Static OTP, set server-only DESCOPE_TEST_OTP to match.",
    },
    {
      id: "mcp",
      status: "unverified",
      message:
        "Local diagnostics cannot attest MCP connectivity. Before project access, call session getProjectStatus, name the project/customer, and compare project and region with .env.",
    },
    {
      id: "resources",
      status: "unverified",
      message:
        "After MCP preflight, run pnpm seed:plan and review what seed would create, update or preserve.",
    },
    {
      id: "branding",
      status: "unverified",
      message:
        "brand:guard checks local drift. Hosted flow backgrounds, widgets, light/dark and mobile require visual verification in the target project.",
    },
  ];
}
