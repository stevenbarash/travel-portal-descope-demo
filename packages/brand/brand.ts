/**
 * THE brand file. Every color, the font, the logo and the product name live here and nowhere
 * else. `npm run brand:apply` turns it into apps/web/src/brand/tokens.css; `npm run brand:guard` fails
 * the check if a hex color or Tailwind palette class appears anywhere else in the web app.
 *
 * Ships deliberately neutral (greys) so any hardcoded leftover is obvious on the first screen.
 * Reskin for a customer: change values here, run `npm run brand:apply`, done.
 */
export interface BrandPalette {
  background: string;
  foreground: string;
  /** Secondary text, hints. */
  muted: string;
  border: string;
  /** Primary action color and the text on it. */
  primary: string;
  primaryForeground: string;
  /** Highlights, links, active states. */
  accent: string;
  danger: string;
  /** Card / panel surface. */
  surface: string;
  /**
   * Plate behind the logo. "transparent" unless the logo only reads on light backgrounds (dark
   * text in a wordmark): then give the dark palette a light plate, e.g. "#ffffff".
   */
  logoPlate: string;
}

export interface Brand {
  /** Product name shown in the header, title bar and generated copy. */
  name: string;
  /** Short tagline for the landing page. */
  tagline: string;
  /** Path under apps/web/public: any image type (svg, png, webp). Wide wordmarks are fine. */
  logo: string;
  /** Path under apps/web/public; its extension sets the icon type. */
  favicon: string;
  /** Google Fonts family name, or a system stack when `fontImport` is false. */
  font: string;
  fontImport: boolean;
  colors: { light: BrandPalette; dark: BrandPalette };
  /** Optional Descope style ID (console → Styles) to apply to hosted flows. Never written by the kit. */
  descopeStyleId?: string;
  /**
   * Optional style for embedded widgets (User Profile). Flow styles draw the flow as a card; a
   * widget nests containers, so the same style turns every section into a card of its own.
   * Defaults to `descopeStyleId`.
   */
  descopeWidgetStyleId?: string;
  /**
   * How embedded Descope flows pick light/dark. "os" follows the app; it needs both flavors in the
   * project theme. `applyProjectTheme` stores one flavor per call (a dark call wiped light, verified
   * 2026-09-30), so after the kit applies a light theme set "light".
   */
  descopeTheme: "os" | "light";
}

export const brand: Brand = {
  name: "TravelCorp",
  tagline:
    "Hotels and apartments in destinations worldwide. Book your next trip.",
  logo: "/brand/logo.svg",
  favicon: "/favicon.svg",
  font: "Nunito Sans",
  fontImport: true,
  colors: {
    light: {
      background: "#ffffff",
      foreground: "#0b2a4a",
      muted: "#5a6b7d",
      border: "#dbe3ea",
      // Navy: white text on it passes contrast; teal is the accent.
      primary: "#0b2a4a",
      primaryForeground: "#ffffff",
      // Teal darkened from #00a7b5 so accent text stays readable on white.
      accent: "#00788a",
      danger: "#b42318",
      surface: "#f3f8fa",
      logoPlate: "transparent",
    },
    dark: {
      background: "#07182b",
      foreground: "#eef4f8",
      muted: "#9fb2c4",
      border: "#1d3550",
      primary: "#00a7b5",
      primaryForeground: "#07182b",
      accent: "#4fd1dc",
      danger: "#f97066",
      surface: "#0d2238",
      logoPlate: "transparent",
    },
  },
  // The demo's flow style (descope/styles/travel-portal.json), imported into the project as a named style;
  // the project's default style is untouched.
  descopeStyleId: "travel-portal",
  // The same look with flat containers (descope/styles/travel-portal-widget.json), so My account's
  // widget sits in one card instead of a stack of shadowed ones.
  descopeWidgetStyleId: "travel-portal-widget",
  // Both the default and the travel-portal style are light-only, so embedded flows render light even
  // when the app is dark.
  descopeTheme: "light",
};
