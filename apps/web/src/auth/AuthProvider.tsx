import { AuthProvider as DescopeAuthProvider } from "@descope/react-sdk";
import { createContext, type ReactNode, useContext } from "react";
import type { AuthConfig } from "./config";
import { DevBridge } from "./DevBridge";

const AuthConfigContext = createContext<AuthConfig | null>(null);

/** Wraps the Descope provider with env-driven config and exposes that config to hooks. */
export function AppAuthProvider({
  config,
  children,
}: {
  config: AuthConfig;
  children: ReactNode;
}) {
  return (
    <AuthConfigContext.Provider value={config}>
      <DescopeAuthProvider
        projectId={config.projectId}
        baseUrl={config.baseUrl}
        // Cookie mode: the web SDK writes the session JWT to the DS cookie, which the API reads.
        // `secure` must be false on http://localhost or Safari drops the cookie.
        sessionTokenViaCookie={
          config.sessionViaCookie
            ? { sameSite: "Lax", secure: window.location.protocol === "https:" }
            : false
        }
      >
        <DevBridge />
        {children}
      </DescopeAuthProvider>
    </AuthConfigContext.Provider>
  );
}

/** The AuthConfig passed to AppAuthProvider. Throws outside it, so a missing provider fails loudly. */
export function useAuthConfig(): AuthConfig {
  const cfg = useContext(AuthConfigContext);
  if (!cfg)
    throw new Error("useAuthConfig must be used inside AppAuthProvider");
  return cfg;
}
