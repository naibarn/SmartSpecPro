import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";

import {
  Download,
  Loader2,
  RefreshCw,
  Rocket,
  Trash2,
  Upload,
  ChevronRight,
  Puzzle,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "@/components/ui/confirm/ConfirmProvider";

import { useScopedTranslation } from "@/i18n/useScopedTranslation";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
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
  type DesktopReleaseBuildHistoryItem,
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
import { useDesktopReleaseBuildHistory } from "./useDesktopReleaseBuildHistory";

type DesktopReleasePanelVariant = "dashboard" | "admin";
type Translator = (key: string, values?: Record<string, string | number>) => string;
type DesktopReleaseBuildProgressPhase = "idle" | "dispatching" | "queued" | "running" | "publishing" | "stalled" | "completed" | "failed";
type DesktopReleaseBuildSessionState = {
  buildResult: DesktopReleaseBuildResponse;
  buildRunStatus: DesktopReleaseBuildRunStatus | null;
};

const DESKTOP_RELEASE_BUILD_SESSION_STORAGE_KEY = "smartaihub.desktop-release.build-session.v1";
const DESKTOP_RELEASE_BUILD_STALE_AFTER_MS = 30 * 60 * 1000;
const CHROME_EXTENSION_FALLBACK_DOWNLOAD_URL = "/api/desktop-releases/marketplace-extension/download";
const WORKER_APP_FALLBACK_DOWNLOAD_URL = "/api/desktop-releases/worker-app/download";
const WORKER_APP_MAC_SOURCE_FALLBACK_DOWNLOAD_URL = "/api/desktop-releases/worker-app/macos-source/download";

type PublicDashboardRelease = {
  version: string;
  fileName: string;
  fileSizeBytes: number;
  updatedAt: string;
  downloadUrl: string;
  installerFormat?: "exe" | "msi" | "zip";
};

type PublicDashboardReleaseState = {
  release: PublicDashboardRelease | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
};

function usePublicDashboardRelease(options: {
  enabled: boolean;
  latestUrl: string;
  unavailableError: string;
}): PublicDashboardReleaseState {
  const { enabled, latestUrl, unavailableError } = options;
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [state, setState] = useState<Omit<PublicDashboardReleaseState, "refresh">>({
    release: null,
    isLoading: enabled,
    error: null,
  });

  useEffect(() => {
    if (!enabled) {
      setState({ release: null, isLoading: false, error: null });
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    setState((previous) => ({
      release: previous.release,
      isLoading: true,
      error: null,
    }));

    void fetch(latestUrl, {
      credentials: "include",
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(
            typeof payload?.error === "string"
              ? payload.error
              : unavailableError,
          );
        }
        return payload?.release ?? null;
      })
      .then((release) => {
        if (!cancelled) {
          setState({ release, isLoading: false, error: null });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState((previous) => ({
            release: previous.release,
            isLoading: false,
            error: error instanceof Error ? error.message : unavailableError,
          }));
        }
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [enabled, latestUrl, refreshNonce, unavailableError]);

  return {
    ...state,
    refresh: () => setRefreshNonce((value) => value + 1),
  };
}

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

function toTimestampMs(value: string | null | undefined): number {
  if (!value) {
    return 0;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function buildRunStatusFromHistoryItem(
  item: DesktopReleaseBuildHistoryItem,
): DesktopReleaseBuildRunStatus {
  return {
    workflowRunId: item.workflowRunId,
    workflowRunUrl: item.workflowRunUrl,
    workflowRunStatus: item.workflowRunStatus,
    workflowRunConclusion: item.workflowRunConclusion,
    workflowRunUpdatedAt: item.workflowRunUpdatedAt,
    portalSyncStatus: item.portalSyncStatus,
    portalSyncUpdatedAt: item.portalSyncUpdatedAt,
    portalSyncError: item.portalSyncError,
    portalSyncAttempts: item.portalSyncAttempts,
  };
}

function formatBuildPortalSyncError(
  t: Translator,
  error: string,
): string {
  if (error === "desktop_release_github_release_not_ready") {
    return t("dashboard:desktopReleases.admin.build.progress.error.releaseNotReady");
  }

  const assetNotReadyMatch = error.match(/^desktop_release_github_asset_not_found_(windows|macos|linux)$/);
  if (assetNotReadyMatch) {
    return t("dashboard:desktopReleases.admin.build.progress.error.assetNotReady", {
      platform: formatPlatformLabel(t, assetNotReadyMatch[1] as DesktopReleasePlatform),
    });
  }

  if (error === "desktop_release_github_token_not_configured") {
    return t("dashboard:desktopReleases.admin.build.progress.error.missingGithubToken");
  }

  return error;
}

function formatCatalogError(t: Translator, error: string | null): string | null {
  if (!error) {
    return null;
  }

  if (error === "desktop_release_catalog_timeout") {
    return t("dashboard:desktopReleases.error.timeout");
  }
  if (error === "desktop_release_unauthorized") {
    return t("dashboard:desktopReleases.error.unauthorized");
  }
  if (error === "desktop_release_forbidden") {
    return t("dashboard:desktopReleases.error.forbidden");
  }
  if (error === "desktop_release_catalog_unavailable") {
    return t("dashboard:desktopReleases.error.unavailable");
  }

  return error;
}

function formatBuildHistoryError(t: Translator, error: string | null): string | null {
  if (!error) {
    return null;
  }

  if (error === "desktop_release_build_history_timeout") {
    return t("dashboard:desktopReleases.admin.build.history.errorTimeout");
  }
  if (error === "desktop_release_unauthorized") {
    return t("dashboard:desktopReleases.admin.build.history.errorUnauthorized");
  }
  if (error === "desktop_release_forbidden") {
    return t("dashboard:desktopReleases.admin.build.history.errorForbidden");
  }
  if (error === "desktop_release_build_history_unavailable") {
    return t("dashboard:desktopReleases.admin.build.history.errorUnavailable");
  }

  return error;
}

function formatUploadError(t: Translator, error: string | null): string | null {
  if (!error) {
    return null;
  }

  if (error === "desktop_release_upload_too_large") {
    return t("dashboard:desktopReleases.admin.uploadTooLarge");
  }
  if (error === "desktop_release_presign_unavailable") {
    return t("dashboard:desktopReleases.admin.uploadPresignUnavailable");
  }
  if (error === "desktop_release_storage_key_invalid") {
    return t("dashboard:desktopReleases.admin.uploadStorageInvalid");
  }
  if (error === "desktop_release_unauthorized") {
    return t("dashboard:desktopReleases.admin.uploadUnauthorized");
  }
  if (error === "desktop_release_forbidden") {
    return t("dashboard:desktopReleases.admin.uploadForbidden");
  }
  if (error === "desktop_release_file_missing") {
    return t("dashboard:desktopReleases.admin.uploadMissingFile");
  }

  return error;
}

async function hashFileSha256(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
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
    case "stalled":
      return 92;
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
    case "stalled":
      return "bg-gradient-to-r from-amber-500 via-orange-500 to-rose-400";
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
    case "stalled":
      return "border-amber-200 bg-amber-50 text-amber-800";
    default:
      return "border-slate-200 bg-slate-50 text-slate-500";
  }
}

function resolveDesktopReleaseBuildProgressPhase(params: {
  buildSubmitting: boolean;
  hasBuildResult: boolean;
  hasWorkflowRunId: boolean;
  workflowRunStatus: DesktopReleaseBuildRunStatus["workflowRunStatus"] | DesktopReleaseBuildHistoryItem["workflowRunStatus"];
  workflowRunConclusion: DesktopReleaseBuildRunStatus["workflowRunConclusion"] | DesktopReleaseBuildHistoryItem["workflowRunConclusion"];
  portalSyncStatus: DesktopReleaseBuildRunStatus["portalSyncStatus"] | DesktopReleaseBuildHistoryItem["portalSyncStatus"];
  workflowRunUpdatedAt: DesktopReleaseBuildRunStatus["workflowRunUpdatedAt"] | DesktopReleaseBuildHistoryItem["workflowRunUpdatedAt"];
  queuedAt?: string | null;
}): DesktopReleaseBuildProgressPhase {
  if (params.buildSubmitting) {
    return "dispatching";
  }
  if (!params.hasBuildResult) {
    return "idle";
  }
  if (!params.hasWorkflowRunId) {
    return "queued";
  }
  if (!params.workflowRunStatus) {
    return "queued";
  }
  if (params.workflowRunStatus === "queued") {
    return "queued";
  }
  if (params.workflowRunStatus === "in_progress") {
    return "running";
  }
  if (params.workflowRunStatus === "completed") {
    if (params.workflowRunConclusion !== "success") {
      return "failed";
    }
    if (params.portalSyncStatus === "completed") {
      return "completed";
    }
    if (params.portalSyncStatus === "failed") {
      return "failed";
    }
    const startedAt = params.workflowRunUpdatedAt ?? params.queuedAt ?? null;
    const startedAtMs = startedAt ? Date.parse(startedAt) : Number.NaN;
    if (Number.isFinite(startedAtMs) && Date.now() - startedAtMs >= DESKTOP_RELEASE_BUILD_STALE_AFTER_MS) {
      return "stalled";
    }
    return "publishing";
  }
  return "queued";
}

function buildProgressTitleForPhase(
  t: Translator,
  phase: DesktopReleaseBuildProgressPhase,
): string {
  switch (phase) {
    case "dispatching":
      return t("dashboard:desktopReleases.admin.build.progress.dispatching");
    case "queued":
      return t("dashboard:desktopReleases.admin.build.progress.queued");
    case "running":
      return t("dashboard:desktopReleases.admin.build.progress.running");
    case "publishing":
      return t("dashboard:desktopReleases.admin.build.progress.publishing");
    case "stalled":
      return t("dashboard:desktopReleases.admin.build.progress.stalled");
    case "completed":
      return t("dashboard:desktopReleases.admin.build.progress.completed");
    case "failed":
      return t("dashboard:desktopReleases.admin.build.progress.failed");
    default:
      return t("dashboard:desktopReleases.admin.build.progress.idle");
  }
}

function buildProgressDescriptionForPhase(
  t: Translator,
  phase: DesktopReleaseBuildProgressPhase,
): string {
  switch (phase) {
    case "dispatching":
      return t("dashboard:desktopReleases.admin.build.progress.dispatchingDescription");
    case "queued":
      return t("dashboard:desktopReleases.admin.build.progress.queuedDescription");
    case "running":
      return t("dashboard:desktopReleases.admin.build.progress.runningDescription");
    case "publishing":
      return t("dashboard:desktopReleases.admin.build.progress.publishingDescription");
    case "stalled":
      return t("dashboard:desktopReleases.admin.build.progress.stalledDescription");
    case "completed":
      return t("dashboard:desktopReleases.admin.build.progress.completedDescription");
    case "failed":
      return t("dashboard:desktopReleases.admin.build.progress.failedDescription");
    default:
      return t("dashboard:desktopReleases.admin.build.progress.idleDescription");
  }
}

function buildProgressBadgeLabelForPhase(
  t: Translator,
  phase: DesktopReleaseBuildProgressPhase,
): string {
  switch (phase) {
    case "dispatching":
      return t("dashboard:desktopReleases.admin.build.progress.dispatchingBadge");
    case "queued":
      return t("dashboard:desktopReleases.admin.build.progress.queuedBadge");
    case "running":
      return t("dashboard:desktopReleases.admin.build.progress.runningBadge");
    case "publishing":
      return t("dashboard:desktopReleases.admin.build.progress.publishingBadge");
    case "stalled":
      return t("dashboard:desktopReleases.admin.build.progress.stalledBadge");
    case "completed":
      return t("dashboard:desktopReleases.admin.build.progress.completedBadge");
    case "failed":
      return t("dashboard:desktopReleases.admin.build.progress.failedBadge");
    default:
      return t("dashboard:desktopReleases.admin.build.progress.idleBadge");
  }
}

function readDesktopReleaseBuildSessionState(): DesktopReleaseBuildSessionState | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(DESKTOP_RELEASE_BUILD_SESSION_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as {
      buildResult?: unknown;
      buildRunStatus?: unknown;
    };

    const buildResult = desktopReleaseBuildResponseSchema.parse(parsed.buildResult);
    const buildRunStatus = parsed.buildRunStatus
      ? desktopReleaseBuildRunStatusSchema.parse(parsed.buildRunStatus)
      : null;

    return {
      buildResult,
      buildRunStatus,
    };
  } catch {
    return null;
  }
}

function writeDesktopReleaseBuildSessionState(state: DesktopReleaseBuildSessionState | null): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    if (!state) {
      window.sessionStorage.removeItem(DESKTOP_RELEASE_BUILD_SESSION_STORAGE_KEY);
      return;
    }

    window.sessionStorage.setItem(
      DESKTOP_RELEASE_BUILD_SESSION_STORAGE_KEY,
      JSON.stringify(state),
    );
  } catch {
    // Ignore storage issues in private browsing / quota constrained modes.
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
  const { confirm } = useConfirm();
  const {
    catalog,
    isLoading,
    error,
    refresh: refreshCatalog,
    attempt: catalogAttempt,
  } = useDesktopReleaseCatalog(enabled);
  const {
    history: buildHistory,
    isLoading: buildHistoryLoading,
    error: buildHistoryError,
    refresh: refreshBuildHistory,
    attempt: buildHistoryAttempt,
  } = useDesktopReleaseBuildHistory(variant === "admin" && enabled);
  const {
    release: marketplaceExtensionRelease,
    isLoading: marketplaceExtensionLoading,
    error: marketplaceExtensionError,
    refresh: refreshMarketplaceExtensionRelease,
  } = usePublicDashboardRelease({
    enabled: variant === "dashboard" && enabled,
    latestUrl: "/api/desktop-releases/marketplace-extension/latest",
    unavailableError: "marketplace_extension_release_unavailable",
  });
  const {
    release: workerAppRelease,
    isLoading: workerAppLoading,
    error: workerAppError,
    refresh: refreshWorkerAppRelease,
  } = usePublicDashboardRelease({
    enabled: variant === "dashboard" && enabled,
    latestUrl: "/api/desktop-releases/worker-app/latest",
    unavailableError: "worker_app_release_unavailable",
  });
  const {
    release: workerAppMacSourceRelease,
    isLoading: workerAppMacSourceLoading,
    error: workerAppMacSourceError,
    refresh: refreshWorkerAppMacSourceRelease,
  } = usePublicDashboardRelease({
    enabled: variant === "dashboard" && enabled,
    latestUrl: "/api/desktop-releases/worker-app/macos-source/latest",
    unavailableError: "worker_app_macos_source_release_unavailable",
  });
  const [uploading, setUploading] = useState(false);
  const [actionInFlightId, setActionInFlightId] = useState<number | null>(null);
  const [buildSubmitting, setBuildSubmitting] = useState(false);
  const [buildVersion, setBuildVersion] = useState("");
  const [buildVersionIsCustom, setBuildVersionIsCustom] = useState(false);
  const [buildPlatform, setBuildPlatform] = useState<DesktopReleaseBuildPlatform>("windows");
  const [buildBundleMode, setBuildBundleMode] = useState<DesktopReleaseBuildBundleMode>("on-demand");
  const [buildReleaseNotes, setBuildReleaseNotes] = useState("");
  const [buildResult, setBuildResult] = useState<DesktopReleaseBuildResponse | null>(() => (
    readDesktopReleaseBuildSessionState()?.buildResult ?? null
  ));
  const [buildRunStatus, setBuildRunStatus] = useState<DesktopReleaseBuildRunStatus | null>(() => (
    readDesktopReleaseBuildSessionState()?.buildRunStatus ?? null
  ));
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
  const [catalogLoadStartedAt, setCatalogLoadStartedAt] = useState<number | null>(null);
  const [historyLoadStartedAt, setHistoryLoadStartedAt] = useState<number | null>(null);
  const [loadingTick, setLoadingTick] = useState(0);
  const lastCatalogRefreshAtRef = useRef(0);
  const lastHistoryRefreshAtRef = useRef(0);

  const preferredPlatform = useMemo(() => detectPreferredDesktopPlatform(), []);
  const primaryRelease = useMemo(
    () => getPrimaryRelease(catalog, preferredPlatform),
    [catalog, preferredPlatform],
  );
  const latestReleases = catalog?.releases ?? [];
  const hasCatalog = Boolean(catalog);
  const showCatalogLoading = isLoading && !hasCatalog;
  const showCatalogRefreshing = isLoading && hasCatalog;
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
  const buildHistoryItems = buildHistory?.builds ?? [];
  const showBuildHistory = variant === "admin";
  const triggerCatalogRefresh = useCallback((force = false) => {
    const now = Date.now();
    if (!force) {
      if (isLoading) {
        return;
      }
      if (now - lastCatalogRefreshAtRef.current < 15_000) {
        return;
      }
    }
    lastCatalogRefreshAtRef.current = now;
    refreshCatalog();
  }, [isLoading, refreshCatalog]);

  const triggerBuildHistoryRefresh = useCallback((force = false) => {
    const now = Date.now();
    if (!force) {
      if (buildHistoryLoading) {
        return;
      }
      if (now - lastHistoryRefreshAtRef.current < 20_000) {
        return;
      }
    }
    lastHistoryRefreshAtRef.current = now;
    refreshBuildHistory();
  }, [buildHistoryLoading, refreshBuildHistory]);

  const handleRefreshAll = () => {
    triggerCatalogRefresh(true);
    triggerBuildHistoryRefresh(true);
    refreshMarketplaceExtensionRelease();
    refreshWorkerAppRelease();
    refreshWorkerAppMacSourceRelease();
  };

  const buildProgressPhase = useMemo<DesktopReleaseBuildProgressPhase>(() => {
    return resolveDesktopReleaseBuildProgressPhase({
      buildSubmitting,
      hasBuildResult: Boolean(buildResult),
      hasWorkflowRunId: Boolean(buildWorkflowRunId),
      workflowRunStatus: buildRunStatus?.workflowRunStatus ?? null,
      workflowRunConclusion: buildRunStatus?.workflowRunConclusion ?? null,
      portalSyncStatus: buildPortalSyncStatus,
      workflowRunUpdatedAt: buildRunStatus?.workflowRunUpdatedAt ?? null,
      queuedAt: buildResult?.queuedAt ?? null,
    });
  }, [buildPortalSyncStatus, buildResult, buildRunStatus, buildSubmitting, buildWorkflowRunId]);
  const catalogErrorMessage = useMemo(() => formatCatalogError(t, error), [error, t]);
  const buildHistoryErrorMessage = useMemo(
    () => formatBuildHistoryError(t, buildHistoryError),
    [buildHistoryError, t],
  );

  const currentBuildHistoryItem = useMemo(() => {
    if (!buildWorkflowRunId) {
      return null;
    }

    return buildHistoryItems.find((item) => item.workflowRunId === buildWorkflowRunId) ?? null;
  }, [buildHistoryItems, buildWorkflowRunId]);

  const buildProgressTitle = useMemo(() => {
    return buildProgressTitleForPhase(t, buildProgressPhase);
  }, [buildProgressPhase, t]);

  const buildProgressDescription = useMemo(() => {
    return buildProgressDescriptionForPhase(t, buildProgressPhase);
  }, [buildProgressPhase, t]);

  const buildProgressBadgeLabel = useMemo(() => {
    return buildProgressBadgeLabelForPhase(t, buildProgressPhase);
  }, [buildProgressPhase, t]);
  const buildProgressPercentValue = buildProgressPercent(buildProgressPhase);
  const buildProgressBarClassName = buildProgressToneClass(buildProgressPhase);
  const buildProgressBadgeClassName = buildProgressBadgeClass(buildProgressPhase);
  const buildPortalSyncAttempts = buildRunStatus?.portalSyncAttempts ?? null;
  const buildPortalSyncError = buildRunStatus?.portalSyncError ?? null;
  const formattedBuildPortalSyncError = useMemo(() => {
    if (!buildPortalSyncError) {
      return null;
    }

    return formatBuildPortalSyncError(t, buildPortalSyncError);
  }, [buildPortalSyncError, t]);
  const buildPortalSyncAlertMessage = useMemo(() => {
    if (!formattedBuildPortalSyncError) {
      return null;
    }

    if (!["publishing", "stalled", "failed"].includes(buildProgressPhase)) {
      return null;
    }

    if (buildProgressPhase === "failed") {
      return {
        tone: "failed" as const,
        message: t("dashboard:desktopReleases.admin.build.progress.portalSyncError", {
          error: formattedBuildPortalSyncError,
        }),
      };
    }

    return {
      tone: "retrying" as const,
      message: t("dashboard:desktopReleases.admin.build.progress.portalSyncRetrying", {
        error: formattedBuildPortalSyncError,
      }),
    };
  }, [buildProgressPhase, formattedBuildPortalSyncError, t]);

  useEffect(() => {
    if (isLoading) {
      setCatalogLoadStartedAt((value) => value ?? Date.now());
    } else {
      setCatalogLoadStartedAt(null);
    }
  }, [isLoading]);

  useEffect(() => {
    if (buildHistoryLoading) {
      setHistoryLoadStartedAt((value) => value ?? Date.now());
    } else {
      setHistoryLoadStartedAt(null);
    }
  }, [buildHistoryLoading]);

  useEffect(() => {
    if (!isLoading && !buildHistoryLoading) {
      return;
    }
    const timer = window.setInterval(() => {
      setLoadingTick((value) => value + 1);
    }, 1000);
    return () => {
      window.clearInterval(timer);
    };
  }, [isLoading, buildHistoryLoading]);

  const catalogLoadingAgeMs = catalogLoadStartedAt ? Math.max(0, Date.now() - catalogLoadStartedAt) : 0;
  const historyLoadingAgeMs = historyLoadStartedAt ? Math.max(0, Date.now() - historyLoadStartedAt) : 0;
  const catalogLoadingSeconds = catalogLoadingAgeMs ? Math.ceil(catalogLoadingAgeMs / 1000) : 0;
  const historyLoadingSeconds = historyLoadingAgeMs ? Math.ceil(historyLoadingAgeMs / 1000) : 0;
  const showLoadingDiagnostics = Boolean(
    isLoading
    || buildHistoryLoading
    || catalogErrorMessage
    || buildHistoryErrorMessage,
  );

  useEffect(() => {
    if (buildResult) {
      writeDesktopReleaseBuildSessionState({
        buildResult,
        buildRunStatus,
      });
      return;
    }

    writeDesktopReleaseBuildSessionState(null);
  }, [buildResult, buildRunStatus]);

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
      triggerCatalogRefresh(true);
      triggerBuildHistoryRefresh(true);
    }
  }, [
    buildRunStatus?.portalSyncStatus,
    buildRunStatus?.workflowRunConclusion,
    buildRunStatus?.workflowRunStatus,
    triggerBuildHistoryRefresh,
    triggerCatalogRefresh,
  ]);

  useEffect(() => {
    if (variant !== "admin" || !buildWorkflowRunId) {
      return;
    }

    triggerBuildHistoryRefresh();
  }, [
    buildWorkflowRunId,
    buildRunStatus?.portalSyncStatus,
    buildRunStatus?.workflowRunConclusion,
    buildRunStatus?.workflowRunStatus,
    buildRunStatus?.workflowRunUpdatedAt,
    triggerBuildHistoryRefresh,
    variant,
  ]);

  useEffect(() => {
    if (!currentBuildHistoryItem) {
      return;
    }

    const nextStatus = buildRunStatusFromHistoryItem(currentBuildHistoryItem);
    const currentStatusSignature = JSON.stringify(buildRunStatus ?? null);
    const nextStatusSignature = JSON.stringify(nextStatus);
    const currentTimestamp = Math.max(
      toTimestampMs(buildRunStatus?.workflowRunUpdatedAt),
      toTimestampMs(buildRunStatus?.portalSyncUpdatedAt),
      toTimestampMs(buildResult?.queuedAt),
    );
    const historyTimestamp = Math.max(
      toTimestampMs(currentBuildHistoryItem.workflowRunUpdatedAt),
      toTimestampMs(currentBuildHistoryItem.portalSyncUpdatedAt),
      toTimestampMs(currentBuildHistoryItem.recordUpdatedAt),
      toTimestampMs(currentBuildHistoryItem.queuedAt),
    );
    if (currentStatusSignature !== nextStatusSignature && historyTimestamp >= currentTimestamp) {
      setBuildRunStatus(nextStatus);
    }
  }, [buildResult?.queuedAt, buildRunStatus, currentBuildHistoryItem]);

  const handleUpload = async () => {
    if (!file) {
      return;
    }
    if (!version.trim()) {
      return;
    }

    setUploading(true);
    try {
      const normalizedFileName = file.name.trim() || "installer.bin";
      const contentType = file.type || "application/octet-stream";
      const fileSizeBytes = file.size;
      const fileSha256 = await hashFileSha256(file);

      const presignResponse = await fetch("/api/desktop-releases/upload-url", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          version: version.trim(),
          platform,
          channel,
          installerFormat,
          releaseNotes: releaseNotes.trim(),
          publish,
          fileName: normalizedFileName,
          contentType,
          fileSizeBytes,
        }),
      });
      const presignPayload = await presignResponse.json().catch(() => ({}));

      if (presignResponse.ok && typeof presignPayload?.uploadUrl === "string") {
        const uploadResponse = await fetch(presignPayload.uploadUrl, {
          method: "PUT",
          headers: {
            "Content-Type": contentType,
          },
          body: file,
        });

        if (!uploadResponse.ok) {
          throw new Error("desktop_release_upload_failed");
        }

        const finalizeResponse = await fetch("/api/desktop-releases/upload/complete", {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            version: version.trim(),
            platform,
            channel,
            installerFormat,
            releaseNotes: releaseNotes.trim(),
            publish,
            fileName: normalizedFileName,
            contentType,
            fileSizeBytes,
            fileSha256,
            storageKey: presignPayload.storageKey,
          }),
        });
        const finalizePayload = await finalizeResponse.json().catch(() => ({}));
        if (!finalizeResponse.ok) {
          throw new Error(
            typeof finalizePayload?.error === "string"
              ? finalizePayload.error
              : "desktop_release_upload_failed",
          );
        }

        setVersion("");
        setReleaseNotes("");
        setFile(null);
        setPublish(true);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
        triggerCatalogRefresh(true);
        toast.success(t("dashboard:desktopReleases.admin.uploadSuccess"));
        return;
      }

      if (presignPayload?.error && presignPayload.error !== "desktop_release_presign_unavailable") {
        throw new Error(
          typeof presignPayload.error === "string"
            ? presignPayload.error
            : "desktop_release_upload_failed",
        );
      }

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
      if (response.status === 413) {
        throw new Error("desktop_release_upload_too_large");
      }
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
      triggerCatalogRefresh(true);
      toast.success(t("dashboard:desktopReleases.admin.uploadSuccess"));
    } catch (uploadError) {
      const rawMessage = uploadError instanceof Error
        ? uploadError.message
        : "desktop_release_upload_failed";
      const friendlyMessage = formatUploadError(t, rawMessage);
      toast.error(friendlyMessage ?? t("dashboard:desktopReleases.admin.uploadFailed"));
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
      triggerCatalogRefresh(true);
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
    const confirmed = await confirm({
      title: t("dashboard:desktopReleases.admin.deleteConfirm", { version: release.version }),
      tone: "danger",
    });
    if (!confirmed) {
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
      triggerCatalogRefresh(true);
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

        {showLoadingDiagnostics ? (
          <div className="mt-4 rounded-2xl border border-slate-200 bg-white/95 p-4 text-sm text-slate-600">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                {t("dashboard:desktopReleases.loadingDetail.title")}
              </p>
              <Button
                size="sm"
                variant="outline"
                className="border-slate-200 bg-white text-slate-700"
                onClick={handleRefreshAll}
              >
                <RefreshCw className="mr-2 h-3.5 w-3.5" />
                {t("dashboard:desktopReleases.loadingDetail.refresh")}
              </Button>
            </div>
            <div className="mt-3 space-y-2">
              {isLoading ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-slate-500" />
                  <span>
                    {t("dashboard:desktopReleases.loadingDetail.catalog", {
                      seconds: catalogLoadingSeconds,
                    })}
                  </span>
                  <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600">
                    {t("dashboard:desktopReleases.loadingDetail.attempt", {
                      count: catalogAttempt,
                    })}
                  </Badge>
                  {catalogLoadingSeconds >= 15 ? (
                    <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">
                      {t("dashboard:desktopReleases.loadingDetail.timeout")}
                    </Badge>
                  ) : null}
                  {catalogLoadingSeconds >= 120 ? (
                    <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-700">
                      {t("dashboard:desktopReleases.loadingDetail.stalled")}
                    </Badge>
                  ) : null}
                </div>
              ) : null}
              {buildHistoryLoading ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-slate-500" />
                  <span>
                    {t("dashboard:desktopReleases.loadingDetail.history", {
                      seconds: historyLoadingSeconds,
                    })}
                  </span>
                  <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600">
                    {t("dashboard:desktopReleases.loadingDetail.attempt", {
                      count: buildHistoryAttempt,
                    })}
                  </Badge>
                  {historyLoadingSeconds >= 15 ? (
                    <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">
                      {t("dashboard:desktopReleases.loadingDetail.timeout")}
                    </Badge>
                  ) : null}
                  {historyLoadingSeconds >= 120 ? (
                    <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-700">
                      {t("dashboard:desktopReleases.loadingDetail.stalled")}
                    </Badge>
                  ) : null}
                </div>
              ) : null}
              {catalogErrorMessage ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  {t("dashboard:desktopReleases.loadingDetail.errorCatalog", { error: catalogErrorMessage })}
                </div>
              ) : null}
              {buildHistoryErrorMessage ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  {t("dashboard:desktopReleases.loadingDetail.errorHistory", { error: buildHistoryErrorMessage })}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {buildResult || buildRunStatus ? (
          <div className="mt-4 rounded-2xl border border-sky-100 bg-white/95 p-4 text-sm text-slate-700 shadow-sm">
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

            {buildProgressPhase === "publishing" ? (
              <div className="mt-3 rounded-2xl border border-cyan-100 bg-cyan-50 px-3 py-2 text-xs leading-5 text-cyan-800">
                {t("dashboard:desktopReleases.admin.build.progress.backgroundNote")}
              </div>
            ) : null}

            {buildProgressPhase === "stalled" ? (
              <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
                {t("dashboard:desktopReleases.admin.build.progress.stalledNote")}
              </div>
            ) : null}

            {buildPortalSyncAlertMessage ? (
              <div
                className={`mt-3 rounded-2xl px-3 py-2 text-xs leading-5 ${
                  buildPortalSyncAlertMessage.tone === "failed"
                    ? "border border-rose-200 bg-rose-50 text-rose-700"
                    : "border border-amber-200 bg-amber-50 text-amber-800"
                }`}
              >
                {buildPortalSyncAlertMessage.message}
              </div>
            ) : null}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {buildWorkflowRunId ? (
                <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-700">
                  {`Run #${buildWorkflowRunId}`}
                </Badge>
              ) : null}
              {buildPortalSyncAttempts != null && buildPortalSyncAttempts > 0 ? (
                <Badge variant="outline" className="border-cyan-200 bg-cyan-50 text-cyan-800">
                  {t("dashboard:desktopReleases.admin.build.progress.syncAttempt", {
                    count: buildPortalSyncAttempts,
                  })}
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
              <Button asChild size="sm" className="bg-sky-700 text-white hover:bg-sky-800">
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
        ) : null}

        {showCatalogLoading ? (
          <div className="mt-4 flex items-center gap-3 rounded-2xl border border-slate-200 bg-white/90 px-4 py-4 text-sm text-slate-600">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("dashboard:desktopReleases.loading")}
          </div>
        ) : catalogErrorMessage && !hasCatalog ? (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
            {catalogErrorMessage}
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
              <div className="mt-4 flex flex-wrap items-center gap-2">
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
                {showCatalogRefreshing ? (
                  <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600">
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                    {t("dashboard:desktopReleases.loading")}
                  </Badge>
                ) : null}
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

        <div className="mt-4 rounded-2xl border border-emerald-100 bg-white/95 p-4 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-emerald-100 bg-emerald-50 text-emerald-700">
                <Puzzle className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className={dashboardCardTitleClass}>
                    {t("dashboard:desktopReleases.chromeExtension.title")}
                  </p>
                  {marketplaceExtensionRelease ? (
                    <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                      {t("dashboard:desktopReleases.version", { version: marketplaceExtensionRelease.version })}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">
                      {marketplaceExtensionLoading
                        ? t("dashboard:desktopReleases.loading")
                        : t("dashboard:desktopReleases.noRelease")}
                    </Badge>
                  )}
                  <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600">
                    ZIP
                  </Badge>
                </div>
                <p className={`mt-1 ${dashboardCardDescriptionClass}`}>
                  {t("dashboard:desktopReleases.chromeExtension.description")}
                </p>
                {marketplaceExtensionRelease ? (
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    {marketplaceExtensionRelease.fileName} · {formatBytes(marketplaceExtensionRelease.fileSizeBytes)}
                  </p>
                ) : marketplaceExtensionError ? (
                  <p className="mt-1 text-xs leading-5 text-amber-700">
                    {marketplaceExtensionError}
                  </p>
                ) : null}
                <p className="mt-2 text-xs leading-5 text-slate-500">
                  {t("dashboard:desktopReleases.chromeExtension.installHint")}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {marketplaceExtensionRelease ? (
                <Button asChild className="bg-emerald-700 text-white hover:bg-emerald-800">
                  <a href={marketplaceExtensionRelease.downloadUrl || CHROME_EXTENSION_FALLBACK_DOWNLOAD_URL} download>
                    <Download className="mr-2 h-4 w-4" />
                    {t("dashboard:desktopReleases.chromeExtension.download")}
                  </a>
                </Button>
              ) : (
                <Button disabled className="bg-slate-200 text-slate-500 hover:bg-slate-200">
                  {marketplaceExtensionLoading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="mr-2 h-4 w-4" />
                  )}
                  {t("dashboard:desktopReleases.chromeExtension.download")}
                </Button>
              )}
              <Button asChild variant="outline" className="border-slate-200 bg-white text-slate-700">
                <a href="/marketplace-capture">
                  {t("dashboard:desktopReleases.chromeExtension.openCapture")}
                  <ChevronRight className="ml-2 h-4 w-4" />
                </a>
              </Button>
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-sky-100 bg-white/95 p-4 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-sky-100 bg-sky-50 text-sky-700">
                <Sparkles className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className={dashboardCardTitleClass}>
                    {t("dashboard:desktopReleases.workerApp.title")}
                  </p>
                  {workerAppRelease ? (
                    <Badge variant="outline" className="border-sky-200 bg-sky-50 text-sky-700">
                      {t("dashboard:desktopReleases.version", { version: workerAppRelease.version })}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">
                      {workerAppLoading
                        ? t("dashboard:desktopReleases.loading")
                        : t("dashboard:desktopReleases.noRelease")}
                    </Badge>
                  )}
                  <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600">
                    {workerAppRelease?.installerFormat
                      ? formatInstallerLabel(t, workerAppRelease.installerFormat)
                      : "EXE"}
                  </Badge>
                </div>
                <p className={`mt-1 ${dashboardCardDescriptionClass}`}>
                  {t("dashboard:desktopReleases.workerApp.description")}
                </p>
                {workerAppRelease ? (
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    {workerAppRelease.fileName} · {formatBytes(workerAppRelease.fileSizeBytes)}
                  </p>
                ) : workerAppError ? (
                  <p className="mt-1 text-xs leading-5 text-amber-700">
                    {workerAppError}
                  </p>
                ) : null}
                <p className="mt-2 text-xs leading-5 text-slate-500">
                  {t("dashboard:desktopReleases.workerApp.installHint")}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {workerAppRelease ? (
                <Button asChild className="bg-sky-700 text-white hover:bg-sky-800">
                  <a href={workerAppRelease.downloadUrl || WORKER_APP_FALLBACK_DOWNLOAD_URL} download>
                    <Download className="mr-2 h-4 w-4" />
                    {t("dashboard:desktopReleases.workerApp.download")}
                  </a>
                </Button>
              ) : (
                <Button disabled className="bg-slate-200 text-slate-500 hover:bg-slate-200">
                  {workerAppLoading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="mr-2 h-4 w-4" />
                  )}
                  {t("dashboard:desktopReleases.workerApp.download")}
                </Button>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-violet-100 bg-white/95 p-4 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-violet-100 bg-violet-50 text-violet-700">
                <Download className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className={dashboardCardTitleClass}>
                    {t("dashboard:desktopReleases.workerAppMacSource.title")}
                  </p>
                  {workerAppMacSourceRelease ? (
                    <Badge variant="outline" className="border-violet-200 bg-violet-50 text-violet-700">
                      {t("dashboard:desktopReleases.version", { version: workerAppMacSourceRelease.version })}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">
                      {workerAppMacSourceLoading
                        ? t("dashboard:desktopReleases.loading")
                        : t("dashboard:desktopReleases.noRelease")}
                    </Badge>
                  )}
                  <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600">
                    ZIP
                  </Badge>
                </div>
                <p className={`mt-1 ${dashboardCardDescriptionClass}`}>
                  {t("dashboard:desktopReleases.workerAppMacSource.description")}
                </p>
                {workerAppMacSourceRelease ? (
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    {workerAppMacSourceRelease.fileName} · {formatBytes(workerAppMacSourceRelease.fileSizeBytes)}
                  </p>
                ) : workerAppMacSourceError ? (
                  <p className="mt-1 text-xs leading-5 text-amber-700">
                    {workerAppMacSourceError}
                  </p>
                ) : null}
                <p className="mt-2 text-xs leading-5 text-slate-500">
                  {t("dashboard:desktopReleases.workerAppMacSource.installHint")}
                </p>
                <div className="mt-3 rounded-xl border border-violet-100 bg-violet-50/70 p-3 text-xs leading-5 text-slate-700">
                  <p className="font-semibold text-violet-900">
                    {t("dashboard:desktopReleases.workerAppMacSource.whatItIs")}
                  </p>
                  <p className="mt-2 font-semibold text-slate-800">
                    {t("dashboard:desktopReleases.workerAppMacSource.requirementsTitle")}
                  </p>
                  <p className="mt-1">{t("dashboard:desktopReleases.workerAppMacSource.requirements")}</p>
                  <p className="mt-2 font-semibold text-slate-800">
                    {t("dashboard:desktopReleases.workerAppMacSource.stepsTitle")}
                  </p>
                  <ol className="mt-1 list-decimal space-y-1 pl-5">
                    <li>{t("dashboard:desktopReleases.workerAppMacSource.step1")}</li>
                    <li>{t("dashboard:desktopReleases.workerAppMacSource.step2")}</li>
                    <li>{t("dashboard:desktopReleases.workerAppMacSource.step3")}</li>
                    <li>{t("dashboard:desktopReleases.workerAppMacSource.step4")}</li>
                    <li>{t("dashboard:desktopReleases.workerAppMacSource.step5")}</li>
                  </ol>
                  <p className="mt-2 font-semibold text-slate-800">
                    {t("dashboard:desktopReleases.workerAppMacSource.commandsTitle")}
                  </p>
                  <pre className="mt-1 overflow-x-auto rounded-lg bg-slate-950 p-3 font-mono text-[11px] leading-5 text-slate-100">
                    <code>{`cd smart-ai-hub-worker-app-macos-source-${workerAppMacSourceRelease?.version ?? "VERSION"}\nnpm install --legacy-peer-deps\nnpm run typecheck --workspace @smartspec/worker-app\nnpm run test --workspace @smartspec/worker-app`}</code>
                  </pre>
                  <p className="mt-2 font-medium text-amber-800">
                    {t("dashboard:desktopReleases.workerAppMacSource.nextBuild")}
                  </p>
                </div>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {workerAppMacSourceRelease ? (
                <Button asChild className="bg-violet-700 text-white hover:bg-violet-800">
                  <a href={workerAppMacSourceRelease.downloadUrl || WORKER_APP_MAC_SOURCE_FALLBACK_DOWNLOAD_URL} download>
                    <Download className="mr-2 h-4 w-4" />
                    {t("dashboard:desktopReleases.workerAppMacSource.download")}
                  </a>
                </Button>
              ) : (
                <Button disabled className="bg-slate-200 text-slate-500 hover:bg-slate-200">
                  {workerAppMacSourceLoading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="mr-2 h-4 w-4" />
                  )}
                  {t("dashboard:desktopReleases.workerAppMacSource.download")}
                </Button>
              )}
            </div>
          </div>
        </div>
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
              onClick={handleRefreshAll}
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

      {showLoadingDiagnostics ? (
        <div className="rounded-2xl border border-slate-200 bg-white/95 p-4 text-sm text-slate-600">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              {t("dashboard:desktopReleases.loadingDetail.title")}
            </p>
            <Button
              size="sm"
              variant="outline"
              className="border-slate-200 bg-white text-slate-700"
              onClick={handleRefreshAll}
            >
              <RefreshCw className="mr-2 h-3.5 w-3.5" />
              {t("dashboard:desktopReleases.loadingDetail.refresh")}
            </Button>
          </div>
          <div className="mt-3 space-y-2">
                {isLoading ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-slate-500" />
                    <span>
                      {t("dashboard:desktopReleases.loadingDetail.catalog", {
                        seconds: catalogLoadingSeconds,
                      })}
                    </span>
                    <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600">
                      {t("dashboard:desktopReleases.loadingDetail.attempt", {
                        count: catalogAttempt,
                      })}
                    </Badge>
                    {catalogLoadingSeconds >= 15 ? (
                      <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">
                        {t("dashboard:desktopReleases.loadingDetail.timeout")}
                      </Badge>
                    ) : null}
                    {catalogLoadingSeconds >= 120 ? (
                      <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-700">
                        {t("dashboard:desktopReleases.loadingDetail.stalled")}
                      </Badge>
                    ) : null}
                  </div>
                ) : null}
                {buildHistoryLoading ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-slate-500" />
                    <span>
                      {t("dashboard:desktopReleases.loadingDetail.history", {
                        seconds: historyLoadingSeconds,
                      })}
                    </span>
                    <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600">
                      {t("dashboard:desktopReleases.loadingDetail.attempt", {
                        count: buildHistoryAttempt,
                      })}
                    </Badge>
                    {historyLoadingSeconds >= 15 ? (
                      <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">
                        {t("dashboard:desktopReleases.loadingDetail.timeout")}
                      </Badge>
                    ) : null}
                    {historyLoadingSeconds >= 120 ? (
                      <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-700">
                        {t("dashboard:desktopReleases.loadingDetail.stalled")}
                      </Badge>
                    ) : null}
                  </div>
                ) : null}
            {catalogErrorMessage ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                {t("dashboard:desktopReleases.loadingDetail.errorCatalog", { error: catalogErrorMessage })}
              </div>
            ) : null}
            {buildHistoryErrorMessage ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                {t("dashboard:desktopReleases.loadingDetail.errorHistory", { error: buildHistoryErrorMessage })}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

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

                  {buildProgressPhase === "publishing" ? (
                    <div className="mt-3 rounded-2xl border border-cyan-100 bg-cyan-50 px-3 py-2 text-xs leading-5 text-cyan-800">
                      {t("dashboard:desktopReleases.admin.build.progress.backgroundNote")}
                    </div>
                  ) : null}

                  {buildProgressPhase === "stalled" ? (
                    <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
                      {t("dashboard:desktopReleases.admin.build.progress.stalledNote")}
                    </div>
                  ) : null}

                  {buildPortalSyncAlertMessage ? (
                    <div
                      className={`mt-3 rounded-2xl px-3 py-2 text-xs leading-5 ${
                        buildPortalSyncAlertMessage.tone === "failed"
                          ? "border border-rose-200 bg-rose-50 text-rose-700"
                          : "border border-amber-200 bg-amber-50 text-amber-800"
                      }`}
                    >
                      {buildPortalSyncAlertMessage.message}
                    </div>
                  ) : null}

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {buildWorkflowRunId ? (
                      <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-700">
                        {`Run #${buildWorkflowRunId}`}
                      </Badge>
                    ) : null}
                    {buildPortalSyncAttempts != null && buildPortalSyncAttempts > 0 ? (
                      <Badge variant="outline" className="border-cyan-200 bg-cyan-50 text-cyan-800">
                        {t("dashboard:desktopReleases.admin.build.progress.syncAttempt", {
                          count: buildPortalSyncAttempts,
                        })}
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

              {showBuildHistory ? (
                <Accordion type="single" collapsible defaultValue="">
                  <AccordionItem
                    value="build-history"
                    className="rounded-2xl border border-sky-100 bg-white/95 shadow-sm"
                  >
                    <AccordionTrigger className="px-4 py-4 hover:no-underline">
                      <div className="flex min-w-0 flex-1 flex-col gap-1 text-left">
                        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                          {t("dashboard:desktopReleases.admin.build.history.eyebrow")}
                        </p>
                        <p className="text-sm font-semibold text-slate-900">
                          {t("dashboard:desktopReleases.admin.build.history.title")}
                        </p>
                        <p className="text-xs leading-5 text-slate-500">
                          {t("dashboard:desktopReleases.admin.build.history.description")}
                        </p>
                      </div>
                      <div className="ml-4 flex items-center gap-2">
                        <Badge variant="outline" className="border-sky-200 bg-sky-50 text-sky-700">
                          {buildHistoryItems.length}
                        </Badge>
                        {buildHistoryErrorMessage ? (
                          <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-700">
                            {t("dashboard:desktopReleases.admin.build.history.errorBadge")}
                          </Badge>
                        ) : null}
                        {buildHistoryLoading ? (
                          <Badge variant="outline" className="border-sky-200 bg-sky-50 text-sky-700">
                            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                            {t("dashboard:desktopReleases.admin.build.history.loading")}
                          </Badge>
                        ) : null}
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-4 pb-4">
                      {buildHistoryErrorMessage ? (
                        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                          {t("dashboard:desktopReleases.admin.build.history.error", {
                            error: buildHistoryErrorMessage,
                          })}
                        </div>
                      ) : buildHistoryItems.length > 0 ? (
                        <div className="space-y-3">
                          {buildHistoryItems.map((item) => {
                            const itemPhase = resolveDesktopReleaseBuildProgressPhase({
                              buildSubmitting: false,
                              hasBuildResult: true,
                              hasWorkflowRunId: true,
                              workflowRunStatus: item.workflowRunStatus,
                              workflowRunConclusion: item.workflowRunConclusion,
                              portalSyncStatus: item.portalSyncStatus,
                              workflowRunUpdatedAt: item.workflowRunUpdatedAt,
                            });

                            return (
                              <div
                                key={item.workflowRunId}
                                className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 text-sm text-slate-700"
                              >
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <Badge variant="outline" className="border-slate-200 bg-white text-slate-700">
                                        {t("dashboard:desktopReleases.version", { version: item.version })}
                                      </Badge>
                                      <Badge variant="outline" className="border-slate-200 bg-white text-slate-700">
                                        {formatBuildPlatformLabel(t, item.platform)}
                                      </Badge>
                                      <Badge variant="outline" className="border-slate-200 bg-white text-slate-700">
                                        {formatBuildBundleModeLabel(t, item.bundleMode)}
                                      </Badge>
                                      <Badge variant="outline" className={buildProgressBadgeClass(itemPhase)}>
                                        {buildProgressBadgeLabelForPhase(t, itemPhase)}
                                      </Badge>
                                    </div>
                                    <p className="mt-2 text-sm font-semibold text-slate-900">
                                      {`Run #${item.workflowRunId}`}
                                    </p>
                                    <p className="mt-1 text-xs leading-5 text-slate-500">
                                      {item.repository} · {item.workflow} · {item.ref}
                                    </p>
                                  </div>

                                  <div className="flex flex-wrap items-center gap-2">
                                    <Badge variant="outline" className="border-cyan-200 bg-cyan-50 text-cyan-800">
                                      {t(`dashboard:desktopReleases.admin.build.history.portalSync.${item.portalSyncStatus}`)}
                                    </Badge>
                                    <Badge variant="outline" className="border-slate-200 bg-white text-slate-700">
                                      {t("dashboard:desktopReleases.admin.build.history.uploadedPlatforms", {
                                        count: item.uploadedPlatforms.length,
                                      })}
                                    </Badge>
                                  </div>
                                </div>

                                {item.releaseNotes ? (
                                  <p className="mt-3 line-clamp-2 rounded-2xl border border-slate-100 bg-white px-3 py-2 text-xs leading-5 text-slate-600">
                                    {item.releaseNotes}
                                  </p>
                                ) : null}

                                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                                  <div className="flex flex-wrap items-center gap-2">
                                    {item.portalSyncAttempts != null && item.portalSyncAttempts > 0 ? (
                                      <Badge variant="outline" className="border-cyan-200 bg-cyan-50 text-cyan-800">
                                        {t("dashboard:desktopReleases.admin.build.progress.syncAttempt", {
                                          count: item.portalSyncAttempts,
                                        })}
                                      </Badge>
                                    ) : null}
                                  </div>

                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-xs text-slate-500">
                                      {t("dashboard:desktopReleases.admin.build.history.updatedAt", {
                                        time: new Intl.DateTimeFormat(undefined, {
                                          dateStyle: "medium",
                                          timeStyle: "short",
                                        }).format(new Date(item.recordUpdatedAt)),
                                      })}
                                    </span>
                                    <Button asChild size="sm" variant="outline" className="border-slate-200 bg-white">
                                      <a href={item.workflowRunUrl ?? item.workflowUrl} target="_blank" rel="noreferrer">
                                        {t("dashboard:desktopReleases.admin.build.openActions")}
                                        <ChevronRight className="ml-2 h-4 w-4" />
                                      </a>
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-dashed border-slate-200 bg-white/90 px-4 py-6 text-sm text-slate-500">
                          {t("dashboard:desktopReleases.admin.build.history.empty")}
                        </div>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
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
          {showCatalogLoading ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
              <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
              {t("dashboard:desktopReleases.loading")}
            </div>
          ) : error && !hasCatalog ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
              {error}
            </div>
          ) : latestReleases.length > 0 ? (
            latestReleases.map((release) => (
              <div key={release.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className={`${dashboardCardTitleClass} break-words leading-snug`}>
                        {release.fileName}
                      </p>
                      {release.isPublished ? (
                        <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                          {t("dashboard:desktopReleases.admin.statePublished")}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
                          {t("dashboard:desktopReleases.admin.stateHidden")}
                        </Badge>
                      )}
                      {showCatalogRefreshing ? (
                        <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600">
                          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                          {t("dashboard:desktopReleases.loading")}
                        </Badge>
                      ) : null}
                    </div>
                    <ReleaseBadgeRow release={release} t={t} />
                    <p className={`mt-2 max-w-2xl ${dashboardCardDescriptionClass}`}>
                      {t("dashboard:desktopReleases.fileInfo", {
                        file: release.fileName,
                        size: formatBytes(release.fileSizeBytes),
                      })}
                    </p>
                    {release.releaseNotes ? (
                      <p className="mt-3 max-w-2xl whitespace-pre-line text-sm leading-6 text-slate-600">
                        {release.releaseNotes}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex w-full flex-wrap gap-2 xl:w-auto xl:shrink-0 xl:justify-end">
                    <Button asChild variant="outline" className="w-full border-slate-200 bg-white sm:w-auto">
                      <a href={release.downloadUrl}>
                        <Download className="mr-2 h-4 w-4" />
                        {t("dashboard:desktopReleases.download")}
                      </a>
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full border-slate-200 bg-white sm:w-auto"
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
                      className="w-full bg-red-600 text-white hover:bg-red-700 sm:w-auto"
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
