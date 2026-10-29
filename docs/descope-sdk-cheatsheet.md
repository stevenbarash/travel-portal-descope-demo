# Descope SDK cheatsheet (pinned to installed versions)

Every Descope SDK call in this repo must appear here. Before using anything else, grep the
installed types (`apps/web/node_modules/@descope/react-sdk/dist/index.d.ts`,
`packages/descope/node_modules/@descope/node-sdk/dist/index.d.ts`) or ask the Descope docs MCP.
Docs lag SDK source; the `.d.ts` is the truth. Re-verify this file when bumping either SDK.

| Package              | Version verified                     | Date       |
| -------------------- | ------------------------------------ | ---------- |
| `@descope/react-sdk` | 3.3.10                               | 2026-10-01 |
| `@descope/node-sdk`  | 2.18.0 (Family Accounts re-verified) | 2026-10-29 |

## Node SDK (`@descope/node-sdk`) — constructed only in `packages/descope/src/server.ts`; scripts and e2e reach it via `.client`

```ts
import DescopeClient, { type AuthenticationInfo } from "@descope/node-sdk";
const client = DescopeClient({ projectId, managementKey?, baseUrl? });

// Session
client.validateSession(sessionToken: string, options?: VerifyOptions): Promise<AuthenticationInfo>
client.refreshSession(refreshToken: string): Promise<RefreshAuthenticationInfo>
client.validateAndRefreshSession(sessionToken?: string, refreshToken?: string): Promise<RefreshAuthenticationInfo>
// AuthenticationInfo = { jwt: string; token: Token; cookies?: string[] }
// Token = { sub?: string; exp?: number; iss?: string; [claim: string]: unknown }
//   Descope claims seen in session JWTs: roles: string[], permissions: string[],
//   tenants: { [tenantId]: { roles?: string[]; permissions?: string[] } }, dct (current tenant),
//   amr, drn, rexp. Custom claims are top-level.

// Cookie names the web SDK uses in cookie mode
DescopeClient.SessionTokenCookieName  // "DS"
DescopeClient.RefreshTokenCookieName  // "DSR"

// Authorization (pure functions over AuthenticationInfo — no network)
client.validatePermissions(auth, permissions: string[]): boolean
client.validateRoles(auth, roles: string[]): boolean
client.validateTenantPermissions(auth, tenantId: string, permissions: string[]): boolean
client.validateTenantRoles(auth, tenantId: string, roles: string[]): boolean
client.getMatchedPermissions / getMatchedRoles / getMatchedTenantPermissions / getMatchedTenantRoles

// Management: test users (M2)
client.management.user.createTestUser(loginId: string, options?: UserOptions): Promise<SdkResponse<UserResponse>>
//   UserOptions: { email?, phone?, displayName?, roles?, userTenants?: [{ tenantId, roleNames }], customAttributes?, verifiedEmail?, ... }
client.management.user.generateOTPForTestUser(deliveryMethod: "email"|"sms"|"whatsapp"|"voice", loginId: string, loginOptions?): Promise<SdkResponse<{ code: string; loginId: string }>>
client.management.user.generateMagicLinkForTestUser(deliveryMethod, loginId: string, uri: string, loginOptions?): Promise<SdkResponse<{ link: string; loginId: string }>>
//   link = `${uri}?t=<token>`; loading a page that renders the flow there completes sign-in
client.management.user.generateEnchantedLinkForTestUser(loginId: string, uri: string, loginOptions?): Promise<SdkResponse<{ link: string; loginId: string; pendingRef: string }>>
//   Enchanted-link counterpart (no deliveryMethod). Verify the link's `t` (web: sdk.enchantedLink.verify) and
//   the tab polling `sdk.enchantedLink.waitForSession(pendingRef)` receives the session (e2e/session.spec.ts).
client.management.user.load(loginIdOrUserId: string): Promise<SdkResponse<UserResponse>>   // ok=false when missing
client.management.user.removeAllPasskeys(loginId): Promise<SdkResponse<never>>   // e2e passkey cleanup
//   also listPasskeys(loginId), removePasskey(loginId, credentialId)
client.management.user.delete(loginIdOrUserId: string): Promise<SdkResponse<never>>
client.management.user.searchTestUsers(options)
client.management.user.deleteAllTestUsers(): Promise<SdkResponse<never>>

// Management: tenants / roles / permissions (seed & reset)
client.management.tenant.createWithId(id: string, name: string): Promise<SdkResponse<never>>   // names unique per project
client.management.tenant.load(id) / loadAll() / searchAll(ids?: string[]) / delete(id: string, cascade?: boolean)
client.management.role.create(name: string, description?: string, permissionNames?: string[], tenantId?: string)
client.management.role.loadAll() / delete(name: string, tenantId?: string)
client.management.permission.create(name: string, description?: string) / loadAll() / delete(name: string)
client.management.user.searchAll(tenantIds?, roles?, limit?, page?, testUsersOnly?, withTestUser?, customAttributes?, statuses?, emails?, phones?)
//   Test users are excluded unless withTestUser=true. Search by `emails` to find users regardless of tenant isolation.
client.management.flow.list(): Promise<SdkResponse<{ flows: { id, name, description?, disabled }[] }>>
client.management.flow.export(flowId): Promise<SdkResponse<{ flow: Flow; screens: Screen[] }>>
client.management.flow.import(flowId, flow: Flow, screens?: Screen[]): Promise<SdkResponse<FlowResponse>>   // creates or REPLACES flowId
client.management.flow.delete(flowIds: string[]): Promise<SdkResponse<never>>
//   Flow = { id, name, description?, dsl, disabled }; dsl = { startTask, tasks: { [id]: task } }
//   task.type: "screen" (screenId, next.rules[{interactionId, taskId}]) | "automated" (action, arguments) | "condition"
//   Screen = { id: "SC…", flowId, inputs, interactions, htmlTemplate (component tree), componentsVersion }
//   Actions seen: sign-up-or-in-otp-email, verify-code-otp-email, sign-in-otp-email, loadUser, step-up, logged-in,
//   sign-up-or-in-magic-linkv3-email, verify-magic-link, oauth-start, exchange-oauth-code, webauthn-sign-up-or-in-start/finish

// Tenant User Isolation (project setting; verified 2026-09-16)
//   One tenant per user (createTestUser with >1 tenant → E061015). Stored loginId = `<loginId>-<tenantId>`.
//   Authentication must name the tenant: sdk.otp.signUpOrIn.email(loginId, { tenantId }) / <Descope tenant="...">.
//   otp.verify.email(loginId, code) accepts the plain login ID after a tenant-scoped send.
//   generateOTPForTestUser / generateMagicLinkForTestUser need the STORED login ID (LoginOptions.tenantId → E065103).

// Step-up (verified in docs 2026-09-16): after the step-up flow, the session JWT carries `su: true`.
//   Backend: `Boolean(authInfo.token.su)`. Web: read `su` from the token payload.

// Management: theme/snapshot — NOT used by the kit (import replaces project config; overwrite risk)
client.management.theme.export() / import(theme)   // single project theme
// Management: project snapshot (reference only)
client.management.project.exportSnapshot(): Promise<SdkResponse<ExportSnapshotResponse>>   // { files: Record<string, any> }
client.management.project.validateSnapshot({ files, secrets? }): Promise<SdkResponse<ValidateSnapshotResponse>>
client.management.project.importSnapshot({ files, secrets? }): Promise<SdkResponse<never>>

// ---- Not used by the kit yet. Verified against a live project in a demo build (node-sdk 2.17.0,
//      2026-09-22); add the call to packages/descope when a scenario needs it. ----
// FGA (ReBAC). Schema DSL starts `model AuthZ 1.0`: types, relations, permissions, `with` conditions.
//   The DSL has NO comment syntax: saveSchema rejects `//` lines. Strip them if the file is annotated.
//   The schema is PROJECT-WIDE: never replace one this checkout didn't save.
client.management.fga.loadSchema(): Promise<SdkResponse<{ dsl: string }>>
client.management.fga.dryRunSchema({ dsl }): Promise<SdkResponse<FGASchemaDryRunResponse>>   // deletesPreview
client.management.fga.saveSchema({ dsl }): Promise<SdkResponse<never>>
client.management.fga.createRelations(FGARelation[]) / deleteRelations(FGARelation[])
client.management.fga.deleteSchema(): Promise<SdkResponse<never>>   // reset deletes only a schema this checkout saved
client.management.fga.check(FGARelation[]): Promise<SdkResponse<{ allowed, tuple }[]>>
client.management.fga.checkWithContext(FGARelation[], context): Promise<SdkResponse<{ allowed, tuple }[]>>
//   FGARelation = { resource, resourceType?, relation, target, targetType? }
//   Condition values come from check-time context; nothing is stored on the relation:
//     DateExpiryEpochSeconds → { now_epoch_seconds, expiry_epoch_seconds }   NumAtMost → { num, max }
//     custom CEL: condition OnShift(hour int, shift_start int, shift_end int) { ... } → { hour, shift_start, shift_end }
//   Read the whole result, not only `allowed`: missing context or a condition error also reads as denied.
//   Relations name users by userId. Seed recreating a test user gives it a new userId, so re-create
//   its relations too or they point at a deleted user.
// Users
client.management.user.createBatch(User[]): Promise<SdkResponse<CreateOrInviteBatchResponse>>
//   User.hashedPassword.pbkdf2 = { hash, salt, iterations, type: "sha1"|"sha256"|"sha512" } (base64).
//   Works with `test: true`. Password sign-in is OFF by default in a project: enable it first
//   (MCP ConfigurePasswordSettings) or migrated users can't sign in.
client.management.user.create(loginId, UserOptions): Promise<SdkResponse<UserResponse>>
//   A real user (receives mail). Seed uses it for the plus-addressed demo users; e2e never does.
//   Creating a user sends nothing; it stays "invited" until its first sign-in.
client.management.user.createTestUser(loginId, UserOptions)   // same options; never sent mail
client.management.user.patch(loginIdOrUserId, { roles?, userTenants?, ... })
//   Updates only the fields given (ssoAppIds, custom attributes, sessions survive). Seed uses it to
//   fix a recorded user's roles; `update` would replace the whole user.
client.management.role.update(name, newName, description?, permissionNames?)
client.management.tenant.searchAll()   // full tenant inventory; seed plans from it, because a
//   failed individual tenant.load() is not proof that a tenant is absent
// SSO
client.management.sso.configureSAMLByMetadata(tenantId, { idpMetadataUrl, attributeMapping?,
    defaultSSORoles?, roleMappings? }, redirectUrl?, domains?, ssoId?)
