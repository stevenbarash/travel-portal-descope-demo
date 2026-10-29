# Parkdean's flows (copy)

Parkdean's flows as JSON exports. Import them into your Descope project (console → Flows →
Import flow, subflows first: `pd-email-verify`, `pd-profile`, `pd-mfa`, then `pd-sign-up-or-in`).
They are **not managed by seed or reset**: seed only imports `demo-*` files from `descope/flows/`.
`pnpm flows:export` refreshes these copies from the project.

| Flow               | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Requirements                |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| `pd-sign-up-or-in` | Main journey (the web app's `VITE_DESCOPE_FLOW_ID`). Apple Pay customer (`form.applePay`)? → Apple-first welcome; otherwise a 50/50 A/B split (`abTestingKey < 50`) between the email-first and Apple-first welcome screens, both with a honeypot bot trap. Email → passkey if the customer has one **and** the device supports WebAuthn, else password if they have one, else `pd-email-verify`. Apple / Google go through OAuth. Then `pd-profile`, then (no passkey or password yet) a passkey offer if the device supports one, else an optional password, then `pd-mfa`. | 1, 2, 5, 10, 14, 17, 18, 20 |
| `pd-email-verify`  | Subflow: 6-digit email code to `{{sentTo.maskedEmail}}`, "Send a new code", "Email me a sign-in link instead" (magic link with a polling screen).                                                                                                                                                                                                                                                                                                                                                                                                                             | 6, 8, 9                     |
| `pd-profile`       | Subflow: name already on the account → done; name passed in from the booking (`form.displayName`) → saved silently; otherwise "Nearly there — what should we call you?".                                                                                                                                                                                                                                                                                                                                                                                                      | 3, +                        |
| `pd-mfa`           | Subflow: customers with an authenticator app enter its code; new customers are offered one (QR + code), optional.                                                                                                                                                                                                                                                                                                                                                                                                                                                             | 7                           |

Flow input from the booking page (`apps/web/src/features/bookings/BookPage.tsx`):
`form={ email, displayName, applePay }`.

Change log: 2026-10-21 `pd-profile` — the name input was `fullName` while "Save name" read
`form.displayName`, so a typed name was never saved; renamed to `displayName`.

2026-10-21: French (`fr`) added to all four flows. See "Localization" below.

## Localization (French)

`localization/<flowId>.json` holds each flow's overrides as `{ flowId, languages: { fr: { key: text } } }`,
the body of `POST /v1/mgmt/localization/flow/import` (MCP `flows_write` → `ImportFlowLocalization`,
as `overrides`). How it works (from the orchestration service source):
- Overrides only render when the flow itself has translation on: `translate: true`,
  `translateConnectorID: "manual"`, `translateSourceLang: "en"`, `translateTargetLangs: ["fr"]`.
  That's the console's Localization → Configure Localization, or a flow import carrying those
  fields. `pnpm flows:export` doesn't write these fields into the copies here.
- Key = `<last 4 chars of screen id>.<component id>.<display name, lower-kebab>.<prop>`, with a
  trailing `.children` dropped (for example `me-a.h1.text`, `code.resend.button`). Translated props: `children`, `label`,
  `placeholder`, `password-label`, the `data-errormessage-*` and `data-password-policy-message-*`
  attributes, `policy-label`, and others.
- With the `manual` connector, any string without an override stays in English. Add a key for every new
  string.
- Screen IDs that share their last 4 characters share a prefix. `password` and `set-password` both
  become `word`, which is why `set-password` uses `sp-h1`/`sp-p1`.
- The embedded flow picks the language from the `locale` prop, or else the browser
  (`fr-FR` → `fr`). The app always passes `locale` from the header EN/FR switch
  (`apps/web/src/auth/flowLocale.ts`), which defaults to the browser's language.
- Email and SMS message templates are separate (messaging localization) and still English.

Console prerequisites: Authentication Methods → Passkeys domain (`localhost` for local runs);
Magic Link redirect URL (`http://localhost:5173/login`); Social Login → Apple (Google works with
Descope's default credentials).
