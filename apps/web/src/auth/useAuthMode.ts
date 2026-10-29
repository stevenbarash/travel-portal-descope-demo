import { useCallback, useState } from "react";
import { useAuthConfig } from "./AuthProvider";
import {
  type AuthMode,
  readAuthModeOverride,
  resolveAuthMode,
  writeAuthModeOverride,
} from "./config";

/** Current auth mode (flow | sdk) with a setter that persists a mid-demo override. */
export function useAuthMode(): [AuthMode, (mode: AuthMode) => void] {
  const { defaultMode } = useAuthConfig();
  const [mode, setModeState] = useState<AuthMode>(() =>
    resolveAuthMode(defaultMode, readAuthModeOverride()),
  );
  const setMode = useCallback(
    (next: AuthMode) => {
      writeAuthModeOverride(next === defaultMode ? null : next);
      setModeState(next);
    },
    [defaultMode],
  );
  return [mode, setMode];
}
