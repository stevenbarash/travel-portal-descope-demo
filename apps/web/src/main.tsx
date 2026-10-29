import { brand } from "@kit/brand";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router";
import { router } from "./app/router";
import { SetupScreen } from "./app/SetupScreen";
import { AppAuthProvider } from "./auth/AuthProvider";
import { authConfigFromEnv } from "./auth/config";
import { loadGoogleFont } from "./brand/font";
import { envResult } from "./env";
import "./index.css";

// Brand chrome is applied before the first render so the tab never shows template defaults.
document.title = brand.name;
// index.html ships /favicon.svg; the brand may use another file or type.
const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
if (icon && icon.getAttribute("href") !== brand.favicon) {
  icon.href = brand.favicon;
  icon.removeAttribute("type"); // let the browser sniff png/ico/svg
}
if (brand.fontImport) loadGoogleFont(brand.font);

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("#root not found");

// The Descope provider can't start without a project ID, so a bad .env renders a setup
// checklist instead of a blank page or a console-only SDK error.
createRoot(rootEl).render(
  <StrictMode>
    {envResult.ok ? (
      <AppAuthProvider config={authConfigFromEnv(envResult.env)}>
        <RouterProvider router={router} />
      </AppAuthProvider>
    ) : (
      <SetupScreen issues={envResult.issues} />
    )}
  </StrictMode>,
);
