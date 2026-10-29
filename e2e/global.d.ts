declare global {
  interface Window {
    /** Dev-only SDK handle set by apps/web DevBridge; typed here with just what specs call. */
    __kit?: {
      sdk: {
        magicLink: { verify: (token: string) => Promise<{ ok: boolean }> };
        enchantedLink: {
          waitForSession: (
            pendingRef: string,
            config?: { pollingIntervalMs: number; timeoutMs: number },
          ) => Promise<{ ok: boolean }>;
        };
      };
    };
  }
}

export {};
