import type { Page } from "@playwright/test";

/**
 * A Chromium virtual authenticator (CDP WebAuthn domain) attached to `page`: a platform passkey
 * that approves every request with user verification, so passkey ceremonies run headless.
 * Credentials live in this authenticator only, i.e. in this page.
 */
export async function addVirtualAuthenticator(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  const { authenticatorId } = await cdp.send(
    "WebAuthn.addVirtualAuthenticator",
    {
      options: {
        protocol: "ctap2",
        transport: "internal",
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
        automaticPresenceSimulation: true,
      },
    },
  );
  return {
    /** Passkeys registered on this authenticator so far. */
    async credentialCount() {
      const { credentials } = await cdp.send("WebAuthn.getCredentials", {
        authenticatorId,
      });
      return credentials.length;
    },
  };
}
