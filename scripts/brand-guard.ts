import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

/**
 * Fails when a color is hardcoded outside the brand layer. Agents inline colors constantly; a
 * written rule is not enough, a failing check is. Allowed: semantic utilities that map to
 * brand tokens (bg-background, text-muted, border-border, bg-primary, text-danger, …).
 */
const REPO = resolve(import.meta.dirname, "..");
/** Every app's and shared package's src/, so a second app or a shared UI package is covered too. */
const ROOTS = ["apps", "packages"].flatMap((group) =>
  readdirSync(resolve(REPO, group))
    .map((name) => resolve(REPO, group, name, "src"))
    .filter((dir) => {
      try {
        return statSync(dir).isDirectory();
      } catch {
        return false;
      }
    }),
);
// Generated tokens and brand helpers. packages/brand/brand.ts itself sits outside any src/.
const ALLOW_DIRS = ROOTS.map((root) => resolve(root, "brand"));
const EXT = /\.(tsx?|css)$/;

const PALETTE =
  "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|black|white";
const RULES: { name: string; re: RegExp }[] = [
  {
    name: "hex color",
    re: /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/,
  },
  { name: "css color function", re: /\b(?:rgba?|hsla?|oklch|color)\(/ },
  {
    name: "tailwind palette class",
    re: new RegExp(
      `\\b(?:bg|text|border|ring|from|to|via|fill|stroke|outline|decoration|accent|caret|shadow|divide|placeholder)-(?:${PALETTE})(?:-\\d{2,3})?(?:/\\d{1,3})?\\b`,
    ),
  },
  {
    name: "arbitrary color class",
    re: /\b(?:bg|text|border|ring|from|to|via|fill|stroke|outline)-\[#/,
  },
];

function walk(dir: string, out: string[] = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (EXT.test(name)) out.push(p);
  }
  return out;
}

const offenders: string[] = [];
const files = ROOTS.flatMap((root) => walk(root));
for (const file of files) {
  if (ALLOW_DIRS.some((d) => file.startsWith(d))) continue;
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, i) => {
    if (/brand-guard-ignore/.test(line)) return;
    for (const rule of RULES) {
      const m = line.match(rule.re);
      if (m)
        offenders.push(
          `${relative(process.cwd(), file)}:${i + 1}: ${rule.name} "${m[0]}"`,
        );
    }
  });
}

if (offenders.length) {
  console.error(
    "brand-guard: colors must live in packages/brand/brand.ts. Offenders:",
  );
  for (const o of offenders) console.error(`  ${o}`);
  process.exit(1);
}
console.log(`brand-guard: clean (${files.length} files)`);