//   Seed: mocksaml (https://mocksaml.com/api/saml/metadata), attributeMapping
//   { email: "email", givenName: "firstName", familyName: "lastName" }, domains ["example.org"].
//   Fails when the domain already routes to another tenant's SSO.
client.management.user.activate(loginIdOrUserId) / .deactivate(loginIdOrUserId): Promise<SdkResponse<UserResponse>>
//   A deactivated ("disabled") user is refused at sign-in. Right after a change, user.searchAll can
//   briefly return the old status: trust the response's `status`. Management-created users are
//   "invited" until their first sign-in and can still sign in, so lockdown acts on them too.
// Tenants / audit
client.management.tenant.generateSSOConfigurationLink(tenantId, expireSeconds, ssoId?, email?, templateId?, actorId?)
//   → { adminSSOConfigurationLink }  (SSO Setup Suite: customer self-service SAML/OIDC + SCIM)
client.management.audit.search({ tenants, from, ... }): Promise<SdkResponse<AuditRecord[]>>
//   Also by customer: { userIds: [userId], from } (from ≤ 30 days back). AuditRecord =
//   { userId, action, occurred (ms), device, method, geo, remoteAddress, loginIds, tenants, data }.
// Customers (B2C) — customer service console
client.management.user.loadByUserId(userId): Promise<SdkResponse<UserResponse>>
//   UserResponse: loginIds, email, name, status, createdTime (seconds), password, TOTP, OAuth
//   { google: true, ... }. `webauthn` comes back from the API but is missing from the type.
client.management.user.search({ text?, limit?, withTestUser?, emails?, userIds?, ... }): Promise<SdkResponse<{ users, total }>>
//   Free-text over email/name/phone. Note: `search` returns { users, total }, `searchAll` an array.
client.management.jwt.impersonate(impersonatorId, loginId, validateConsent, customClaims?, selectedTenant?, refreshDuration?): Promise<SdkResponse<{ jwt }>>
//   Lives under `jwt`, NOT `user` (management.user.impersonate does not exist). The impersonator
//   needs the built-in Impersonate permission. The JWT's `sub` is the customer, `act.sub` the agent.

