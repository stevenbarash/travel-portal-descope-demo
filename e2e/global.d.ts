declare global {
  interface Window {
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
