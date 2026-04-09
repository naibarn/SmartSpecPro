import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";

import {
  Download,
  Loader2,
  RefreshCw,
  Rocket,
  Trash2,
  Upload,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

import { useScopedTranslation } from "@/i18n/useScopedTranslation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  DashboardSectionHeader,
  dashboardCardDescriptionClass,
  dashboardCardTitleClass,
  dashboardCardTitleLgClass,
} from "@/components/dashboard/dashboardPrimitives";
import {
  desktopReleasePlatformValues,
  type DesktopReleaseAsset,
  type DesktopReleaseChannel,
  type DesktopReleaseInstallerFormat,
  type DesktopReleasePlatform,
} from "@shared/desktopReleases";
import {
  desktopReleaseBuildBundleModeValues,
  desktopReleaseBuildRunStatusSchema,
  desktopReleaseBuildPlatformValues,
  desktopReleaseBuildResponseSchema,
  normalizeDesktopReleaseVersion,
  suggestNextDesktopReleaseVersion,
  type DesktopReleaseBuildRunStatus,
  type DesktopReleaseBuildBundleMode,
  type DesktopReleaseBuildPlatform,
  type DesktopReleaseBuildResponse,
} from "@shared/desktopReleaseBuilds";
import { useDesktopReleaseCatalog } from "./useDesktopReleaseCatalog";

type DesktopReleasePanelVariant = "dashboard" | "admin";
type Translator = (key: string, values?: Record<string, string | number>) => string;
type DesktopReleaseBuildProgressPhase = "idle" | "dispatching" | "queued" | "running" | "publishing" | "completed" | "failed";

function formatBytes(value: number): string {
  if (value >= 1_073_741_824) {
    return `${(value / 1_073_741_824).toFixed(1)} GB`;
  }
  if (value >= 1_048_576) {
    return `${(value / 1_048_576).toFixed(1)} MB`;
  }
  if (value >= 1024) {
    return `${Math.round(value / 1024)} KB`;
  }
  return `${value} B`;
}

function detectPreferredDesktopPlatform(): DesktopReleasePlatform | null {
  if (typeof navigator === "undefined") {
    return null;
  }

  const nav = navigator as Navigator & {
    userAgentData?: { platform?: string };
  };
  const source = `${nav.userAgentData?.platform ?? ""} ${nav.platform ?? ""} ${nav.userAgent ?? ""}`.toLowerCase();
  if (source.includes("win")) {
    return "windows";
  }
  if (source.includes("mac")) {
    return "macos";
  }
  if (source.includes("linux")) {
    return "linux";
  }
  return null;
}

function inferInstallerFormatFromFileName(fileName: string): DesktopReleaseInstallerFormat {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".tar.gz") || lower.endsWith(".tgz")) return "tar_gz";
  if (lower.endsWith(".exe")) return "exe";
  if (lower.endsWith(".msi")) return "msi";
  if (lower.endsWith(".dmg")) return "dmg";
  if (lower.endsWith(".pkg")) return "pkg";
  if (lower.endsWith(".deb")) return "deb";
  if (lower.endsWith(".rpm")) return "rpm";
  if (lower.endsWith(".appimage")) return "appimage";
  if (lower.endsWith(".zip")) return "zip";
  return "other";
}

function formatPlatformLabel(t: Translator, platform: DesktopReleasePlatform): string {
  return t(`dashboard:desktopReleases.platform.${platform}`);
}

function formatInstallerLabel(
  t: Translator,
  format: DesktopReleaseInstallerFormat,
): string {
  return t(`dashboard:desktopReleases.format.${format}`);
}

function formatChannelLabel(channel: DesktopReleaseChannel): string {
  return channel === "stable" ? "Stable" : channel === "beta" ? "Beta" : "Nightly";
}

function formatBuildPlatformLabel(t: Translator, platform: DesktopReleaseBuildPlatform): string {
  if (platform === "all") {
    return t("dashboard:desktopReleases.admin.build.platform.all");
  }
  if (platform === "macos") {
    return formatPlatformLabel(t, "macos");
  }
  return formatPlatformLabel(t, "windows");
}

function formatBuildBundleModeLabel(
  t: Translator,
  bundleMode: DesktopReleaseBuildBundleMode,
): string {
  if (bundleMode === "on-demand") {
    return t("dashboard:desktopReleases.admin.build.bundleMode.onDemand");
  }
  if (bundleMode === "e2b") {
    return t("dashboard:desktopReleases.admin.build.bundleMode.e2b");
  }
  if (bundleMode === "e4b") {
    return t("dashboard:desktopReleases.admin.build.bundleMode.e4b");
  }
  return t("dashboard:desktopReleases.admin.build.bundleMode.all");
}