// Family Accounts (B2C households) — `management.family` + family bits of `management.user`.
// Verified against a live project 2026-10-29. Settings live in the console (Users → Families) or:
client.management.family.getSettings(): Promise<SdkResponse<{ enabled?, maxFamilyMembers?, allowMultipleFamiliesUsers? }>>
client.management.family.searchAll({ ids?, names?, text?, customAttributes?, page?, size? }): Promise<SdkResponse<Family[]>>
client.management.family.createWithId(id, name, customAttributes?, photo?, disabled?): Promise<SdkResponse<Family>>
client.management.family.delete(id): Promise<SdkResponse<never>>
client.management.family.createDependent(familyId, { loginId?, name?, email?, familyScopedAttributes?, ... }): Promise<SdkResponse<UserResponse>>
//   A dependent: no credentials, `dependent: true`, `test: false`. Pass your own loginId (never an
//   email; it's derived from the name otherwise, which collides across families).
client.management.family.deleteDependent(userId): Promise<SdkResponse<never>>
client.management.family.impersonateDependent(guardianIdOrLoginId, dependentLoginId, selectedFamily?): Promise<SdkResponse<{ jwt }>>
//   JWT: `sub` the dependent, `act.sub` the guardian, `dcf` the family, `drn: "DSR"` (a refresh
//   token; don't hand it to the browser). Descope refuses with E068104 unless the guardian holds
//   the family permission "Family Impersonate Dependents" in that family.
client.management.user.addFamilies(loginIdOrUserId, [{ familyId, roleNames?, familyScopedAttributes? }]): Promise<SdkResponse<UserResponse>>
client.management.user.removeFamilies(loginIdOrUserId, familyIds): Promise<SdkResponse<UserResponse>>
client.management.user.search({ familyIds?, dependent?, withTestUser?, loginIds?, ... })  // members of a family
client.management.user.getFamilyScopedCustomAttributes() / createFamilyScopedCustomAttributes([{ name, displayName, type: 1 /* text */ }]) / deleteFamilyScopedCustomAttributes(names)
//   UserResponse.userFamilies: [{ familyId, roleNames, permissions, familyScopedAttributes }].
//   Session JWT: `families: { <familyId>: { roles, permissions } }`, shaped like `tenants`
//   (read it with `familiesOf(auth)` in packages/descope, `authz.families` in the web app).

