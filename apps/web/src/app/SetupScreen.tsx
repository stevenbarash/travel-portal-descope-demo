import { useT } from "../i18n/messages";

/** Rendered instead of the app when required VITE_ variables are missing. */
export function SetupScreen({
  issues,
}: {
  issues: { path: string; message: string }[];
}) {
  const t = useT();
  return (
    <main className="mx-auto max-w-xl p-8 font-sans">
      <h1 className="text-2xl font-semibold">{t.setup.title}</h1>
      <p className="mt-2 text-muted">
        {t.setup.copyEnvBefore} <code>.env.example</code>{" "}
        {t.setup.copyEnvMiddle} <code>.env</code> {t.setup.copyEnvAfter}
      </p>
      <ul className="mt-4 list-disc space-y-1 pl-6">
        {issues.map((i) => (
          <li key={i.path}>
            <code>{i.path}</code>: {i.message}
          </li>
        ))}
      </ul>
    </main>
  );
}
