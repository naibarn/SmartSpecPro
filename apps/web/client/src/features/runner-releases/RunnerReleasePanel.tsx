import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  Loader2,
  RefreshCw,
  Rocket,
  ShieldCheck,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useScopedTranslation } from "@/i18n/useScopedTranslation";
import {
  DashboardSectionHeader,
  dashboardCardDescriptionClass,
  dashboardCardTitleClass,
} from "@/components/dashboard/dashboardPrimitives";
import {
  detectRunnerTarget,
  useRunnerReleaseCatalog,
  type RunnerUpdateCommand,
} from "./useRunnerReleaseCatalog";
import type { RunnerReleaseAsset, RunnerReleaseTarget } from "@shared/runnerReleases";

function formatBytes(value: number): string {
  if (value >= 1_048_576) return `${(value / 1_048_576).toFixed(1)} MB`;
  if (value >= 1024) return `${Math.round(value / 1024)} KB`;
  return `${value} B`;
}

function formatTarget(target: RunnerReleaseTarget, t: (key: string) => string): string {
  if (target.profile === "shared_container") return t("dashboard:runnerReleases.target.container");
  if (target.platform === "macos" && target.architecture === "arm64") return t("dashboard:runnerReleases.target.macosArm64");
  if (target.platform === "macos" && target.architecture === "x64") return t("dashboard:runnerReleases.target.macosIntel");
  return `${target.platform} · ${target.architecture}`;
}

function latestVersion(target: RunnerReleaseTarget): string {
  return target.version || target.package?.version || target.updateBinary?.version || "—";
}

function isNewerVersion(latest: string, current: string | null): boolean {
  if (!current || latest === "—") return false;
  const parse = (value: string) => value.replace(/^v/i, "").split(/[.+-]/).map(Number);
  const a = parse(latest);
  const b = parse(current);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const left = Number.isFinite(a[index]) ? a[index] : 0;
    const right = Number.isFinite(b[index]) ? b[index] : 0;
    if (left !== right) return left > right;
  }
  return false;
}

function targetMatches(target: RunnerReleaseTarget, platform: string, architecture: string): boolean {
  return target.profile === "local_device" && target.platform === platform && target.architecture === architecture;
}

function runnerPlatformMatches(
  runner: { platform: { os?: string; architecture?: string } | null },
  preferred: { platform: RunnerReleaseTarget["platform"]; architecture: RunnerReleaseTarget["architecture"] },
): boolean {
  if (!runner.platform?.os || !runner.platform.architecture) return true;
  const platform = runner.platform.os.toLowerCase() === "darwin" ? "macos" : runner.platform.os.toLowerCase();
  const architecture = ["x86_64", "amd64"].includes(runner.platform.architecture.toLowerCase())
    ? "x64"
    : runner.platform.architecture.toLowerCase();
  return platform === preferred.platform && architecture === preferred.architecture;
}

function runnerStatusLabel(status: string, trustState: string, t: (key: string) => string): string {
  if (trustState === "revoked" || status === "revoked") return t("dashboard:runnerReleases.status.revoked");
  if (trustState !== "trusted") return t("dashboard:runnerReleases.status.permissionRequired");
  switch (status) {
    case "online": return t("dashboard:runnerReleases.status.online");
    case "offline": return t("dashboard:runnerReleases.status.offline");
    case "degraded": return t("dashboard:runnerReleases.status.degraded");
    case "busy": return t("dashboard:runnerReleases.status.busy");
    default: return status;
  }
}

function updatePhaseLabel(phase: string, t: (key: string) => string): string {
  const normalized = phase.toLowerCase().replace(/-/g, "_");
  const knownPhases = new Set([
    "queued",
    "downloading",
    "verifying",
    "draining",
    "replacing",
    "restarting",
    "completed",
    "failed",
    "rolled_back",
  ]);
  return knownPhases.has(normalized)
    ? t(`dashboard:runnerReleases.phase.${normalized}`)
    : phase;
}