// SdkResponse<T> = { ok: boolean; code?: number; data?: T; error?: { errorCode, errorDescription, errorMessage? } }
```

## React SDK (`@descope/react-sdk`) — used in `apps/web/src/` (`auth/`, `app/`, `features/`, `api/client.ts`) and via `window.__kit.sdk` in e2e

```tsx
import { AuthProvider, Descope, useDescope, useSession, useUser, getSessionToken, getRefreshToken,
         getJwtRoles, getJwtPermissions, getCurrentTenant } from "@descope/react-sdk";

<AuthProvider
  projectId={string}
  baseUrl={string?}                       // custom domain
  sessionTokenViaCookie={boolean | { sameSite?: "Strict"|"Lax"|"None"; secure?: boolean; cookieName?: string; domain?: string }}
  persistTokens={boolean?}                // false = never store tokens in the browser
  autoRefresh={boolean | { customActivityTracking?: boolean }}
  refreshCookieName={string?}
  storeLastAuthenticatedUser={boolean?}
  oidcConfig={boolean | { applicationId?, clientId?, issuer?, redirectUri?, scope? }}
  // OIDC mode (an app signing in through a Descope federated app):
  // pass oidcConfig={{ redirectUri }} WITHOUT applicationId. applicationId makes the SDK use the
  // app's discovery document, whose authorization_endpoint 404s (verified react-sdk 3.3.8,
  // 2026-09-22). Name the federated app per request instead: loginWithRedirect({ extraQueryParams: { ssoAppId } }).
/>

<Descope
  flowId={string}
  onSuccess={(e: CustomEvent<FlowJWTResponse>) => void}   // e.detail.user, e.detail.sessionJwt
  onError={(e: CustomEvent<ErrorResponse>) => void}
  onReady={(e: CustomEvent<{}>) => void}
  tenant={string?} theme={"light"|"dark"|"os"} locale={string?} debug={boolean?}
  form={Record<string, any>?} client={Record<string, any>?} styleId={string?} redirectUrl={string?}
  // styleId: a Style created in the console (Styles page). Seed never creates/edits styles or the theme; the kit may apply a project theme under AGENTS.md's ownership rules.
  // theme="os": needed for a dark app; without it the flow renders light. The project style must
  // define a dark flavor for this to look right.
/>

