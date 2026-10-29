import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadScriptEnv } from "./lib/descope";

/**
 * Import one named Descope style (Code Mode JSON: { styleId, globals, components }) as its light
 * flavor: `pnpm style:import descope/styles/travel-portal-widget.json [--plan]`.
 *
 * `/v2/mgmt/theme/import` creates or overwrites only the styles it carries; the project's default
 * style and every other named style are untouched. The SDK's `management.theme.import` takes the
 * older `cssTemplate` shape, so this calls the endpoint directly. `componentsVersion` must match
 * the project's, so it is read from an export first. Refuses to overwrite a style that exists
 * unless `--overwrite` is passed.
 */
const env = loadScriptEnv();
const file = process.argv[2];
if (!file)
  throw new Error("usage: pnpm style:import <style.json> [--plan|--overwrite]");
const style = JSON.parse(readFileSync(resolve(env.repoRoot, file), "utf8")) as {
  styleId?: string;
  globals?: unknown;
  components?: unknown;
};
if (!style.styleId || !style.globals || !style.components)
  throw new Error(`${file}: needs styleId, globals and components`);

const base = env.baseUrl ?? "https://api.descope.com";
const headers = {
  authorization: `Bearer ${env.projectId}:${env.managementKey}`,
  "content-type": "application/json",
};
async function call(path: string, body: unknown) {
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok)
    throw new Error(`${path} failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as {
    theme?: { componentsVersion?: string; styles?: Record<string, unknown> };
  };
}

const current = (await call("/v2/mgmt/theme/export", {})).theme;
const componentsVersion = current?.componentsVersion;
if (!componentsVersion)
  throw new Error("theme export returned no componentsVersion");
const key = `${style.styleId}-light`;
const exists = Object.hasOwn(current?.styles ?? {}, key);
console.log(
  `${exists ? "overwrite" : "create"}: style ${style.styleId} (light), components ${componentsVersion}`,
);
if (process.argv.includes("--plan")) process.exit(0);
if (exists && !process.argv.includes("--overwrite"))
  throw new Error(
    `Style ${style.styleId} already exists; pass --overwrite if this checkout owns it`,
  );

await call("/v2/mgmt/theme/import", {
  theme: {
    componentsVersion,
    styles: {
      [key]: { globals: style.globals, components: style.components },
    },
  },
});
console.log(`imported style ${style.styleId}`);
