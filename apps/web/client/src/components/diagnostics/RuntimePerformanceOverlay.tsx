import { Activity, Gauge, Timer, X } from "lucide-react";

import { useRuntimePerformanceDiagnostics } from "@/hooks/useRuntimePerformanceDiagnostics";
import { useScopedTranslation } from "@/i18n/useScopedTranslation";
import {
  formatPerformanceOperationLabel,
  formatRuntimeMetricMs,
} from "@/lib/runtimePerformanceLabels";
import { useRuntimePerformanceOverlayPreference } from "@/lib/runtimePerformanceOverlayPreference";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

function isTauriDesktopRuntime(): boolean {
  return typeof window !== "undefined" && (window as any).__TAURI__ != null;
}

function formatFps(value: number | null | undefined, fallback: string): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return value.toFixed(1);
}

function getFpsToneClass(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "text-slate-300";
  }
  if (value >= 50) {
    return "text-emerald-300";
  }
  if (value >= 30) {
    return "text-amber-300";
  }
  return "text-rose-300";
}

export function RuntimePerformanceOverlay() {
  const { t } = useScopedTranslation("common");
  const [enabled, setEnabled] = useRuntimePerformanceOverlayPreference();
  const active = enabled && isTauriDesktopRuntime();
  const diagnostics = useRuntimePerformanceDiagnostics(active);
  const latestOperation = diagnostics.localRuntime.operations[0] ?? null;
  const fallback = t("notAvailable", "N/A");

  if (!active) {
    return null;
  }

  return (
    <aside
      aria-label={t("runtimePerformanceOverlay.ariaLabel")}
      className="fixed bottom-4 left-4 z-[70] w-[min(21rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-800/20 bg-slate-950/95 text-white shadow-2xl shadow-slate-950/30 backdrop-blur"
    >
      <div className="flex items-start justify-between gap-3 border-b border-white/10 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-cyan-400/15 text-cyan-200">
            <Activity className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-100">
              {t("runtimePerformanceOverlay.title")}
            </div>
            <div className="truncate text-[11px] text-slate-400">
              {t("runtimePerformanceOverlay.subtitle")}
            </div>
          </div>
        </div>
        <Button
          aria-label={t("runtimePerformanceOverlay.close")}
          className="h-7 w-7 shrink-0 p-0 text-slate-300 hover:bg-white/10 hover:text-white"
          onClick={() => setEnabled(false)}
          size="sm"
          type="button"
          variant="ghost"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid gap-2 p-3">
        <div className="rounded-xl border border-white/10 bg-white/[0.06] p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-200">
              <Gauge className="h-4 w-4 text-cyan-200" />
              {t("runtimePerformanceOverlay.renderer")}
            </div>
            <Badge
              className="border-cyan-300/30 bg-cyan-300/10 text-cyan-100"
              variant="outline"
            >
              {diagnostics.renderer.sampleCount.toLocaleString()}{" "}
              {t("runtimePerformanceOverlay.samples")}
            </Badge>
          </div>
          <div className="grid grid-cols-3 gap-2 text-[11px] text-slate-400">
            <div>
              <div>{t("runtimePerformanceOverlay.avgFps")}</div>
              <div
                className={`text-base font-semibold ${getFpsToneClass(
                  diagnostics.renderer.averageFps
                )}`}
              >
                {formatFps(diagnostics.renderer.averageFps, fallback)}
              </div>
            </div>
            <div>
              <div>{t("runtimePerformanceOverlay.avgFrame")}</div>
              <div className="text-base font-semibold text-slate-100">
                {formatRuntimeMetricMs(
                  diagnostics.renderer.averageFrameTimeMs,
                  fallback
                )}
              </div>
            </div>
            <div>
              <div>{t("runtimePerformanceOverlay.slowFrames")}</div>
              <div className="text-base font-semibold text-slate-100">
                {diagnostics.renderer.slowFrameCount.toLocaleString()}
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/[0.06] p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-200">
              <Timer className="h-4 w-4 text-amber-200" />
              {t("runtimePerformanceOverlay.localRuntime")}
            </div>
            {latestOperation ? (
              <Badge
                className="border-amber-300/30 bg-amber-300/10 text-amber-100"
                variant="outline"
              >
                {latestOperation.count.toLocaleString()}{" "}
                {t("runtimePerformanceOverlay.samples")}
              </Badge>
            ) : null}
          </div>
          {latestOperation ? (
            <div>
              <div className="truncate text-xs font-medium text-slate-100">
                {formatPerformanceOperationLabel(latestOperation.operation)}
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] text-slate-400">
                <div>
                  <div>{t("runtimePerformanceOverlay.avgLatency")}</div>
                  <div className="text-base font-semibold text-slate-100">
                    {formatRuntimeMetricMs(
                      latestOperation.averageDurationMs,
                      fallback
                    )}
                  </div>
                </div>
                <div>
                  <div>{t("runtimePerformanceOverlay.p95Latency")}</div>
                  <div className="text-base font-semibold text-slate-100">
                    {formatRuntimeMetricMs(
                      latestOperation.p95DurationMs,
                      fallback
                    )}
                  </div>
                </div>
                <div>
                  <div>{t("runtimePerformanceOverlay.errors")}</div>
                  <div className="text-base font-semibold text-slate-100">
                    {latestOperation.errorCount.toLocaleString()}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-[11px] text-slate-400">
              {t("runtimePerformanceOverlay.noRuntimeSamples")}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
