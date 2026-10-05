import { useEffect, useState } from "react";
import { Link } from "@astryxdesign/core/Link";
import { ArrowRight, MapPinned, ShieldAlert, Siren } from "lucide-react";
import { getSpec260ApiPath, getSpec260PagePath } from "@smartspec/shared/src/emergencyRouteManifest";
import { useScopedTranslation } from "@/i18n/useScopedTranslation";

type PublicAlert = {
  publicRef: string;
  title: string;
  message: string;
  severity: string;
};

export default function EmergencyPublicEntry({ variant = "home" }: { variant?: "home" | "overview" | "dashboard" }) {
  const { t } = useScopedTranslation("emergency");
  const [alerts, setAlerts] = useState<PublicAlert[]>([]);
  const [refreshUnavailable, setRefreshUnavailable] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const response = await fetch(getSpec260ApiPath("public.alerts.list"), {
          credentials: "omit", cache: "no-store", signal: controller.signal,
        });
        if (!response.ok) throw new Error("public_emergency_alerts_unavailable");
        const payload = await response.json() as { items?: unknown };
        const items = Array.isArray(payload.items) ? payload.items : [];
        const nextAlerts = items.filter((item): item is PublicAlert => Boolean(item) && typeof item === "object" &&
          typeof (item as Record<string, unknown>).publicRef === "string" &&
          typeof (item as Record<string, unknown>).title === "string" &&
          typeof (item as Record<string, unknown>).message === "string" &&
          typeof (item as Record<string, unknown>).severity === "string")
          .sort((left, right) => {
            const priority: Record<string, number> = { critical: 0, high: 1, moderate: 2, low: 3, unknown: 4 };
            return (priority[left.severity] ?? 5) - (priority[right.severity] ?? 5);
          })
          .slice(0, variant === "overview" ? 5 : 2);
        setAlerts(previous => JSON.stringify(previous) === JSON.stringify(nextAlerts) ? previous : nextAlerts);
        setRefreshUnavailable(false);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setRefreshUnavailable(true);
      }
    };
    void load();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 30_000);
    return () => { controller.abort(); window.clearInterval(interval); };
  }, [variant]);

  const emergencyPath = getSpec260PagePath("public.overview");
  const alertsPath = getSpec260PagePath("public.alerts");
  const reportPath = getSpec260PagePath("public.report");
  const mapPath = getSpec260PagePath("public.map");
  const facilitiesPath = getSpec260PagePath("public.facilities");
  const nearbyPath = getSpec260PagePath("public.nearby");
  const supportPath = getSpec260PagePath("public.support");
  const claimsPath = getSpec260PagePath("public.claims");
  const hasAlerts = alerts.length > 0;

  return (
    <section
      aria-labelledby="emergency-public-entry-title"
      data-testid={`emergency-public-entry-${variant}`}
      className={variant === "home"
        ? "relative z-10 mx-auto w-full max-w-7xl px-4 pt-24 sm:px-6 lg:px-8"
        : "w-full"}
    >
      <article className={`overflow-hidden rounded-2xl border shadow-sm ${hasAlerts
        ? "border-red-300 bg-red-50 text-red-950 shadow-red-900/10"
        : "border-sky-200 bg-sky-50 text-slate-950 shadow-sky-900/5"}`}>
        <header className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-5">
          <section className="flex min-w-0 items-start gap-3">
            <span className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${hasAlerts ? "bg-red-600 text-white" : "bg-sky-700 text-white"}`}>
              {hasAlerts ? <Siren className="h-5 w-5" aria-hidden="true" /> : <ShieldAlert className="h-5 w-5" aria-hidden="true" />}
            </span>
            <section className="min-w-0">
              <h2 id="emergency-public-entry-title" className="text-base font-bold sm:text-lg">
                {hasAlerts ? t("publicEntry.activeTitle") : t("publicEntry.title")}
              </h2>
              <p className="mt-1 text-sm leading-6 text-slate-700">
                {hasAlerts ? t("publicEntry.activeDescription") : t("publicEntry.description")}
              </p>
            </section>
          </section>
          <nav aria-label={t("publicEntry.actions")} className="flex shrink-0 flex-wrap gap-2">
            <Link href={reportPath} color="inherit" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-red-700 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-red-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-700 focus-visible:ring-offset-2">
              {t("publicEntry.report")} <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link href={alertsPath} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-current/20 bg-white/80 px-4 py-2 text-sm font-semibold transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-700 focus-visible:ring-offset-2">
              {t("publicEntry.alerts")}
            </Link>
            <Link href={mapPath} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-current/20 bg-white/80 px-4 py-2 text-sm font-semibold transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-700 focus-visible:ring-offset-2">
              <MapPinned className="h-4 w-4" aria-hidden="true" /> {t("publicEntry.map")}
            </Link>
            {variant === "overview" && <>
              <Link href={facilitiesPath} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-current/20 bg-white/80 px-4 py-2 text-sm font-semibold transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-700 focus-visible:ring-offset-2">
                {t("publicEntry.facilities")}
              </Link>
              <Link href={nearbyPath} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-current/20 bg-white/80 px-4 py-2 text-sm font-semibold transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-700 focus-visible:ring-offset-2">
                {t("publicEntry.nearby")}
              </Link>
              <Link href={supportPath} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-current/20 bg-white/80 px-4 py-2 text-sm font-semibold transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-700 focus-visible:ring-offset-2">
                {t("publicEntry.support")}
              </Link>
              <Link href={claimsPath} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-current/20 bg-white/80 px-4 py-2 text-sm font-semibold transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-700 focus-visible:ring-offset-2">
                {t("publicEntry.claims")}
              </Link>
            </>}
          </nav>
        </header>
        {hasAlerts && (
          <ul className="grid gap-px border-t border-red-200 bg-red-200 sm:grid-cols-2">
            {alerts.map(alert => (
              <li key={alert.publicRef} className="min-w-0 bg-white/75 p-4 sm:px-6">
                <Link href={alertsPath} className="group block rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-700">
                  <span className="flex items-center justify-between gap-3">
                    <span className="line-clamp-2 font-semibold text-red-950">{alert.title}</span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-red-700 transition group-hover:translate-x-0.5" aria-hidden="true" />
                  </span>
                  {alert.message && <span className="mt-1 line-clamp-2 block text-sm leading-6 text-slate-700">{alert.message}</span>}
                  <span className="mt-2 block text-xs font-semibold uppercase tracking-wide text-red-800">{t(`severity.${alert.severity}`, { defaultValue: alert.severity })}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {!hasAlerts && !refreshUnavailable && variant === "overview" && (
          <footer className="border-t border-sky-200 px-4 py-3 text-sm text-slate-700 sm:px-6">
            <Link href={emergencyPath} className="font-semibold text-sky-900 underline-offset-4 hover:underline">{t("publicEntry.noActiveAlerts")}</Link>
          </footer>
        )}
        {refreshUnavailable && (
          <p role="status" className="border-t border-current/15 px-4 py-2 text-xs text-slate-700 sm:px-6">
            {t("publicEntry.updateUnavailable")}
          </p>
        )}
      </article>
    </section>
  );
}
