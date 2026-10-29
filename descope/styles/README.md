# Parkdean's flow style

`parkdean.json` is the source for the `parkdean` style in your project (console → Styles). The app
selects it through `brand.descopeStyleId` in `packages/brand/brand.ts`, and `VITE_DESCOPE_STYLE_ID`
overrides that. The project's default style is separate and unchanged.

How it's built (Code Mode format, see docs.descope.com/management/styles/code-mode/globals-reference):
- `globals`: colour palettes (`primary` navy, `secondary` teal, `surface` greys with navy text),
  Nunito Sans as both font slots, the type scale, and the radius scale (`3xl` = pill). Every pd-*
  screen uses an `h2` heading, `subtitle2` body text and `primary` mode, so most of the look comes
  from these tokens.
- `components`: CSS variables per component (camelCase key, e.g. `inputWrapper`), with `mode` and
  `variant` blocks. The container is the card (radius, border, soft navy-tinted shadow). Buttons are
  pills: outline buttons get a light border that turns navy on hover, and link buttons are teal.
  Inputs have 12px corners and a teal focus outline.

`parkdean-widget.json` is the same style with flat containers, for embedded widgets
(`brand.descopeWidgetStyleId`). A widget nests containers, so the flow's card container turned every
section of the User Profile widget into its own shadowed card. Per-section padding and the Logout
row come from the widget's own layout (console → Widgets), not from the style.

Applying either: `pnpm style:import descope/styles/<file>.json` (`--plan` to dry-run; it refuses
to overwrite an existing style without `--overwrite`). Under the hood: `POST /v2/mgmt/theme/import` with
`{ theme: { componentsVersion, styles: { "parkdean-light": { globals, components } } } }`. The
import creates or overwrites only the styles it carries. `componentsVersion` must match the
project's version (`3.26.0` today).

Things learned:
- Per-variant text colour doesn't work: the built-in `:host([mode=primary])` text colour comes
  later in the compiled CSS and wins, so subtitles stay navy.
- Use the `css?family=…:400,600,700,800` Google Fonts URL. A `css2` URL contains `;`, which can cut
  the compiled CSS value short.