export function RunnerReleasePanel({ enabled = true }: { enabled?: boolean }) {
  const { t } = useScopedTranslation(["dashboard"]);
  const { catalog, runners, isLoading, error, checkedAt, refresh, requestUpdate } = useRunnerReleaseCatalog(enabled);
  const preferred = useMemo(() => detectRunnerTarget(), []);
  const [activeUpdate, setActiveUpdate] = useState<RunnerUpdateCommand | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [isRequestingUpdate, setIsRequestingUpdate] = useState(false);

  const localRunner = useMemo(() => runners.find(runner => runner.profile === "local_device") ?? null, [runners]);
  const preferredTarget = catalog?.latestByTarget.find(target => targetMatches(target, preferred.platform, preferred.architecture)) ?? null;
  const preferredLatest = preferredTarget ? latestVersion(preferredTarget) : null;
  const currentVersion = localRunner?.runnerVersion ?? null;
  const updateAvailable = Boolean(preferredLatest && isNewerVersion(preferredLatest, currentVersion));
  const updateBlockReason = !localRunner
    ? "notConnected"
    : localRunner.trustState === "revoked" || localRunner.status === "revoked"
      ? "revoked"
      : localRunner.trustState !== "trusted"
        ? "permissionRequired"
        : localRunner.status === "busy"
          ? "busy"
          : ["offline", "degraded"].includes(localRunner.status)
            ? "offline"
            : !runnerPlatformMatches(localRunner, preferred)
              ? "incompatible"
              : null;
  const canStartUpdate = Boolean(updateAvailable && preferredTarget?.updateBinary && !updateBlockReason);

  useEffect(() => {
    if (!activeUpdate || !localRunner) return;
    if (["completed", "failed", "rolled_back"].includes(activeUpdate.status)) return;
    const controller = new AbortController();
    const timer = window.setInterval(() => {
      void fetch(`/api/runners/${encodeURIComponent(localRunner.runnerId)}/update/${encodeURIComponent(activeUpdate.commandId)}`, {
        credentials: "include",
        cache: "no-store",
        signal: controller.signal,
      })
        .then(response => response.json())
        .then(payload => {
          if (!controller.signal.aborted && payload?.commandId) setActiveUpdate(payload as RunnerUpdateCommand);
        })
        .catch(() => undefined);
    }, 2_000);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [activeUpdate, localRunner]);

  async function startUpdate() {
    if (!canStartUpdate || !localRunner || !preferredTarget?.updateBinary) return;
    setIsRequestingUpdate(true);
    setUpdateError(null);
    try {
      setActiveUpdate(await requestUpdate(localRunner.runnerId, preferredTarget.updateBinary.id));
    } catch (requestError) {
      setUpdateError(requestError instanceof Error ? requestError.message : "runner_update_request_failed");
    } finally {
      setIsRequestingUpdate(false);
    }
  }

  const targets = catalog?.latestByTarget.filter(target => target.profile === "local_device") ?? [];

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" aria-label={t("dashboard:runnerReleases.ariaLabel")}>
      <DashboardSectionHeader
        eyebrow={t("dashboard:runnerReleases.eyebrow")}
        title={t("dashboard:runnerReleases.title")}
        description={t("dashboard:runnerReleases.description")}
        trailing={(
          <Button type="button" variant="outline" size="sm" onClick={refresh} disabled={isLoading} aria-label={t("dashboard:runnerReleases.checkVersion")}>
            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            {t("dashboard:runnerReleases.checkVersion")}
          </Button>
        )}
      />

      <p className="sr-only" aria-live="polite">
        {isLoading ? t("dashboard:runnerReleases.checking") : error ? `${t("dashboard:runnerReleases.checkFailed")}: ${error}` : `${t("dashboard:runnerReleases.checked")}${checkedAt ? ` ${new Date(checkedAt).toLocaleString()}` : ""}`}
      </p>

      {error && (
        <p className="mt-4 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800" role="alert">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {t("dashboard:runnerReleases.checkUnavailable")}
        </p>
      )}

      <article className="mt-5 rounded-xl border border-sky-100 bg-sky-50/60 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className={dashboardCardTitleClass}>{t("dashboard:runnerReleases.thisDevice")}</p>
            <p className={dashboardCardDescriptionClass}>{preferred.platform} · {preferred.architecture}</p>
          </div>
          <Badge variant="outline" className="w-fit border-sky-200 bg-white text-sky-700">
            {localRunner ? `${localRunner.displayName} · ${currentVersion ?? t("dashboard:runnerReleases.versionUnknown")}` : t("dashboard:runnerReleases.notConnected")}
          </Badge>
        </div>
        <div className="mt-3 grid gap-1 text-xs text-slate-600 sm:grid-cols-3">
          <span>{t("dashboard:runnerReleases.currentVersion", { version: currentVersion ?? t("dashboard:runnerReleases.versionUnknown") })}</span>
          <span>{t("dashboard:runnerReleases.latestVersion", { version: preferredLatest ?? t("dashboard:runnerReleases.versionUnknown") })}</span>
          <span>{checkedAt ? t("dashboard:runnerReleases.lastChecked", { time: new Date(checkedAt).toLocaleString() }) : t("dashboard:runnerReleases.notChecked")}</span>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {preferredTarget?.package ? (
            <Button asChild size="sm">
              <a href={preferredTarget.package.downloadUrl} download>
                <Download className="mr-2 h-4 w-4" />
                {t("dashboard:runnerReleases.downloadVersion", { version: preferredLatest ?? "" })}
              </a>
            </Button>
          ) : (
            <Badge variant="outline">{t("dashboard:runnerReleases.noNativeBuild")}</Badge>
          )}
          {updateAvailable && preferredTarget?.updateBinary && (
            <Button type="button" size="sm" variant="secondary" onClick={() => void startUpdate()} disabled={!canStartUpdate || isRequestingUpdate || Boolean(activeUpdate && !["completed", "failed", "rolled_back"].includes(activeUpdate.status))}>
              {isRequestingUpdate ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Rocket className="mr-2 h-4 w-4" />}
              {t("dashboard:runnerReleases.updateVersion", { version: preferredLatest ?? "" })}
            </Button>
          )}
          {currentVersion && !updateAvailable && preferredLatest && (
            <span className="inline-flex items-center gap-1 text-sm text-emerald-700">
              <CheckCircle2 className="h-4 w-4" /> {t("dashboard:runnerReleases.upToDate")}
            </span>
          )}
        </div>
        {activeUpdate && (
          <p className="mt-3 text-sm text-slate-600" aria-live="polite">
            {t("dashboard:runnerReleases.updateStatus")}: <span className="font-medium text-slate-900">{updatePhaseLabel(activeUpdate.phase, t)}</span>
            {activeUpdate.status === "completed" && ` · ${t("dashboard:runnerReleases.updateConfirmed")}`}
            {activeUpdate.status === "rolled_back" && ` · ${t("dashboard:runnerReleases.updateRolledBack")}`}
          </p>
        )}
        {updateAvailable && preferredTarget?.updateBinary && updateBlockReason && updateBlockReason !== "notConnected" && (
          <p className="mt-3 text-sm text-amber-700" role="status">
            {t(`dashboard:runnerReleases.updateDisabled.${updateBlockReason}`)}
          </p>
        )}
        {updateError && <p className="mt-3 text-sm text-rose-700" role="alert">{updateError}</p>}
        {!localRunner && <p className="mt-3 text-sm text-slate-600">{t("dashboard:runnerReleases.connectFirst")}</p>}
      </article>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label={t("dashboard:runnerReleases.availablePlatforms")}>
        {targets.map(target => {
          const asset: RunnerReleaseAsset | null = target.package;
          return (
            <article key={target.targetKey} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-sm font-medium text-slate-900">{formatTarget(target, t)}</p>
            <p className="mt-1 text-xs text-slate-500">{asset ? `${asset.version} · ${formatBytes(asset.fileSizeBytes)}` : t("dashboard:runnerReleases.notPublished")}</p>
              {asset && <a className="mt-3 inline-flex items-center text-xs font-medium text-sky-700 hover:underline" href={asset.downloadUrl} download><Download className="mr-1 h-3.5 w-3.5" /> {t("dashboard:runnerReleases.download")}</a>}
            </article>
          );
        })}
      </div>
      <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <p className={dashboardCardTitleClass}>{t("dashboard:runnerReleases.connectedRunners")}</p>
        {runners.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">{t("dashboard:runnerReleases.noConnectedRunners")}</p>
        ) : (
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {runners.map(runner => (
              <article key={runner.runnerId} className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{runner.displayName}</p>
                    <p className="text-xs text-slate-500">{runner.profile} · {runner.runnerVersion ?? t("dashboard:runnerReleases.versionUnknown")}</p>
                  </div>
                  <Badge variant="outline">{runnerStatusLabel(runner.status, runner.trustState, t)}</Badge>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  {t("dashboard:runnerReleases.toolReadiness", { ready: runner.readyToolCount, total: runner.toolCount })} · {t("dashboard:runnerReleases.capabilityReadiness", { ready: runner.readyCapabilityCount, total: runner.capabilityCount })}
                </p>
                <p className="mt-1 text-xs text-slate-400">{runner.lastSeenAt ? new Date(runner.lastSeenAt).toLocaleString() : t("dashboard:runnerReleases.neverSeen")}</p>
              </article>
            ))}
          </div>
        )}
      </div>
      <p className="mt-4 flex items-center gap-2 text-xs text-slate-500"><ShieldCheck className="h-3.5 w-3.5" /> {t("dashboard:runnerReleases.verificationNote")}</p>
    </section>
  );
}