useSession(): { isAuthenticated: boolean; isSessionLoading: boolean; sessionToken: string; claims: Claims }
//   Gate on isAuthenticated, NEVER on sessionToken — it is "" in cookie/HttpOnly/persistTokens=false setups.
//   `claims` is the subset the server returns with auth responses (verified 3.3.3: it OMITS `tenants`).
//   For authorization UI use the token: sdk.getTenants(token), sdk.getJwtRoles(token, tenant?),
//   sdk.getJwtPermissions(token, tenant?), sdk.getCurrentTenant(token) — or decode the payload for display.
sdk.selectTenant(tenantId: string, token?: string): Promise<SdkResponse<JWTResponse>>   // new session JWT with `dct`; provider stores it
useUser(): { user: UserResponse; isUserLoading: boolean }   // user.email, .name, .userId, .loginIds
<UserManagement tenant={tenantId} widgetId="user-management-widget" theme? styleId? />
<AuditManagement tenant={tenantId} widgetId="audit-management-widget" theme? styleId? />
//   Tenant-scoped admin widgets (WidgetProps: tenant, widgetId required). The user-management
//   widget lists only non-test users; the viewer needs admin rights in that tenant.
useDescope(): Sdk
  sdk.logout(token?: string): Promise<SdkResponse<never>>
  sdk.logoutAll(token?: string): Promise<SdkResponse<never>>   // revoke every session of the user (single logout across apps)
  sdk.oidc.loginWithRedirect(args?: CreateSigninRequestArgs, disableNavigation?: boolean): Promise<SdkResponse<URLResponse>>   // OIDC mode only; kit recipe uses { extraQueryParams: { ssoAppId, tenant? } }
  //   Redirects to the project-level /oauth2/v1/<projectId>/authorize; Descope routes by ssoAppId to the
  //   federated app's login page. The provider finishes ?code=&state= itself. The access token is a
  //   normal session JWT (dct, tenants, roles) that node validateSession accepts.
  sdk.me(token?: string): Promise<SdkResponse<UserResponse>>     // re-fetch user after profile changes
  sdk.refresh(token?: string, tryRefresh?: boolean): Promise<SdkResponse<JWTResponse>>
  sdk.otp.signUpOrIn.email(loginId: string, loginOptions?: LoginOptions, token?: string): Promise<SdkResponse<{ maskedEmail: string }>>   // also .sms/.whatsapp/.voice (return maskedPhone)
  sdk.otp.verify.email(loginId: string, code: string): Promise<SdkResponse<JWTResponse>>
  sdk.magicLink.signUpOrIn.email(loginId: string, URI?: string, signUpOptions?: { tenantId?: string; customClaims?: Record<string, any>; templateId?: string; templateOptions?: Record<string, string> }): Promise<SdkResponse<{ maskedEmail: string }>>
  //   URI = where the link lands (the kit: this /login URL without t/code); SdkLogin verifies ?t= there.
  sdk.magicLink.verify(token: string): Promise<SdkResponse<JWTResponse>>   // token = ?t= on the landing URL
  sdk.webauthn.signIn(loginId: string, passkeyOptions?: PasskeyOptions): Promise<SdkResponse<JWTResponse>>   // passkey sign-in (browser prompt)
  sdk.webauthn.update(loginId: string, token?: string, passkeyOptions?: PasskeyOptions): Promise<SdkResponse<ResponseData> | SdkResponse<{ jwt?: JWTResponse }>>   // add a passkey to the signed-in user; the kit passes getRefreshToken()
  sdk.webauthn.helpers.isSupported(requirePlatformAuthenticator?: boolean): Promise<boolean>
  //   sdk.me().data.webauthn (runtime field, not in UserResponse's type) says whether a passkey exists.
  sdk.enchantedLink.signUpOrIn(loginId: string, URI?: string, signUpOptions?: { tenantId?: string; customClaims?: Record<string, any>; templateId?: string; templateOptions?: Record<string, string>; providerId?: string }): Promise<SdkResponse<EnchantedLinkResponse>>
  //   In-place re-auth (ReauthSignIn): URI = the kit's `/login?el=1`. The user clicks the link in ANY tab/browser.
  //   linkId = the number the user must click in the email (ReauthSignIn shows it); the link carries ?t=.
  sdk.enchantedLink.verify(token: string): Promise<SdkResponse<never>>   // in the tab the link opens (EnchantedLinkLanding); the waiting tab gets the session
  sdk.enchantedLink.waitForSession(pendingRef: string, config?: { pollingIntervalMs: number; timeoutMs: number }): Promise<SdkResponse<JWTResponse>>
  //   The waiting tab polls; ok=false on timeout (the kit re-polls in windows, POLL_WINDOW_MS). The provider stores the session.
  //   Contrast magicLink.verify: it returns the JWT to the tab that opened the link.
  sdk.saml.start(tenantIdOrEmail: string, redirectUrl?: string, loginOptions?: LoginOptions, token?: string, ssoId?: string, forceAuthn?: boolean, loginHint?: string, enforceInitiatedEmail?: boolean): Promise<SdkResponse<URLResponse>>   // then location.assign(res.data.url)
  sdk.saml.exchange(code: string): Promise<SdkResponse<JWTResponse>>   // code = ?code= on redirectUrl
  // On a successful verify the provider picks up the session; no manual token handling.