function buildProgressPercent(phase: DesktopReleaseBuildProgressPhase): number {
  switch (phase) {
    case "dispatching":
      return 18;
    case "queued":
      return 35;
    case "running":
      return 72;
    case "publishing":
      return 88;
    case "completed":
      return 100;
    case "failed":
      return 100;
    default:
      return 0;
  }
}

function buildProgressToneClass(phase: DesktopReleaseBuildProgressPhase): string {
  switch (phase) {
    case "completed":
      return "bg-emerald-500";
    case "failed":
      return "bg-rose-500";
    case "running":
    case "queued":
    case "dispatching":
      return "bg-gradient-to-r from-sky-600 via-cyan-600 to-emerald-500";
    case "publishing":
      return "bg-gradient-to-r from-cyan-600 via-sky-600 to-emerald-500";
    default:
      return "bg-slate-300";
  }
}

function buildProgressBadgeClass(phase: DesktopReleaseBuildProgressPhase): string {
  switch (phase) {
    case "completed":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "failed":
      return "border-rose-200 bg-rose-50 text-rose-700";
    case "running":
    case "queued":
    case "dispatching":
      return "border-sky-200 bg-sky-50 text-sky-800";
    case "publishing":
      return "border-cyan-200 bg-cyan-50 text-cyan-800";
    default:
      return "border-slate-200 bg-slate-50 text-slate-500";
  }
}

function getPrimaryRelease(
  catalog: ReturnType<typeof useDesktopReleaseCatalog>["catalog"],
  preferredPlatform: DesktopReleasePlatform | null,
): DesktopReleaseAsset | null {
  if (!catalog) {
    return null;
  }

  if (preferredPlatform) {
    return (
      catalog.latestByPlatform[preferredPlatform]
      ?? catalog.latestByPlatform.windows
      ?? catalog.latestByPlatform.macos
      ?? catalog.latestByPlatform.linux
      ?? null
    );
  }

  return catalog.latestByPlatform.windows
    ?? catalog.latestByPlatform.macos
    ?? catalog.latestByPlatform.linux
    ?? null;
}

function ReleaseBadgeRow(props: {
  release: DesktopReleaseAsset;
  t: Translator;
}) {
  const { release, t } = props;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-700">
        {t("dashboard:desktopReleases.version", { version: release.version })}
      </Badge>
      <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-700">
        {formatPlatformLabel(t, release.platform)}
      </Badge>
      <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-700">
        {formatInstallerLabel(t, release.installerFormat)}
      </Badge>
      <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-700">
        {formatChannelLabel(release.channel)}
      </Badge>
    </div>
  );
}

