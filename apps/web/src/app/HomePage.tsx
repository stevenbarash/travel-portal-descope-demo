import { useSession } from "@descope/react-sdk";
import { brand } from "@kit/brand";
import {
  type HealthResponse,
  HealthResponse as HealthSchema,
  PARKS,
} from "@kit/contracts";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useT } from "../i18n/messages";

/** Public landing. Everything a customer sees before login comes from the brand file. */
export function HomePage() {
  const { isAuthenticated } = useSession();
  const t = useT();
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/health")
      .then(async (r) => HealthSchema.parse(await r.json()))
      .then(setHealth)
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : String(e)),
      );
  }, []);

  return (
    <div className="space-y-12 py-6">
      <section className="rounded-2xl bg-primary px-6 py-14 text-center text-primary-foreground">
        <h1 className="text-4xl font-bold tracking-tight">{brand.name}</h1>
        <p className="mx-auto mt-3 max-w-xl text-lg opacity-90">
          {t.home.tagline}
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            to="/book"
            className="rounded-full bg-background px-6 py-2.5 font-semibold text-foreground"
          >
            {t.nav.book}
          </Link>
          <Link
            to={isAuthenticated ? "/bookings" : "/login"}
            className="rounded-full border border-primary-foreground px-6 py-2.5 font-semibold"
          >
            {isAuthenticated ? t.nav.bookings : t.nav.signIn}
          </Link>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {t.home.features.map((f) => (
          <div key={f.title} className="rounded-xl border border-border p-5">
            <h3 className="font-semibold">{f.title}</h3>
            <p className="mt-1 text-sm text-muted">{f.body}</p>
          </div>
        ))}
      </section>

      <section>
        <h2 className="mb-4 text-xl font-bold">{t.home.ourParks}</h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {PARKS.map((p) => (
            <li key={p.id}>
              <Link
                to="/book"
                className="block h-full rounded-xl border border-border bg-surface p-4 hover:border-accent"
              >
                <div className="font-semibold">{p.name}</div>
                <div className="text-sm text-muted">{p.region}</div>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <p className="text-center text-xs text-muted">
        {t.home.api}{" "}
        {health
          ? t.home.apiConnected
          : error
            ? t.home.apiUnreachable(error)
            : "…"}
      </p>
    </div>
  );
}
