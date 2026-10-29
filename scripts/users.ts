import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";
import { demoLoginId, SSO_TENANTS, TEST_USERS } from "./seed-data";

/**
 * Who to sign in as: `pnpm users`. Offline — reads scripts/seed-data.ts and DEMO_EMAIL from .env,
 * so it works before seed and never prints secrets.
 */
const repoRoot = resolve(fileURLToPath(import.meta.url), "../..");
loadDotenv({ path: resolve(repoRoot, ".env"), quiet: true });
const demoEmail = process.env.DEMO_EMAIL?.trim() || undefined;

const rows = TEST_USERS.map((u) => {
  const tenant = u.tenants[0];
  return [
    u.displayName,
    demoEmail ? demoLoginId(u.loginId, demoEmail) : "(set DEMO_EMAIL)",
    u.loginId,
    tenant ? tenant.tenantId : "— (Personal account)",
    (tenant ? tenant.roles : (u.roles ?? [])).join(", "),
  ];
});
for (const t of SSO_TENANTS) {
  rows.push([
    `Any ${t.name} employee (SSO)`,
    `anyone@${t.sso.domain} via mocksaml`,
    "—",
    t.id,
    t.sso.defaultRoles.join(", "),
  ]);
}

const header = [
  "Persona",
  "Live demo login",
  "Test user (e2e)",
  "Tenant",
  "Roles",
];
console.log(`| ${header.join(" | ")} |`);
console.log(`|${header.map(() => "---").join("|")}|`);
for (const r of rows) console.log(`| ${r.join(" | ")} |`);
console.log(`
Live demo logins get their code by email (your inbox, via plus addressing).
Test users: \`pnpm otp <test user> [tenant]\` prints a code; no inbox needed.
SSO: enter any address @${SSO_TENANTS[0]?.sso.domain ?? "example.org"}; mocksaml accepts any password.
Org users: pick "Organization" on /login, or open /login?tenant=<tenant>.`);
if (!demoEmail) {
  console.log(
    "\nDEMO_EMAIL is not set in .env: add your work email, then run pnpm seed.",
  );
}