export function DesktopReleasePanel(props: {
  variant: DesktopReleasePanelVariant;
  enabled?: boolean;
  canTriggerBuild?: boolean;
}) {
  const { variant, enabled = true, canTriggerBuild = false } = props;
  const { t } = useScopedTranslation(["dashboard", "common"]);
  const { catalog, isLoading, error, refresh } = useDesktopReleaseCatalog(enabled);
  const [uploading, setUploading] = useState(false);
  const [actionInFlightId, setActionInFlightId] = useState<number | null>(null);
  const [buildSubmitting, setBuildSubmitting] = useState(false);
  const [buildVersion, setBuildVersion] = useState("");
  const [buildVersionIsCustom, setBuildVersionIsCustom] = useState(false);
  const [buildPlatform, setBuildPlatform] = useState<DesktopReleaseBuildPlatform>("windows");
  const [buildBundleMode, setBuildBundleMode] = useState<DesktopReleaseBuildBundleMode>("on-demand");
  const [buildReleaseNotes, setBuildReleaseNotes] = useState("");
  const [buildResult, setBuildResult] = useState<DesktopReleaseBuildResponse | null>(null);
  const [buildRunStatus, setBuildRunStatus] = useState<DesktopReleaseBuildRunStatus | null>(null);
  const [buildRunStatusLoading, setBuildRunStatusLoading] = useState(false);
  const [buildRunStatusError, setBuildRunStatusError] = useState<string | null>(null);
  const [version, setVersion] = useState("");
  const [platform, setPlatform] = useState<DesktopReleasePlatform>("windows");
  const [channel, setChannel] = useState<DesktopReleaseChannel>("stable");
  const [installerFormat, setInstallerFormat] = useState<DesktopReleaseInstallerFormat>("exe");
  const [releaseNotes, setReleaseNotes] = useState("");
  const [publish, setPublish] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const preferredPlatform = useMemo(() => detectPreferredDesktopPlatform(), []);
  const primaryRelease = useMemo(
    () => getPrimaryRelease(catalog, preferredPlatform),
    [catalog, preferredPlatform],
  );
  const latestReleases = catalog?.releases ?? [];
  const suggestedBuildVersion = useMemo(
    () => suggestNextDesktopReleaseVersion(latestReleases[0]?.version ?? null),
    [latestReleases],
  );
  const isBuildReady = buildVersion.trim().length > 0;
  const buildButtonClassName = isBuildReady
    ? "w-full bg-gradient-to-r from-sky-600 via-cyan-600 to-emerald-500 text-white shadow-lg shadow-sky-500/25 ring-1 ring-sky-300 hover:from-sky-500 hover:via-cyan-500 hover:to-emerald-400"
    : "w-full bg-slate-200 text-slate-500 shadow-none hover:bg-slate-200";
  const buildWorkflowRunId = buildResult?.workflowRunId ?? null;
  const buildPortalSyncStatus = buildRunStatus?.portalSyncStatus ?? "idle";

  const buildProgressPhase = useMemo<DesktopReleaseBuildProgressPhase>(() => {
    if (buildSubmitting) {
      return "dispatching";
    }
    if (!buildResult) {
      return "idle";
    }
    if (!buildWorkflowRunId) {
      return "queued";
    }
    if (!buildRunStatus?.workflowRunStatus || buildRunStatus.workflowRunStatus === "queued") {
      return "queued";
    }
    if (buildRunStatus.workflowRunStatus === "in_progress") {
      return "running";
    }
    if (buildRunStatus.workflowRunStatus === "completed") {
      if (buildRunStatus.workflowRunConclusion !== "success") {
        return "failed";
      }
      if (buildPortalSyncStatus === "completed") {
        return "completed";
      }
      if (buildPortalSyncStatus === "failed") {
        return "failed";
      }
      return "publishing";
    }
    return "queued";
  }, [buildPortalSyncStatus, buildResult, buildRunStatus, buildSubmitting, buildWorkflowRunId]);

  const buildProgressTitle = useMemo(() => {
    if (buildProgressPhase === "dispatching") {
      return t("dashboard:desktopReleases.admin.build.progress.dispatching");
    }
    if (buildProgressPhase === "queued") {
      return t("dashboard:desktopReleases.admin.build.progress.queued");
    }
    if (buildProgressPhase === "running") {
      return t("dashboard:desktopReleases.admin.build.progress.running");
    }
    if (buildProgressPhase === "publishing") {
      return t("dashboard:desktopReleases.admin.build.progress.publishing");
    }
    if (buildProgressPhase === "completed") {
      return t("dashboard:desktopReleases.admin.build.progress.completed");
    }
    if (buildProgressPhase === "failed") {
      return t("dashboard:desktopReleases.admin.build.progress.failed");
    }
    return t("dashboard:desktopReleases.admin.build.progress.idle");
  }, [buildProgressPhase, t]);

  const buildProgressDescription = useMemo(() => {
    if (buildProgressPhase === "dispatching") {
      return t("dashboard:desktopReleases.admin.build.progress.dispatchingDescription");
    }
    if (buildProgressPhase === "queued") {
      return t("dashboard:desktopReleases.admin.build.progress.queuedDescription");
    }
    if (buildProgressPhase === "running") {
      return t("dashboard:desktopReleases.admin.build.progress.runningDescription");
    }
    if (buildProgressPhase === "publishing") {
      return t("dashboard:desktopReleases.admin.build.progress.publishingDescription");
    }
    if (buildProgressPhase === "completed") {
      return t("dashboard:desktopReleases.admin.build.progress.completedDescription");
    }
    if (buildProgressPhase === "failed") {
      return t("dashboard:desktopReleases.admin.build.progress.failedDescription");
    }
    return t("dashboard:desktopReleases.admin.build.progress.idleDescription");
  }, [buildProgressPhase, t]);

  const buildProgressBadgeLabel = useMemo(() => {
    if (buildProgressPhase === "dispatching") {
      return t("dashboard:desktopReleases.admin.build.progress.dispatchingBadge");
    }
    if (buildProgressPhase === "queued") {
      return t("dashboard:desktopReleases.admin.build.progress.queuedBadge");
    }
    if (buildProgressPhase === "running") {
      return t("dashboard:desktopReleases.admin.build.progress.runningBadge");
    }
    if (buildProgressPhase === "publishing") {
      return t("dashboard:desktopReleases.admin.build.progress.publishingBadge");
    }
    if (buildProgressPhase === "completed") {
      return t("dashboard:desktopReleases.admin.build.progress.completedBadge");
    }
    if (buildProgressPhase === "failed") {
      return t("dashboard:desktopReleases.admin.build.progress.failedBadge");
    }
    return t("dashboard:desktopReleases.admin.build.progress.idleBadge");
  }, [buildProgressPhase, t]);
  const buildProgressPercentValue = buildProgressPercent(buildProgressPhase);
  const buildProgressBarClassName = buildProgressToneClass(buildProgressPhase);
  const buildProgressBadgeClassName = buildProgressBadgeClass(buildProgressPhase);

  useEffect(() => {
    if (!buildVersionIsCustom) {
      setBuildVersion(suggestedBuildVersion);
    }
  }, [buildVersionIsCustom, suggestedBuildVersion]);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0] ?? null;
    setFile(nextFile);
    if (nextFile) {
      setInstallerFormat(inferInstallerFormatFromFileName(nextFile.name));
    }
  };

  const handleBuildVersionChange = (value: string) => {
    setBuildVersion(value);
    setBuildVersionIsCustom(normalizeDesktopReleaseVersion(value) !== suggestedBuildVersion);
  };

  const handleBuildRelease = async () => {
    if (!buildVersion.trim()) {
      return;
    }

    setBuildSubmitting(true);
    setBuildResult(null);
    setBuildRunStatus(null);
    setBuildRunStatusError(null);
    try {
      const response = await fetch("/api/desktop-releases/builds", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          version: buildVersion.trim(),
          platform: buildPlatform,
          bundleMode: buildBundleMode,
          releaseNotes: buildReleaseNotes.trim(),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof payload?.error === "string" ? payload.error : "desktop_release_build_failed");
      }

      const build = desktopReleaseBuildResponseSchema.parse(payload.build);
      setBuildResult(build);
      setBuildVersionIsCustom(normalizeDesktopReleaseVersion(build.version) !== suggestedBuildVersion);
      toast.success(t("dashboard:desktopReleases.admin.build.success"));
    } catch (buildError) {
      toast.error(
        buildError instanceof Error
          ? buildError.message
          : t("dashboard:desktopReleases.admin.build.failed"),
      );
    } finally {
      setBuildSubmitting(false);
    }
  };

  useEffect(() => {
    if (!buildWorkflowRunId) {
      setBuildRunStatus(null);
      setBuildRunStatusError(null);
      setBuildRunStatusLoading(false);
      return;
    }

    let cancelled = false;
    let retryTimer: number | undefined;
    let inFlight = false;

    const pollBuildStatus = async () => {
      if (cancelled || inFlight) {
        return;
      }

      inFlight = true;
      setBuildRunStatusLoading(true);

      try {
        const response = await fetch(`/api/desktop-releases/builds/${encodeURIComponent(buildWorkflowRunId)}/status`, {
          credentials: "include",
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(typeof payload?.error === "string" ? payload.error : "desktop_release_build_status_failed");
        }

        const status = desktopReleaseBuildRunStatusSchema.parse(payload.buildRun);
        if (!cancelled) {
          setBuildRunStatus(status);
          setBuildRunStatusError(null);
        }

        const workflowCompletedSuccessfully =
          status.workflowRunStatus === "completed"
          && status.workflowRunConclusion === "success";
        const portalSyncFinished = status.portalSyncStatus === "completed" || status.portalSyncStatus === "failed";

        if (!cancelled && (!workflowCompletedSuccessfully || !portalSyncFinished)) {
          retryTimer = window.setTimeout(() => {
            void pollBuildStatus();
          }, 15_000);
        }
      } catch (error) {
        if (!cancelled) {
          setBuildRunStatusError(
            error instanceof Error ? error.message : "desktop_release_build_status_failed",
          );
          retryTimer = window.setTimeout(() => {
            void pollBuildStatus();
          }, 15_000);
        }
      } finally {
        inFlight = false;
        if (!cancelled) {
          setBuildRunStatusLoading(false);
        }
      }
    };

    void pollBuildStatus();

    return () => {
      cancelled = true;
      if (retryTimer) {
        window.clearTimeout(retryTimer);
      }
    };
  }, [buildWorkflowRunId]);

  useEffect(() => {
    if (
      buildRunStatus?.workflowRunStatus === "completed"
      && buildRunStatus.workflowRunConclusion === "success"
      && buildRunStatus.portalSyncStatus === "completed"
    ) {
      refresh();
    }
  }, [buildRunStatus?.portalSyncStatus, buildRunStatus?.workflowRunConclusion, buildRunStatus?.workflowRunStatus, refresh]);

  const handleUpload = async () => {
    if (!file) {
      return;
    }
    if (!version.trim()) {
      return;
    }

    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("version", version.trim());
      form.append("platform", platform);
      form.append("channel", channel);
      form.append("installerFormat", installerFormat);
      form.append("releaseNotes", releaseNotes.trim());
      form.append("publish", String(publish));

      const response = await fetch("/api/desktop-releases/upload", {
        method: "POST",
        credentials: "include",
        body: form,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof payload?.error === "string" ? payload.error : "desktop_release_upload_failed");
      }

      setVersion("");
      setReleaseNotes("");
      setFile(null);
      setPublish(true);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      refresh();
      toast.success(t("dashboard:desktopReleases.admin.uploadSuccess"));
    } catch (uploadError) {
      toast.error(
        uploadError instanceof Error
          ? uploadError.message
          : t("dashboard:desktopReleases.admin.uploadFailed"),
      );
    } finally {
      setUploading(false);
    }
  };

  const handleTogglePublish = async (release: DesktopReleaseAsset) => {
    setActionInFlightId(release.id);
    try {
      const response = await fetch(`/api/desktop-releases/${release.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          isPublished: !release.isPublished,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof payload?.error === "string" ? payload.error : "desktop_release_update_failed");
      }
      refresh();
      toast.success(
        release.isPublished
          ? t("dashboard:desktopReleases.admin.unpublishSuccess")
          : t("dashboard:desktopReleases.admin.publishSuccess"),
      );
    } catch (toggleError) {
      toast.error(
        toggleError instanceof Error
          ? toggleError.message
          : t("dashboard:desktopReleases.admin.updateFailed"),
      );
    } finally {
      setActionInFlightId(null);
    }
  };

  const handleDelete = async (release: DesktopReleaseAsset) => {
    if (!window.confirm(t("dashboard:desktopReleases.admin.deleteConfirm", { version: release.version }))) {
      return;
    }

    setActionInFlightId(release.id);
    try {
      const response = await fetch(`/api/desktop-releases/${release.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof payload?.error === "string" ? payload.error : "desktop_release_delete_failed");
      }
      refresh();
      toast.success(t("dashboard:desktopReleases.admin.deleteSuccess"));
    } catch (deleteError) {
      toast.error(
        deleteError instanceof Error
          ? deleteError.message
          : t("dashboard:desktopReleases.admin.deleteFailed"),
      );
    } finally {
      setActionInFlightId(null);
    }
  };

  if (variant === "dashboard") {
    return (
      <div className="relative overflow-hidden rounded-[28px] border border-sky-100 bg-gradient-to-br from-sky-50 via-white to-slate-50 p-5 shadow-[0_24px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-sky-500 via-cyan-400 to-emerald-400" />
        <DashboardSectionHeader
          eyebrow={t("dashboard:desktopReleases.eyebrow")}
          title={t("dashboard:desktopReleases.title")}
          description={t("dashboard:desktopReleases.description")}
          trailing={
            <Badge variant="secondary" className="border-sky-200 bg-sky-50 text-sky-700">
              <Download className="mr-1 h-3 w-3" />
              {latestReleases.length}
            </Badge>
          }
          titleClassName={dashboardCardTitleLgClass}
        />

        {isLoading ? (
          <div className="mt-4 flex items-center gap-3 rounded-2xl border border-slate-200 bg-white/90 px-4 py-4 text-sm text-slate-600">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("dashboard:desktopReleases.loading")}
          </div>
        ) : error ? (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
            {error}
          </div>
        ) : primaryRelease ? (
          <div className="mt-4 grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-sm">
              <ReleaseBadgeRow release={primaryRelease} t={t} />
              <p className={`mt-3 ${dashboardCardTitleClass}`}>
                {t("dashboard:desktopReleases.latestPublished")}
              </p>
              <p className={`mt-1 ${dashboardCardDescriptionClass}`}>
                {t("dashboard:desktopReleases.fileInfo", {
                  file: primaryRelease.fileName,
                  size: formatBytes(primaryRelease.fileSizeBytes),
                })}
              </p>
              {primaryRelease.releaseNotes ? (
                <p className="mt-3 line-clamp-3 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-600">
                  {primaryRelease.releaseNotes}
                </p>
              ) : null}
              <div className="mt-4 flex flex-wrap gap-2">
                <Button asChild className="bg-slate-900 text-white hover:bg-slate-800">
                  <a href={primaryRelease.downloadUrl}>
                    <Download className="mr-2 h-4 w-4" />
                    {t("dashboard:desktopReleases.downloadFor", {
                      platform: formatPlatformLabel(t, primaryRelease.platform),
                    })}
                  </a>
                </Button>
                <Button
                  asChild
                  variant="outline"
                  className="border-slate-200 bg-white text-slate-700"
                >
                  <a href={primaryRelease.downloadUrl}>
                    {t("dashboard:desktopReleases.download")}
                    <ChevronRight className="ml-2 h-4 w-4" />
                  </a>
                </Button>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                {t("dashboard:desktopReleases.availablePlatforms")}
              </p>
              <div className="mt-3 space-y-2">
                {desktopReleasePlatformValues.map((candidatePlatform) => {
                  const release = catalog?.latestByPlatform[candidatePlatform] ?? null;
                  return (
                    <div
                      key={candidatePlatform}
                      className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className={dashboardCardTitleClass}>
                          {formatPlatformLabel(t, candidatePlatform)}
                        </p>
                        <p className={dashboardCardDescriptionClass}>
                          {release
                            ? t("dashboard:desktopReleases.versionShort", {
                              version: release.version,
                              format: formatInstallerLabel(t, release.installerFormat),
                            })
                            : t("dashboard:desktopReleases.noRelease")}
                        </p>
                      </div>
                      {release ? (
                        <Button asChild size="sm" variant="outline" className="shrink-0">
                          <a href={release.downloadUrl}>
                            <Download className="mr-1.5 h-3.5 w-3.5" />
                            {t("dashboard:desktopReleases.download")}
                          </a>
                        </Button>
                      ) : (
                        <Badge variant="secondary" className="shrink-0 border-slate-200 bg-white text-slate-500">
                          {t("dashboard:desktopReleases.noRelease")}
                        </Badge>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-white/90 px-4 py-8 text-sm text-slate-500">
            {t("dashboard:desktopReleases.empty")}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6 rounded-[28px] border border-slate-200/80 bg-white/90 p-5 shadow-[0_24px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
      <DashboardSectionHeader
        eyebrow={t("dashboard:desktopReleases.admin.eyebrow")}
        title={t("dashboard:desktopReleases.admin.title")}
        description={t("dashboard:desktopReleases.admin.description")}
        trailing={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={refresh}
              className="border-slate-200 bg-white text-slate-700"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              {t("dashboard:desktopReleases.admin.refresh")}
            </Button>
            <Badge variant="secondary" className="border-slate-200 bg-slate-50 text-slate-700">
              {latestReleases.length}
            </Badge>
          </div>
        }
        titleClassName={dashboardCardTitleLgClass}
      />

      {canTriggerBuild ? (
        <div className="rounded-2xl border border-sky-200 bg-sky-50/70 p-4 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-semibold text-sky-800">
            <Rocket className="h-4 w-4" />
            {t("dashboard:desktopReleases.admin.build.eyebrow")}
          </div>
          <div className="mt-1 text-lg font-semibold text-slate-900">
            {t("dashboard:desktopReleases.admin.build.title")}
          </div>
          <p className={`mt-1 ${dashboardCardDescriptionClass}`}>
            {t("dashboard:desktopReleases.admin.build.description")}
          </p>

          <div className="mt-4 grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
            <div className="space-y-4 rounded-2xl border border-sky-100 bg-white/95 p-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  {t("dashboard:desktopReleases.admin.formVersion")}
                </label>
                <Input
                  value={buildVersion}
                  onChange={(event) => handleBuildVersionChange(event.target.value)}
                  placeholder={suggestedBuildVersion}
                />
                <p className="mt-2 text-xs text-slate-500">
                  {t("dashboard:desktopReleases.admin.build.versionHint", { version: suggestedBuildVersion })}
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    {t("dashboard:desktopReleases.admin.build.platform")}
                  </label>
                  <Select
                    value={buildPlatform}
                    onValueChange={(value) => setBuildPlatform(value as DesktopReleaseBuildPlatform)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t("dashboard:desktopReleases.admin.build.platform")} />
                    </SelectTrigger>
                    <SelectContent>
                      {desktopReleaseBuildPlatformValues.map((candidatePlatform) => (
                        <SelectItem key={candidatePlatform} value={candidatePlatform}>
                          {formatBuildPlatformLabel(t, candidatePlatform)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    {t("dashboard:desktopReleases.admin.build.bundleMode")}
                  </label>
                  <Select
                    value={buildBundleMode}
                    onValueChange={(value) => setBuildBundleMode(value as DesktopReleaseBuildBundleMode)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t("dashboard:desktopReleases.admin.build.bundleMode")} />
                    </SelectTrigger>
                    <SelectContent>
                      {desktopReleaseBuildBundleModeValues.map((candidateBundleMode) => (
                        <SelectItem key={candidateBundleMode} value={candidateBundleMode}>
                          {formatBuildBundleModeLabel(t, candidateBundleMode)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  {t("dashboard:desktopReleases.admin.formReleaseNotes")}
                </label>
                <Textarea
                  rows={4}
                  value={buildReleaseNotes}
                  onChange={(event) => setBuildReleaseNotes(event.target.value)}
                  placeholder={t("dashboard:desktopReleases.admin.formReleaseNotes")}
                />
              </div>

              <Button
                className={buildButtonClassName}
                onClick={() => {
                  void handleBuildRelease();
                }}
                disabled={buildSubmitting || !isBuildReady}
              >
                {buildSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Rocket className="mr-2 h-4 w-4" />}
                {buildSubmitting
                  ? t("dashboard:desktopReleases.admin.build.submitting")
                  : t("dashboard:desktopReleases.admin.build.trigger")}
              </Button>
            </div>

            <div className="space-y-3">
              {buildSubmitting || buildResult || buildRunStatus ? (
                <div className="rounded-2xl border border-sky-100 bg-white/95 p-4 text-sm text-slate-700 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                        {t("dashboard:desktopReleases.admin.build.progress.title")}
                      </p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">
                        {buildProgressTitle}
                      </p>
                    </div>
                    <Badge variant="outline" className={buildProgressBadgeClassName}>
                      {buildProgressBadgeLabel}
                    </Badge>
                  </div>

                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${buildProgressBarClassName}`}
                      style={{ width: `${buildProgressPercentValue}%` }}
                    />
                  </div>

                  <p className="mt-3 text-sm leading-6 text-slate-600">
                    {buildProgressDescription}
                  </p>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {buildWorkflowRunId ? (
                      <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-700">
                        {`Run #${buildWorkflowRunId}`}
                      </Badge>
                    ) : null}
                    {buildRunStatusLoading ? (
                      <Badge variant="outline" className="border-sky-200 bg-sky-50 text-sky-700">
                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                        {t("dashboard:desktopReleases.admin.build.progress.refreshing")}
                      </Badge>
                    ) : null}
                    {buildRunStatusError ? (
                      <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">
                        {t("dashboard:desktopReleases.admin.build.progress.retrying")}
                      </Badge>
                    ) : null}
                  </div>

                  <div className="mt-4">
                    <Button
                      asChild
                      size="sm"
                      className="bg-sky-700 text-white hover:bg-sky-800"
                    >
                      <a href={buildRunStatus?.workflowRunUrl ?? buildResult?.workflowRunUrl ?? buildResult?.workflowUrl} target="_blank" rel="noreferrer">
                        {t("dashboard:desktopReleases.admin.build.openActions")}
                        <ChevronRight className="ml-2 h-4 w-4" />
                      </a>
                    </Button>
                  </div>

                  {buildRunStatus?.workflowRunUpdatedAt ? (
                    <p className="mt-3 text-xs text-slate-500">
                      {t("dashboard:desktopReleases.admin.build.progress.lastUpdated", {
                        time: new Intl.DateTimeFormat(undefined, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        }).format(new Date(buildRunStatus.workflowRunUpdatedAt)),
                      })}
                    </p>
                  ) : null}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-sky-200 bg-white/90 px-4 py-8 text-sm text-slate-500">
                  {t("dashboard:desktopReleases.admin.build.resultEmpty")}
                </div>
              )}

              {buildResult ? (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4 text-sm text-emerald-900">
                  <p className="font-semibold">
                    {t("dashboard:desktopReleases.admin.build.success")}
                  </p>
                  <p className="mt-1 text-emerald-800">
                    {t("dashboard:desktopReleases.admin.build.queued", {
                      version: buildResult.version,
                      platform: formatBuildPlatformLabel(t, buildResult.platform),
                    })}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Badge variant="outline" className="border-emerald-200 bg-white text-emerald-700">
                      {buildResult.repository}
                    </Badge>
                    <Badge variant="outline" className="border-emerald-200 bg-white text-emerald-700">
                      {buildResult.workflow}
                    </Badge>
                    <Badge variant="outline" className="border-emerald-200 bg-white text-emerald-700">
                      {formatBuildBundleModeLabel(t, buildResult.bundleMode)}
                    </Badge>
                  </div>
                </div>
              ) : null}

              <div className="rounded-2xl border border-sky-100 bg-white/90 p-4 text-xs text-slate-500">
                {t("dashboard:desktopReleases.admin.build.note")}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <Upload className="h-4 w-4" />
            {t("dashboard:desktopReleases.admin.upload")}
          </div>
          <p className={`mt-2 ${dashboardCardDescriptionClass}`}>
            {t("dashboard:desktopReleases.admin.formHint")}
          </p>

          <div className="mt-4 space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                {t("dashboard:desktopReleases.admin.formVersion")}
              </label>
              <Input
                value={version}
                onChange={(event) => setVersion(event.target.value)}
                placeholder="0.1.0"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  {t("dashboard:desktopReleases.admin.formPlatform")}
                </label>
                <Select value={platform} onValueChange={(value) => setPlatform(value as DesktopReleasePlatform)}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("dashboard:desktopReleases.admin.formPlatform")} />
                  </SelectTrigger>
                  <SelectContent>
                    {desktopReleasePlatformValues.map((candidatePlatform) => (
                      <SelectItem key={candidatePlatform} value={candidatePlatform}>
                        {formatPlatformLabel(t, candidatePlatform)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  {t("dashboard:desktopReleases.admin.formChannel")}
                </label>
                <Select value={channel} onValueChange={(value) => setChannel(value as DesktopReleaseChannel)}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("dashboard:desktopReleases.admin.formChannel")} />
                  </SelectTrigger>
                  <SelectContent>
                    {["stable", "beta", "nightly"].map((candidateChannel) => (
                      <SelectItem key={candidateChannel} value={candidateChannel}>
                        {formatChannelLabel(candidateChannel as DesktopReleaseChannel)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                {t("dashboard:desktopReleases.admin.formFormat")}
              </label>
              <Select
                value={installerFormat}
                onValueChange={(value) => setInstallerFormat(value as DesktopReleaseInstallerFormat)}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("dashboard:desktopReleases.admin.formFormat")} />
                </SelectTrigger>
                <SelectContent>
                  {[
                    "exe",
                    "msi",
                    "dmg",
                    "pkg",
                    "deb",
                    "rpm",
                    "appimage",
                    "zip",
                    "tar_gz",
                    "other",
                  ].map((candidateFormat) => (
                    <SelectItem key={candidateFormat} value={candidateFormat}>
                      {formatInstallerLabel(t, candidateFormat as DesktopReleaseInstallerFormat)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                {t("dashboard:desktopReleases.admin.formReleaseNotes")}
              </label>
              <Textarea
                rows={4}
                value={releaseNotes}
                onChange={(event) => setReleaseNotes(event.target.value)}
                placeholder={t("dashboard:desktopReleases.admin.formReleaseNotes")}
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                id="desktop-release-publish"
                type="checkbox"
                checked={publish}
                onChange={(event) => setPublish(event.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
              />
              <label htmlFor="desktop-release-publish" className="text-sm text-slate-700">
                {t("dashboard:desktopReleases.admin.formPublished")}
              </label>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                {t("dashboard:desktopReleases.admin.formFile")}
              </label>
              <Input
                ref={fileInputRef}
                type="file"
                onChange={handleFileChange}
              />
              {file ? (
                <p className="mt-2 text-xs text-slate-500">
                  {file.name} · {formatBytes(file.size)}
                </p>
              ) : null}
            </div>

            <Button
              className="w-full bg-slate-900 text-white hover:bg-slate-800"
              onClick={() => {
                void handleUpload();
              }}
              disabled={uploading || !file || !version.trim()}
            >
              {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              {t("dashboard:desktopReleases.admin.upload")}
            </Button>
          </div>
        </div>

        <div className="space-y-3">
          {isLoading ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
              <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
              {t("dashboard:desktopReleases.loading")}
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
              {error}
            </div>
          ) : latestReleases.length > 0 ? (
            latestReleases.map((release) => (
              <div
                key={release.id}
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className={dashboardCardTitleClass}>{release.fileName}</p>
                      {release.isPublished ? (
                        <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                          {t("dashboard:desktopReleases.admin.statePublished")}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
                          {t("dashboard:desktopReleases.admin.stateHidden")}
                        </Badge>
                      )}
                    </div>
                    <ReleaseBadgeRow release={release} t={t} />
                    <p className={`mt-2 ${dashboardCardDescriptionClass}`}>
                      {t("dashboard:desktopReleases.fileInfo", {
                        file: release.fileName,
                        size: formatBytes(release.fileSizeBytes),
                      })}
                    </p>
                    {release.releaseNotes ? (
                      <p className="mt-3 line-clamp-3 text-sm leading-6 text-slate-600">
                        {release.releaseNotes}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Button asChild variant="outline" className="border-slate-200 bg-white">
                      <a href={release.downloadUrl}>
                        <Download className="mr-2 h-4 w-4" />
                        {t("dashboard:desktopReleases.download")}
                      </a>
                    </Button>
                    <Button
                      variant="outline"
                      className="border-slate-200 bg-white"
                      onClick={() => {
                        void handleTogglePublish(release);
                      }}
                      disabled={actionInFlightId === release.id}
                    >
                      {actionInFlightId === release.id ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Sparkles className="mr-2 h-4 w-4" />
                      )}
                      {release.isPublished
                        ? t("dashboard:desktopReleases.admin.unpublish")
                        : t("dashboard:desktopReleases.admin.publish")}
                    </Button>
                    <Button
                      variant="destructive"
                      className="bg-red-600 text-white hover:bg-red-700"
                      onClick={() => {
                        void handleDelete(release);
                      }}
                      disabled={actionInFlightId === release.id}
                    >
                      {actionInFlightId === release.id ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="mr-2 h-4 w-4" />
                      )}
                      {t("dashboard:desktopReleases.admin.delete")}
                    </Button>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
              {t("dashboard:desktopReleases.empty")}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