getSessionToken(): string       // for Authorization: Bearer in header mode
getRefreshToken(): string
getJwtRoles(token?: any, tenant?: string): string[]
getJwtPermissions(token?: any, tenant?: string): string[]
getCurrentTenant(token?: any): string
sdk.getTenants(token: string): string[]
sdk.getJwtRoles(token: string, tenant?: string): string[]
sdk.getJwtPermissions(token: string, tenant?: string): string[]
sdk.getCurrentTenant(token: string): string
// EnchantedLinkResponse = { pendingRef: string; linkId: string; maskedEmail: string }
// URLResponse = { url: string }
```

## Valid flow IDs (do not invent others)

The kit's own flows: `demo-sign-up-or-in` (web default; runs the `demo-promote-passkeys` subflow),
`demo-step-up`, `demo-promote-passkeys` (subflow only, never a web flow ID), and the opt-ins
`demo-sign-up-or-in-otp`, `demo-step-up-otp`, `demo-password-sms-mfa`, from `descope/flows/` and imported by `pnpm seed`. Use the project's own `sign-up-or-in`/`step-up` only when the demo
should show the customer's flow. Any other ID must exist in the target project (`pnpm inspect`).
This demo: Parkdean's own `pd-sign-up-or-in` (subflows `pd-email-verify`, `pd-profile`, `pd-mfa`),
already in the project; a copy lives in `descope/customer-flows/` and seed never imports it.

## Flow actions the kit's flows use (from Descope templates; verified with MCP `ValidateFlow`)

- Email OTP: `sign-up-or-in-otp-email` → screen → `verify-code-otp-email`.
- Password: `password-sign-in-v2` (error `PasswordExpired`), `password-update`, `password-replace-v3`;
  conditions on `unauthUser.userId` (exists) and `unauthUser.password` (has one).
- SMS OTP: `sign-in-otp-sms` (code to the current user's phone: MFA after a first factor),
  `update-user-otp-sms` (add/verify a phone from a `phone` input) → screen → `verify-code-otp-sms`.
- SSO: condition on `ssoEnabled` → `saml-start` → `exchange-saml-code`.
- Magic link: `sign-up-or-in-magic-linkv3-email` (rules: `success` → the "sent" screen **and**
  `success` → `<id>.end` `verify-magic-link`); step-up uses `sign-in-magic-linkv3-email`.
- Passkeys: `webauthn-sign-in-start-v2` → `webauthn-sign-in-finish` (sign in / step up),
  `webauthn-update-user-start` → `webauthn-update-user-finish` (add one); context
  `user.webauthn` (has one), `deviceInfo.webAuthnSupport`.
- Subflow: a task `{ "type": "flow", "arguments": { "flowId": { "type": "inline", "value": "<id>" } } }`;
  every rule needs an `interactionId` (`"success"`), or MCP `ValidateFlow` rejects it (E104105). A subflow's
  End continues the parent flow instead of issuing a JWT. The kit puts the promote subflow after a
  `logged-in` End so its Load User sees the new session.
- HTTP connector: hidden action `connector`, inputs `connectorId` (project-specific), `command`
  (`get`/`post`/…), `args` (object; shape undocumented, "temp" in the catalog), `resultPath`,
  `exchangeStepId`; error `ConnectorFailed`. Add it in the console, then `pnpm flows:export`.

## Patterns

- **Header mode** (default): web sends `Authorization: Bearer <getSessionToken()>`; API `requireAuth` reads it.
- **Cookie mode** (`VITE_SESSION_VIA_COOKIE=true`): web SDK writes `DS` cookie; API reads `req.cookies.DS`.
  Same-origin via the Vite proxy in dev, so the cookie flows without CORS.
- **Refresh** is the web SDK's job (`autoRefresh` default). The API only validates session JWTs.
- **Never decode JWTs by hand** on the server; `validateSession` verifies signature and expiry.
