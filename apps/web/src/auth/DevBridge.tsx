import { useDescope } from "@descope/react-sdk";
import { useEffect } from "react";

declare global {
  interface Window {
    /** Dev-only: the Descope web SDK, for the debug drawer, e2e tests, and console poking. */
    __kit?: { sdk: ReturnType<typeof useDescope> };
  }
}

/** Exposes the SDK on window in dev builds only. Renders nothing. */
export function DevBridge() {
  const sdk = useDescope();
  useEffect(() => {
    // Vite replaces this with a constant, so production bundles never put the SDK on window.
    if (!import.meta.env.DEV) return;
    window.__kit = { sdk };
    return () => {
      window.__kit = undefined;
    };
  }, [sdk]);
  return null;
}
