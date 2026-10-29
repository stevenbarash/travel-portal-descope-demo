# Travel Portal × Descope — demo application

A travel-portal demo: one customer profile across many bookings, passwordless
sign-in, sign-up straight from a booking, households with Descope Family Accounts, and secure tools
for customer service. It's a reference implementation, not production code. Use it to see exactly
how each piece calls Descope, then run it against your own Descope project.

## What's in it

| Page                              | What it shows                                                                                                                                                                                                                                                                      | Your requirements                      |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| **Book a break** (`/book`)        | Book without an account. "Continue to book" embeds Travel Portal's sign-up-or-in flow on the page, with the email and name carried over from the form and Apple first for Apple Pay customers. After sign-in you land back on the same booking. "Who's coming?" lists your family. | 2, 3, +, 15, 20                        |
| **Sign in** (`/login`)            | Travel Portal's flow: passkeys where the device supports them, Apple and Google, email code or link with a masked address and resend, password with your policy, optional authenticator app, a 50/50 A/B welcome variant, a honeypot bot trap. EN/FR switch in the header.         | 1, 2, 4, 5, 6, 7, 8, 9, 10, 14, 17, 18 |
| **My bookings** (`/bookings`)     | Every booking on one profile, shared by the household.                                                                                                                                                                                                                             | one profile                            |
| **My family** (`/family`)         | Descope Family Accounts: guardians who sign in as themselves, dependents (children, pets) with no login, adding and removing dependents, and "Act for" a dependent with the guardian named in the token.                                                                           | households                             |
| **My account** (`/me`)            | Descope's User Profile widget for self-service (name, email, phone, passkeys, password, authenticator app), next to the validated session and its claims.                                                                                                                          | self-service                           |
| **Customer service** (`/service`) | For the Customer Service role: find a customer, see their family, bookings and audit trail, and view the account as the customer, with the agent named in the token.                                                                                                               | 21                                     |

## How it's built

- `apps/web`: Vite + React + `@descope/react-sdk`. Embeds the hosted flow (`<Descope flowId=…>`)
  and the User Profile widget, and reads the session JWT for UI gating only.
- `apps/api`: Express + `@descope/node-sdk`. Validates the session on every request and
  authorizes from the token's claims: `roles` / `permissions` for customer service, and
  `families` for household actions. Bookings are in memory and reset on restart.
- `packages/descope/src/server.ts`: the only file that calls the Descope Node SDK. Start here to
  see every Descope call the API makes.
- `packages/contracts`: the API's request and response shapes (zod), shared by both apps.
- `packages/brand/brand.ts`: name, colours, font and logo.
- `descope/customer-flows/`: Travel Portal's flows as JSON, with French translations in `localization/`.
- `descope/styles/`: the flow style (`travel-portal`) and a flat variant for widgets (`travel-portal-widget`).
- `scripts/`: management-key scripts that create the demo users, roles and families, and remove
  them again.
- `e2e/`: Playwright tests that drive each journey against a real project.
- `docs/descope-sdk-cheatsheet.md`: every SDK call used, with notes from verifying them.

## Run it against your Descope project

You need Node 24 and pnpm (`corepack enable`), plus a Descope project and a management key
(console → Company → Management Keys).

**1. In the Descope console**
- **Flows → Import flow**: import the four files in `descope/customer-flows/`, subflows first
  (`tp-email-verify`, `tp-profile`, `tp-mfa`), then `tp-sign-up-or-in`. For French, turn on
  Localization for each flow (source `en`, target `fr`, manual) and import its file from
  `descope/customer-flows/localization/`.
- **Authentication Methods**:
  - Passkeys: domain `localhost` (or your host).
  - Magic Link: redirect URL `http://localhost:5173/login`.
  - Social Login: Apple and Google.
  - Password: your password policy.
- **Users → Families**: enable Family Accounts.
- **Widgets**: make sure a User Profile widget exists. The app expects the ID `user-profile-widget`;
  set `VITE_DESCOPE_USER_PROFILE_WIDGET_ID` if yours differs.

**2. Locally**
```bash
pnpm install
cp .env.example .env        # fill in the project ID (twice) and the management key
pnpm style:import descope/styles/travel-portal.json
pnpm style:import descope/styles/travel-portal-widget.json
pnpm seed:plan              # read-only: what seed will create
pnpm seed                   # personas, roles, the Guest family
pnpm dev                    # web on http://localhost:5173, API on :3001
```

`pnpm seed` creates:
- the roles "Customer Service" (User Admin, Impersonate) and "Family Admin" (Family Impersonate
  Dependents); existing roles with those names are reused, never edited;
- test users `guest@example.com` (Gemma), `partner@example.com` (Sam) and `agent@example.com`
  (Alex, customer service);
- "The Guest family": Gemma and Sam are guardians, Mia, Leo and Biscuit are dependents.

Test users don't receive email: `pnpm otp guest@example.com` prints a sign-in code. To sign in with
a real inbox, set `DEMO_EMAIL` in `.env` before seeding, and seed also creates `you+guest@…`,
`you+partner@…` and `you+agent@…`. `pnpm users` lists who to sign in as.

`pnpm reset` removes only what seed created (it keeps a local record in `.kit-state/`). Everything
else in the project is left alone.

## Checks

| Command             | What                                                                                      |
| ------------------- | ----------------------------------------------------------------------------------------- |
| `pnpm check`        | typecheck, lint, brand check, unit tests (no Descope project needed)                      |
| `pnpm check:full`   | the above plus the Playwright suite against the project in `.env` (stop `pnpm dev` first) |
| `pnpm inspect`      | what's in the project: flows, roles, permissions, families                                |
| `pnpm flows:export` | refresh the flow JSON from the project                                                    |

The Debug button (bottom right) shows the decoded session, copies tokens, calls any API route and
simulates a session timeout.
