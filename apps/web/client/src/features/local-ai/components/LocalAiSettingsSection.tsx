import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Bot,
  Cpu,
  Download,
  HardDrive,
  ImageIcon,
  Loader2,
  Mic,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/contexts/AuthContext";
import { HelpButton } from "@/components/help/HelpButton";
import { useScopedTranslation } from "@/i18n/useScopedTranslation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { trpc } from "@/lib/trpc";
import { useRuntimePerformanceDiagnostics } from "@/hooks/useRuntimePerformanceDiagnostics";
import {
  formatPerformanceOperationLabel,
  formatRuntimeMetricMs,
} from "@/lib/runtimePerformanceLabels";
import { useRuntimePerformanceOverlayPreference } from "@/lib/runtimePerformanceOverlayPreference";
import { resolveLocalAiSyncedPreferences } from "../state/localAiSettingsStore";
import { useLocalAiCapability } from "../hooks/useLocalAiCapability";
import { useModelDownload } from "../hooks/useModelDownload";
import { disposeBrowserLocalRuntime } from "../adapters/browserLocalRuntime";
import {
  getExternalLocalTextBackendBrowserWarning,
  probeExternalLocalTextBackend,
  resolveExternalLocalTextBackendConfig,
  resolveExternalLocalTextBackendReason,
} from "../adapters/externalLocalTextBackend";
import { useTauriLocalSkillRuntimeStatus } from "../skills/useTauriLocalSkillRuntimeStatus";
import { getLocalVoiceRuntimeAvailability } from "../voice/localVoiceRuntime";
import { useLocalVoiceReadbackAvailability } from "../voice/useLocalVoiceReadbackAvailability";
import {
  clearLocalAiDeviceState,
  readLocalAiDeviceState,
  writeLocalAiDeviceState,
} from "../state/localAiDeviceStateStorage";
import {
  DEFAULT_LOCAL_AI_SYNCED_PREFERENCES,
  LOCAL_AI_EXECUTION_MODES,
  LOCAL_AI_HANDS_FREE_MODES,
  LOCAL_AI_VOICE_INPUT_MODES,
  LOCAL_AI_VOICE_READBACK_MODES,
  type LocalAiCatalogEntry,
  type LocalAiSyncedPreferences,
} from "../types/capability";
import type {
  LocalAiDeviceStateScope,
  LocalAiLocalEnginePreference,
} from "../types/deviceState";

type TranslationFn = (
  key: string,
  options?: Record<string, string | number>,
) => string;

interface LocalAiSettingsSectionProps {
  hideHeading?: boolean;
}

interface LocalAiSubsectionProps {
  title: string;
  description?: string;
  children: ReactNode;
}

function LocalAiSubsection({
  title,
  description,
  children,
}: LocalAiSubsectionProps) {
  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h4 className="text-sm font-semibold text-slate-900">{title}</h4>
        {description ? (
          <p className="text-sm leading-6 text-slate-500">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function getVoicePrivacyCopy(
  t: TranslationFn,
  voiceInputMode: LocalAiSyncedPreferences["voiceInputMode"],
): string {
  if (voiceInputMode === "legacy_stt") {
    return t("settings.localAi.voiceInput.privacy.legacy_stt");
  }
  if (voiceInputMode === "gemma4_local") {
    return t("settings.localAi.voiceInput.privacy.gemma4_local");
  }
  return t("settings.localAi.voiceInput.privacy.auto");
}

function formatVoiceReadbackRate(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

function getExecutionModeLabel(
  t: TranslationFn,
  mode: LocalAiSyncedPreferences["mode"],
): string {
  return t(`settings.localAi.executionMode.options.${mode}`);
}

function getVoiceInputModeLabel(
  t: TranslationFn,
  mode: LocalAiSyncedPreferences["voiceInputMode"],
): string {
  return t(`settings.localAi.voiceInput.options.${mode}`);
}

function getVoiceReadbackModeLabel(
  t: TranslationFn,
  mode: LocalAiSyncedPreferences["voiceReadbackMode"],
): string {
  return t(`settings.localAi.voiceReadback.options.${mode}`);
}

function getHandsFreeModeLabel(
  t: TranslationFn,
  mode: LocalAiSyncedPreferences["handsFreeMode"],
): string {
  return t(`settings.localAi.handsFree.options.${mode}`);
}

function getLocalEnginePreferenceLabel(
  t: TranslationFn,
  value: LocalAiLocalEnginePreference,
): string {
  return t(`settings.localAi.localEngine.options.${value}`);
}

function formatCapabilityReason(t: TranslationFn, reason: string): string {
  switch (reason) {
    case "secure_context_required":
      return t("settings.localAi.reason.secure_context_required");
    case "webgpu_unavailable":
      return t("settings.localAi.reason.webgpu_unavailable");
    case "webgpu_adapter_unavailable":
      return t("settings.localAi.reason.webgpu_adapter_unavailable");
    case "webgpu_device_unavailable":
      return t("settings.localAi.reason.webgpu_device_unavailable");
    case "no_eligible_browser_profiles":
      return t("settings.localAi.reason.no_eligible_browser_profiles");
    default:
      return reason;
  }
}

function formatDownloadReason(t: TranslationFn, reason: string): string {
  if (reason.startsWith("model_download_failed:")) {
    return t("settings.localAi.download.reason.model_download_failed_with_status", {
      status: reason.split(":")[1] ?? "unknown",
    });
  }
  switch (reason) {
    case "device_scope_unavailable":
      return t("settings.localAi.download.reason.device_scope_unavailable");
    case "downloads_disabled_for_device":
      return t(
        "settings.localAi.download.reason.downloads_disabled_for_device",
      );
    case "profile_not_allowed":
      return t("settings.localAi.download.reason.profile_not_allowed");
    case "profile_not_supported_on_this_surface":
      return t(
        "settings.localAi.download.reason.profile_not_supported_on_this_surface",
      );
    case "storage_budget_exceeded":
      return t("settings.localAi.download.reason.storage_budget_exceeded");
    case "model_download_cancelled":
      return t("settings.localAi.download.reason.model_download_cancelled");
    case "model_download_memory_exhausted":
      return t("settings.localAi.download.reason.model_download_memory_exhausted");
    case "model_download_failed":
      return t("settings.localAi.download.reason.model_download_failed");
    case "model_download_stream_unavailable":
      return t("settings.localAi.download.reason.model_download_stream_unavailable");
    case "model_checksum_mismatch":
      return t("settings.localAi.download.reason.model_checksum_mismatch");
    case "browser_cache_api_unavailable":
      return t("settings.localAi.download.reason.browser_cache_api_unavailable");
    case "browser_runtime_config_missing":
      return t("settings.localAi.download.reason.browser_runtime_config_missing");
    default:
      return t("settings.localAi.download.reason.generic");
  }
}

function formatExternalTextBackendReason(
  t: TranslationFn,
  reason: string,
): string {
  if (reason.startsWith("external_local_backend_http_")) {
    const [code, detail] = reason.split(":", 2);
    const status = code.replace("external_local_backend_http_", "");
    return detail?.trim()
      ? t("settings.localAi.externalBackend.reason.httpWithDetail", {
          status,
          detail,
        })
      : t("settings.localAi.externalBackend.reason.http", { status });
  }
  switch (reason) {
    case "missing_base_url":
      return t("settings.localAi.externalBackend.reason.missingBaseUrl");
    case "invalid_loopback_url":
      return t("settings.localAi.externalBackend.reason.invalidLoopbackUrl");
    case "external_local_backend_mixed_content":
      return t("settings.localAi.externalBackend.reason.mixedContent");
    case "missing_model":
      return t("settings.localAi.externalBackend.reason.missingModel");
    case "external_local_backend_empty_response":
      return t("settings.localAi.externalBackend.reason.emptyResponse");
    case "external_local_backend_private_network_blocked":
      return t("settings.localAi.externalBackend.reason.privateNetworkBlocked");
    case "external_local_backend_unreachable":
      return t("settings.localAi.externalBackend.reason.unreachable");
    case "external_local_backend_timeout":
      return t("settings.localAi.externalBackend.reason.timeout");
    case "external_local_backend_aborted":
      return t("settings.localAi.externalBackend.reason.aborted");
    default:
      return reason;
  }
}

function formatExternalTextBackendBrowserWarning(
  t: TranslationFn,
  warning: ReturnType<typeof getExternalLocalTextBackendBrowserWarning>,
): string | null {
  switch (warning) {
    case "secure_page_plain_http_private_network":
      return t("settings.localAi.externalBackend.browserWarning.securePagePrivateNetwork");
    default:
      return null;
  }
}

function formatModelActionLabel(
  t: TranslationFn,
  action: ReturnType<typeof useModelDownload>["action"],
): string {
  if (!action) {
    return t("settings.localAi.download.action.unknown");
  }
  return t(`settings.localAi.download.action.${action}`);
}

function formatModelActionTime(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatWebGpuAdapterSummary(
  t: TranslationFn,
  options: {
    available: boolean;
    label?: string | null;
    vendor?: string | null;
  },
): string {
  if (!options.available) {
    return t("settings.localAi.common.notDetected");
  }

  const label = options.label?.trim();
  if (label) {
    return label;
  }

  const vendor = options.vendor?.trim();
  if (vendor) {
    return vendor;
  }

  return t("settings.localAi.common.unknown");
}

function normalizeAdapterComparisonValue(value?: string | null): string {
  return (value ?? "").trim().toLowerCase();
}

function adapterLooksLikeNvidia(options: {
  label?: string | null;
  vendor?: string | null;
}): boolean {
  const label = normalizeAdapterComparisonValue(options.label);
  const vendor = normalizeAdapterComparisonValue(options.vendor);
  return (
    label.includes("nvidia") ||
    label.includes("geforce") ||
    vendor.includes("nvidia")
  );
}

function buildAdapterIdentity(options: {
  available: boolean;
  label?: string | null;
  vendor?: string | null;
}): string | null {
  if (!options.available) {
    return null;
  }

  const label = normalizeAdapterComparisonValue(options.label);
  const vendor = normalizeAdapterComparisonValue(options.vendor);
  const key = [label, vendor].filter(Boolean).join("|");
  return key.length > 0 ? key : null;
}

function formatRoundedMb(value?: number | null): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return `${Math.round(value).toLocaleString()} MB`;
}

function estimateBrowserRuntimeWorkingSetMb(sizeMb: number): number {
  return Math.round(sizeMb * 1.35 + 768);
}

function roundStorageBudgetMb(value: number): number {
  return Math.max(512, Math.ceil(value / 256) * 256);
}

function isChromiumWindowsBrowser(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }
  const userAgent = navigator.userAgent ?? "";
  const isWindows = /windows/i.test(userAgent);
  const isChromiumFamily = /(Chrome|Chromium|Edg)\//.test(userAgent);
  const isFirefox = /Firefox\//.test(userAgent);
  return isWindows && isChromiumFamily && !isFirefox;
}

export function LocalAiSettingsSection({
  hideHeading = false,
}: LocalAiSettingsSectionProps) {
  const { t } = useScopedTranslation("settings");
  const [activePanel, setActivePanel] = useState<
    "account" | "voice" | "device" | "backend" | "models"
  >("account");
  const { user, isAuthenticated } = useAuth();
  const runtimePlatform =
    typeof window !== "undefined" && (window as any).__TAURI__ != null
      ? "tauri"
      : "web";
  const [syncedPrefs, setSyncedPrefs] = useState<LocalAiSyncedPreferences>({
    ...DEFAULT_LOCAL_AI_SYNCED_PREFERENCES,
  });
  const [capabilityRefreshNonce, setCapabilityRefreshNonce] = useState(0);
  const scope = useMemo<LocalAiDeviceStateScope | null>(() => {
    if (!user) {
      return null;
    }
    return {
      tenantId: user.currentTenantId ?? null,
      userId: user.id,
      runtimeNamespace: runtimePlatform,
    };
  }, [runtimePlatform, user]);
  const [deviceState, setDeviceState] = useState(() =>
    scope
      ? readLocalAiDeviceState(scope)
      : readLocalAiDeviceState({
          tenantId: null,
          userId: null,
          runtimeNamespace: runtimePlatform,
        }),
  );
  const [externalBackendTestState, setExternalBackendTestState] = useState<{
    status: "idle" | "testing" | "success" | "error";
    message: string | null;
    checkedAt: string | null;
  }>({
    status: "idle",
    message: null,
    checkedAt: null,
  });
  const performanceDiagnostics = useRuntimePerformanceDiagnostics(
    activePanel === "device",
  );
  const [
    performanceOverlayEnabled,
    setPerformanceOverlayEnabled,
  ] = useRuntimePerformanceOverlayPreference();

  const prefsQuery = trpc.users.getPreferences.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const prefsLocalAi = (prefsQuery.data as { localAi?: unknown } | undefined)
    ?.localAi;
  const policyQuery = trpc.localAi.getPolicyAndCatalog.useQuery(
    { platform: runtimePlatform },
    {
      enabled: isAuthenticated,
    },
  );
  const updatePrefsMutation = trpc.users.updatePreferences.useMutation({
    onSuccess: () => {
      toast.success(t("settings.localAi.toast.preferencesSaved"));
      void prefsQuery.refetch();
    },
    onError: (error) => toast.error(error.message),
  });

  useEffect(() => {
    setSyncedPrefs(resolveLocalAiSyncedPreferences(prefsLocalAi));
  }, [prefsLocalAi]);

  useEffect(() => {
    if (!scope) {
      return;
    }
    setDeviceState(readLocalAiDeviceState(scope));
  }, [scope]);

  useEffect(() => {
    setExternalBackendTestState((current) =>
      current.status === "idle"
        ? current
        : {
            status: "idle",
            message: null,
            checkedAt: current.checkedAt,
          },
    );
  }, [deviceState.externalTextBackend]);

  const catalog = policyQuery.data?.catalog ?? [];
  const policy = policyQuery.data?.policy;
  const capability = useLocalAiCapability({
    catalog,
    refreshNonce: capabilityRefreshNonce,
  });
  const tauriRuntimeStatus = useTauriLocalSkillRuntimeStatus();
  const controlsDisabled = policy?.state !== "enabled";
  const deviceRuntimeReady =
    runtimePlatform === "tauri" ? true : capability.supported;
  const downloadControlsDisabled =
    controlsDisabled || (runtimePlatform === "web" && !deviceRuntimeReady);
  const modelDownload = useModelDownload({ scope, catalog });
  const resolvedExternalTextBackend = useMemo(
    () =>
      resolveExternalLocalTextBackendConfig(deviceState.externalTextBackend, {
        treatAsEnabled:
          deviceState.localEnginePreference === "localhost_backend",
      }),
    [deviceState.externalTextBackend, deviceState.localEnginePreference],
  );
  const externalTextBackendReason = useMemo(
    () =>
      resolveExternalLocalTextBackendReason(deviceState.externalTextBackend, {
        treatAsEnabled:
          deviceState.localEnginePreference === "localhost_backend",
      }),
    [deviceState.externalTextBackend, deviceState.localEnginePreference],
  );
  const externalTextBackendBrowserWarning = useMemo(
    () =>
      runtimePlatform === "web"
        ? getExternalLocalTextBackendBrowserWarning(
            deviceState.externalTextBackend.baseUrl,
          )
        : null,
    [deviceState.externalTextBackend.baseUrl, runtimePlatform],
  );

  const selectedCatalogEntry = useMemo<LocalAiCatalogEntry | null>(() => {
    if (!syncedPrefs.defaultModelId) {
      return null;
    }
    return (
      catalog.find((entry) => entry.id === syncedPrefs.defaultModelId) ?? null
    );
  }, [catalog, syncedPrefs.defaultModelId]);
  const selectableCatalog = useMemo(
    () => catalog.filter((entry) => entry.status === "allowed"),
    [catalog],
  );
  const localVoiceAvailability = useMemo(
    () =>
      getLocalVoiceRuntimeAvailability({
        platform: runtimePlatform,
        catalog,
        capability,
        deviceScope: scope,
        tauriRuntimeStatus,
      }),
    [capability, catalog, runtimePlatform, scope, tauriRuntimeStatus],
  );
  const activeCatalogEntry = selectedCatalogEntry ?? selectableCatalog[0] ?? null;
  const localVoiceReadbackAvailability = useLocalVoiceReadbackAvailability();
  const bundledGemmaProfileIds = tauriRuntimeStatus.bundledGemmaProfileIds ?? [];
  const anyModelActionInFlight = modelDownload.status === "downloading";
  const activeTauriProfileBundled =
    runtimePlatform === "tauri" &&
    !!activeCatalogEntry?.id &&
    bundledGemmaProfileIds.includes(activeCatalogEntry.id);
  const tauriBundleSummary = useMemo(() => {
    if (runtimePlatform !== "tauri") {
      return null;
    }
    if (tauriRuntimeStatus.bundleMode === "on-demand") {
      return t("settings.localAi.tauri.bundleSummary.onDemand");
    }
    if (tauriRuntimeStatus.bundleMode && bundledGemmaProfileIds.length > 0) {
      return t("settings.localAi.tauri.bundleSummary.withMode", {
        profiles: bundledGemmaProfileIds.join(", "),
        mode: tauriRuntimeStatus.bundleMode,
      });
    }
    if (bundledGemmaProfileIds.length > 0) {
      return t("settings.localAi.tauri.bundleSummary.withProfiles", {
        profiles: bundledGemmaProfileIds.join(", "),
      });
    }
    return t("settings.localAi.tauri.bundleSummary.none");
  }, [
    bundledGemmaProfileIds,
    runtimePlatform,
    t,
    tauriRuntimeStatus.bundleMode,
  ]);

  useEffect(() => {
    if (!scope || runtimePlatform !== "web") {
      return;
    }
    writeLocalAiDeviceState(scope, {
      lastCapabilityCheckAt: new Date().toISOString(),
      lastCapabilityReasons: capability.reasons,
    });
    setDeviceState(readLocalAiDeviceState(scope));
  }, [capability.reasons, runtimePlatform, scope]);

  useEffect(() => {
    if (!scope || runtimePlatform !== "tauri") {
      return;
    }
    writeLocalAiDeviceState(scope, {
      installedModelIds: tauriRuntimeStatus.installedGemmaProfileIds ?? [],
      lastCapabilityCheckAt: new Date().toISOString(),
      lastCapabilityReasons: tauriRuntimeStatus.reason
        ? [tauriRuntimeStatus.reason]
        : [],
    });
    setDeviceState(readLocalAiDeviceState(scope));
  }, [
    runtimePlatform,
    scope,
    tauriRuntimeStatus.installedGemmaProfileIds,
    tauriRuntimeStatus.reason,
  ]);

  const persistDeviceState = (
    patch: Parameters<typeof writeLocalAiDeviceState>[1],
  ) => {
    if (!scope) {
      return;
    }
    setDeviceState(writeLocalAiDeviceState(scope, patch));
  };

  const persistExternalTextBackendPatch = (
    patch: Partial<typeof deviceState.externalTextBackend>,
  ) => {
    persistDeviceState({
      externalTextBackend: {
        ...deviceState.externalTextBackend,
        ...patch,
      },
    });
  };

  const clearDeviceState = () => {
    if (!scope) {
      return;
    }
    clearLocalAiDeviceState(scope);
    setDeviceState(readLocalAiDeviceState(scope));
    toast.success(t("settings.localAi.toast.cacheCleared"));
  };

  const testExternalTextBackend = async () => {
    if (!resolvedExternalTextBackend) {
      const message = formatExternalTextBackendReason(
        t,
        externalTextBackendReason ?? "invalid_loopback_url",
      );
      setExternalBackendTestState({
        status: "error",
        message,
        checkedAt: new Date().toISOString(),
      });
      toast.error(message);
      return;
    }

    setExternalBackendTestState({
      status: "testing",
      message: null,
      checkedAt: new Date().toISOString(),
    });

    try {
      const response = await probeExternalLocalTextBackend({
        config: resolvedExternalTextBackend,
      });
      const message = t("settings.localAi.externalBackend.test.success", {
        model: response.model,
      });
      setExternalBackendTestState({
        status: "success",
        message,
        checkedAt: new Date().toISOString(),
      });
      toast.success(message);
    } catch (error) {
      const message = formatExternalTextBackendReason(
        t,
        error instanceof Error ? error.message : "external_local_backend_unreachable",
      );
      setExternalBackendTestState({
        status: "error",
        message,
        checkedAt: new Date().toISOString(),
      });
      toast.error(message);
    }
  };

  const surfaceCatalog = useMemo(
    () =>
      selectableCatalog.filter((entry) =>
        entry.supportedPlatforms.includes(runtimePlatform),
      ),
    [runtimePlatform, selectableCatalog],
  );

  const refreshDiagnostics = () => {
    setCapabilityRefreshNonce((current) => current + 1);
    if (runtimePlatform === "tauri") {
      void modelDownload.refreshRuntimeStatus();
    }
    toast.success(t("settings.localAi.toast.diagnosticsRefreshed"));
  };

  const formattedCapabilityReasons = capability.reasons.map((reason) =>
    formatCapabilityReason(t, reason),
  );
  const installedStorageMb = deviceState.installedModelIds.reduce(
    (sum, installedProfileId) => {
      const installedEntry =
        catalog.find((entry) => entry.id === installedProfileId) ?? null;
      return sum + (installedEntry?.approximateSizeMb ?? 0);
    },
    0,
  );
  const remainingStorageBudgetMb = Math.max(
    deviceState.storageBudgetMb - installedStorageMb,
    0,
  );
  const browserDeviceMemoryMb =
    typeof capability.browserDeviceMemoryGb === "number"
      ? Math.round(capability.browserDeviceMemoryGb * 1024)
      : null;
  const currentWebGpuAdapter = formatWebGpuAdapterSummary(t, {
    available: capability.webgpuAdapterAvailable,
    label: capability.webgpuAdapterLabel,
    vendor: capability.webgpuAdapterVendor,
  });
  const lowPowerWebGpuAdapter = formatWebGpuAdapterSummary(t, {
    available: capability.webgpuLowPowerAdapterAvailable ?? false,
    label: capability.webgpuLowPowerAdapterLabel,
    vendor: capability.webgpuLowPowerAdapterVendor,
  });
  const highPerformanceWebGpuAdapter = formatWebGpuAdapterSummary(t, {
    available: capability.webgpuHighPerformanceAdapterAvailable ?? false,
    label: capability.webgpuHighPerformanceAdapterLabel,
    vendor: capability.webgpuHighPerformanceAdapterVendor,
  });
  const webGpuAdapterMismatch =
    capability.webgpuAdapterAvailable &&
    (capability.webgpuHighPerformanceAdapterAvailable ?? false) &&
    (
      normalizeAdapterComparisonValue(capability.webgpuAdapterLabel) !==
        normalizeAdapterComparisonValue(
          capability.webgpuHighPerformanceAdapterLabel,
        ) ||
      normalizeAdapterComparisonValue(capability.webgpuAdapterVendor) !==
        normalizeAdapterComparisonValue(
          capability.webgpuHighPerformanceAdapterVendor,
        )
    );
  const browserVisibleGpuCandidates = [
    buildAdapterIdentity({
      available: capability.webgpuAdapterAvailable,
      label: capability.webgpuAdapterLabel,
      vendor: capability.webgpuAdapterVendor,
    }),
    buildAdapterIdentity({
      available: capability.webgpuLowPowerAdapterAvailable ?? false,
      label: capability.webgpuLowPowerAdapterLabel,
      vendor: capability.webgpuLowPowerAdapterVendor,
    }),
    buildAdapterIdentity({
      available: capability.webgpuHighPerformanceAdapterAvailable ?? false,
      label: capability.webgpuHighPerformanceAdapterLabel,
      vendor: capability.webgpuHighPerformanceAdapterVendor,
    }),
  ].filter((value, index, values): value is string => {
    return Boolean(value) && values.indexOf(value) === index;
  });
  const browserVisibleGpuCandidateCount = browserVisibleGpuCandidates.length;
  const browserExposesSingleGpuCandidate =
    browserVisibleGpuCandidateCount === 1 && capability.webgpuAdapterAvailable;
  const browserSingleGpuCandidateIsNvidia =
    browserExposesSingleGpuCandidate &&
    (adapterLooksLikeNvidia({
      label: capability.webgpuAdapterLabel,
      vendor: capability.webgpuAdapterVendor,
    }) ||
      adapterLooksLikeNvidia({
        label: capability.webgpuHighPerformanceAdapterLabel,
        vendor: capability.webgpuHighPerformanceAdapterVendor,
      }) ||
      adapterLooksLikeNvidia({
        label: capability.webgpuLowPowerAdapterLabel,
        vendor: capability.webgpuLowPowerAdapterVendor,
      }));
  const browserGpuSelectionStatus:
    | "nvidia_confirmed"
    | "single_unknown"
    | "same_adapter"
    | "mismatch" =
    browserExposesSingleGpuCandidate
      ? browserSingleGpuCandidateIsNvidia
        ? "nvidia_confirmed"
        : "single_unknown"
      : webGpuAdapterMismatch
        ? "mismatch"
        : "same_adapter";
  const runtimeUsesHighPerformanceAdapter =
    capability.webgpuHighPerformanceAdapterAvailable ?? false;
  const runtimeRequestedDeviceAvailable = runtimeUsesHighPerformanceAdapter
    ? (capability.webgpuHighPerformanceRequestedDeviceAvailable ?? false)
    : (capability.webgpuRequestedDeviceAvailable ?? false);
  const runtimeRequestedMaxBufferMb = runtimeUsesHighPerformanceAdapter
    ? (capability.webgpuHighPerformanceRequestedDeviceMaxBufferSizeMb ?? null)
    : (capability.webgpuRequestedDeviceMaxBufferSizeMb ?? null);
  const runtimeRequestedMaxStorageBufferBindingSizeMb =
    runtimeUsesHighPerformanceAdapter
      ? (capability.webgpuHighPerformanceRequestedDeviceMaxStorageBufferBindingSizeMb ??
          null)
      : (capability.webgpuRequestedDeviceMaxStorageBufferBindingSizeMb ?? null);
  const runtimeRequestedError = runtimeUsesHighPerformanceAdapter
    ? (capability.webgpuHighPerformanceRequestedDeviceError ?? null)
    : (capability.webgpuRequestedDeviceError ?? null);
  const browserStableRuntimeEnabled =
    runtimePlatform === "web" &&
    deviceState.preferStableBrowserRuntime !== false;
  const browserSubgroupsFeatureAvailable = runtimeUsesHighPerformanceAdapter
    ? (capability.webgpuHighPerformanceSubgroupsFeatureAvailable ??
        capability.webgpuSubgroupsFeatureAvailable ??
        false)
    : (capability.webgpuSubgroupsFeatureAvailable ??
        capability.webgpuHighPerformanceSubgroupsFeatureAvailable ??
        false);
  const browserPowerPreferenceWarningRelevant =
    runtimePlatform === "web" && isChromiumWindowsBrowser();
  const browserRuntimeWarnings = useMemo(() => {
    const warnings: Array<{
      tone: "amber" | "emerald";
      text: string;
    }> = [];
    if (browserPowerPreferenceWarningRelevant) {
      warnings.push({
        tone: "amber",
        text: t("settings.localAi.diagnostics.web.warning.powerPreferenceIgnored"),
      });
    }
    if (browserSubgroupsFeatureAvailable) {
      warnings.push({
        tone: browserStableRuntimeEnabled ? "emerald" : "amber",
        text: browserStableRuntimeEnabled
          ? t("settings.localAi.diagnostics.web.warning.subgroupsDisabled")
          : t("settings.localAi.diagnostics.web.warning.subgroupsEnabled"),
      });
    }
    return warnings;
  }, [
    browserPowerPreferenceWarningRelevant,
    browserStableRuntimeEnabled,
    browserSubgroupsFeatureAvailable,
    t,
  ]);
  const formattedDownloadReason = modelDownload.reason
    ? formatDownloadReason(t, modelDownload.reason)
    : null;
  const activeDownloadEntry = modelDownload.activeProfileId
    ? catalog.find((entry) => entry.id === modelDownload.activeProfileId) ?? null
    : null;
  const getLatestDownloadReason = () => {
    const latest = modelDownload.getSnapshot();
    return latest.reason ? formatDownloadReason(t, latest.reason) : null;
  };
  const latestActionLabel = formatModelActionLabel(t, modelDownload.action);
  const latestActionTime = formatModelActionTime(modelDownload.updatedAt);
  const recentRuntimeOperations = useMemo(
    () => performanceDiagnostics.localRuntime.operations.slice(0, 6),
    [performanceDiagnostics.localRuntime.operations],
  );
  const handleModelActionFailure = () => {
    toast.error(
      getLatestDownloadReason() ?? t("settings.localAi.download.reason.generic"),
    );
  };
  const updateStorageBudget = (nextBudgetMb: number) => {
    const normalized = roundStorageBudgetMb(nextBudgetMb);
    persistDeviceState({ storageBudgetMb: normalized });
    toast.success(
      t("settings.localAi.toast.storageBudgetUpdated", {
        value: normalized.toLocaleString(),
      }),
    );
  };
  const updateStableBrowserRuntime = (enabled: boolean) => {
    persistDeviceState({
      preferStableBrowserRuntime: enabled,
    });
    void disposeBrowserLocalRuntime().catch(() => undefined);
  };
  const localEnginePreferenceLabel = getLocalEnginePreferenceLabel(
    t,
    deviceState.localEnginePreference,
  );
  const localEngineSummary = useMemo(() => {
    if (deviceState.localEnginePreference === "localhost_backend") {
      if (resolvedExternalTextBackend) {
        return t("settings.localAi.localEngine.summary.localhostConfigured", {
          baseUrl: resolvedExternalTextBackend.baseUrl,
          model: resolvedExternalTextBackend.model,
        });
      }
      return t("settings.localAi.localEngine.summary.localhostNeedsConfig");
    }
    if (deviceState.localEnginePreference === "on_device") {
      return t("settings.localAi.localEngine.summary.onDevice");
    }
    if (resolvedExternalTextBackend) {
      return t("settings.localAi.localEngine.summary.autoWithBackend", {
        baseUrl: resolvedExternalTextBackend.baseUrl,
        model: resolvedExternalTextBackend.model,
      });
    }
    return t("settings.localAi.localEngine.summary.autoWithGemma");
  }, [
    deviceState.localEnginePreference,
    resolvedExternalTextBackend,
    t,
  ]);
  const getWebModelResourceSummary = (entry: LocalAiCatalogEntry) => {
    const installedOtherModelsMb = deviceState.installedModelIds
      .filter((installedProfileId) => installedProfileId !== entry.id)
      .reduce((sum, installedProfileId) => {
        const installedEntry =
          catalog.find((catalogEntry) => catalogEntry.id === installedProfileId) ??
          null;
        return sum + (installedEntry?.approximateSizeMb ?? 0);
      }, 0);
    const availableStorageForEntryMb = Math.max(
      deviceState.storageBudgetMb - installedOtherModelsMb,
      0,
    );
    const storageShortfallMb = Math.max(
      entry.approximateSizeMb - availableStorageForEntryMb,
      0,
    );
    const estimatedRuntimeWorkingSetMb =
      estimateBrowserRuntimeWorkingSetMb(entry.approximateSizeMb);
    const preferredGpuMaxBufferMb = runtimeRequestedMaxBufferMb;
    const preferredGpuMaxStorageBufferBindingMb =
      runtimeRequestedMaxStorageBufferBindingSizeMb;
    const preferredGpuEffectiveLimitMb =
      typeof preferredGpuMaxBufferMb === "number" &&
      typeof preferredGpuMaxStorageBufferBindingMb === "number"
        ? Math.min(
            preferredGpuMaxBufferMb,
            preferredGpuMaxStorageBufferBindingMb,
          )
        : preferredGpuMaxBufferMb ?? preferredGpuMaxStorageBufferBindingMb;

    let runtimeState: "ready" | "risk" | "blocked" | "unknown" = "unknown";
    if (!runtimeRequestedDeviceAvailable) {
      runtimeState = "blocked";
    } else if (
      typeof preferredGpuEffectiveLimitMb === "number" &&
      preferredGpuEffectiveLimitMb < entry.approximateSizeMb
    ) {
      runtimeState = "blocked";
    } else if (
      (typeof preferredGpuEffectiveLimitMb === "number" &&
        preferredGpuEffectiveLimitMb < estimatedRuntimeWorkingSetMb) ||
      (typeof browserDeviceMemoryMb === "number" &&
        browserDeviceMemoryMb < estimatedRuntimeWorkingSetMb)
    ) {
      runtimeState = "risk";
    } else if (
      runtimeRequestedDeviceAvailable &&
      (typeof preferredGpuEffectiveLimitMb === "number" ||
        typeof browserDeviceMemoryMb === "number")
    ) {
      runtimeState = "ready";
    }

    let blockerState:
      | "none"
      | "storage"
      | "runtime"
      | "storage_and_runtime"
      | "risk" = "none";
    if (storageShortfallMb > 0 && runtimeState === "blocked") {
      blockerState = "storage_and_runtime";
    } else if (storageShortfallMb > 0) {
      blockerState = "storage";
    } else if (runtimeState === "blocked") {
      blockerState = "runtime";
    } else if (runtimeState === "risk") {
      blockerState = "risk";
    }

    return {
      availableStorageForEntryMb,
      storageShortfallMb,
      estimatedRuntimeWorkingSetMb,
      preferredGpuMaxBufferMb,
      preferredGpuMaxStorageBufferBindingMb,
      preferredGpuEffectiveLimitMb,
      runtimeState,
      blockerState,
    };
  };
  const getWebModelRecommendation = (
    entry: LocalAiCatalogEntry,
    summary: ReturnType<typeof getWebModelResourceSummary>,
  ) => {
    const installedOtherEntries = deviceState.installedModelIds
      .filter((installedProfileId) => installedProfileId !== entry.id)
      .map(
        (installedProfileId) =>
          catalog.find((catalogEntry) => catalogEntry.id === installedProfileId) ??
          null,
      )
      .filter((catalogEntry): catalogEntry is LocalAiCatalogEntry =>
        Boolean(catalogEntry),
      )
      .sort((left, right) => right.approximateSizeMb - left.approximateSizeMb);

    const requiredStorageBudgetMb = roundStorageBudgetMb(
      installedOtherEntries.reduce(
        (sum, installedEntry) => sum + installedEntry.approximateSizeMb,
        0,
      ) + entry.approximateSizeMb,
    );

    return {
      requiredStorageBudgetMb,
      installedOtherEntries,
      storageShortfallMb: summary.storageShortfallMb,
    };
  };
  const activeWebModelSummary =
    runtimePlatform === "web" && activeCatalogEntry
      ? getWebModelResourceSummary(activeCatalogEntry)
      : null;
  const activeWebModelRecommendation =
    runtimePlatform === "web" && activeCatalogEntry && activeWebModelSummary
      ? getWebModelRecommendation(activeCatalogEntry, activeWebModelSummary)
      : null;
  const renderDownloadStatusCard = (
    profileId: string,
    options?: { compact?: boolean },
  ) => {
    if (
      modelDownload.activeProfileId !== profileId ||
      modelDownload.status === "idle"
    ) {
      return null;
    }

    const compact = options?.compact === true;
    const reason = modelDownload.reason
      ? formatDownloadReason(t, modelDownload.reason)
      : null;
    const toneClass =
      modelDownload.status === "success"
        ? "border-emerald-200 bg-emerald-50 text-emerald-800"
        : modelDownload.status === "error"
          ? "border-rose-200 bg-rose-50 text-rose-800"
          : modelDownload.status === "blocked" || modelDownload.status === "paused"
            ? "border-amber-200 bg-amber-50 text-amber-800"
            : "border-sky-200 bg-sky-50 text-sky-800";

    return (
      <div
        className={`rounded-xl border p-3 text-xs ${toneClass}`}
        data-testid={`local-ai-download-status-${profileId}`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="font-medium">
            {t("settings.localAi.download.currentAction", {
              action: latestActionLabel,
              profileId,
            })}
          </div>
          <Badge variant="outline">
            {t(`settings.localAi.download.status.${modelDownload.status}`)}
          </Badge>
        </div>
        {!compact || modelDownload.status === "downloading" ? (
          <div className="mt-2 text-[11px]">
            {modelDownload.downloadedBytes > 0
              ? modelDownload.totalBytes
                ? t("settings.localAi.download.downloadedBytesWithTotal", {
                    downloadedMb: Math.round(
                      modelDownload.downloadedBytes / (1024 * 1024),
                    ),
                    totalMb: Math.round(
                      modelDownload.totalBytes / (1024 * 1024),
                    ),
                  })
                : t("settings.localAi.download.downloadedBytes", {
                    downloadedMb: Math.round(
                      modelDownload.downloadedBytes / (1024 * 1024),
                    ),
                  })
              : t("settings.localAi.download.waitingForStream")}
          </div>
        ) : null}
        {(modelDownload.status === "downloading" ||
          modelDownload.status === "paused") &&
        modelDownload.progressPercent != null ? (
          <div className="mt-2">
            <div className="mb-1 flex items-center justify-between gap-2 text-[11px]">
              <span>{t("settings.localAi.download.progress")}</span>
              <span>{modelDownload.progressPercent}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/70">
              <div
                className="h-full bg-sky-500 transition-all"
                style={{
                  width: `${modelDownload.progressPercent}%`,
                }}
              />
            </div>
          </div>
        ) : null}
        {reason ? (
          <div className="mt-2 text-[11px]">
            {t("settings.localAi.download.reasonLabel", { reason })}
          </div>
        ) : null}
        {latestActionTime ? (
          <div className="mt-2 text-[11px] opacity-80">
            {t("settings.localAi.download.updatedAt", {
              value: latestActionTime,
            })}
          </div>
        ) : null}
      </div>
    );
  };
  const voiceReadbackDescription = localVoiceReadbackAvailability.supported
    ? localVoiceReadbackAvailability.backend
      ? t("settings.localAi.voiceReadback.availableWithBackend", {
          backend: localVoiceReadbackAvailability.backend,
        })
      : t("settings.localAi.voiceReadback.available")
    : t("settings.localAi.voiceReadback.unavailable");
  const panelOptions = [
    {
      id: "account" as const,
      label: t("settings.localAi.nav.account"),
    },
    {
      id: "voice" as const,
      label: t("settings.localAi.nav.voice"),
    },
    {
      id: "device" as const,
      label: t("settings.localAi.nav.device"),
    },
    {
      id: "backend" as const,
      label: t("settings.localAi.nav.backend"),
    },
    {
      id: "models" as const,
      label: t("settings.localAi.nav.models"),
    },
  ];

  return (
    <div
      className="rounded-2xl border border-slate-200 bg-slate-50/80 p-5 md:p-6"
      data-testid="local-ai-settings-section"
    >
      {!hideHeading ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="flex items-center gap-2 text-base font-semibold text-slate-900">
              <Cpu className="h-5 w-5 text-sky-600" />
              {t("settings.localAi.title")}
            </h3>
            <p className="mt-1 text-sm text-slate-600">
              {t("settings.localAi.description")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <HelpButton
              label={t("settings.localAi.helpButton")}
              page="/settings"
              size="sm"
              topic="local-ai"
              variant="outline"
            />
            {policyQuery.isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
            ) : null}
          </div>
        </div>
      ) : (
        <div className="flex justify-end">
          {policyQuery.isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
          ) : null}
        </div>
      )}

      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
        {policy?.state === "tenant_disabled" && (
          <p>{t("settings.localAi.policy.tenantDisabled")}</p>
        )}
        {policy?.state === "force_cloud_only" && (
          <p>{t("settings.localAi.policy.forceCloudOnly")}</p>
        )}
        {!policy && !policyQuery.isLoading && (
          <p>{t("settings.localAi.policy.unavailable")}</p>
        )}
        {policy?.state === "enabled" && (
          <p>
            {t("settings.localAi.policy.catalogReady", {
              count: selectableCatalog.length,
              surface:
                runtimePlatform === "tauri"
                  ? t("settings.localAi.platform.desktopRuntime")
                  : t("settings.localAi.platform.browserRuntime"),
            })}
          </p>
        )}
      </div>

      <div className="mt-5 space-y-5">
        <div className="flex flex-wrap gap-2">
          {panelOptions.map((panel) => (
            <Button
              className="rounded-full"
              key={panel.id}
              onClick={() => setActivePanel(panel.id)}
              size="sm"
              type="button"
              variant={activePanel === panel.id ? "default" : "outline"}
            >
              {panel.label}
            </Button>
          ))}
        </div>

        <div
          className={
            activePanel === "account" || activePanel === "voice"
              ? "space-y-6 rounded-xl border border-slate-200 bg-white p-5"
              : "hidden"
          }
        >
          <div className={activePanel === "account" ? "space-y-4" : "hidden"}>
          <LocalAiSubsection
            description={t("settings.localAi.section.account.description")}
            title={t("settings.localAi.section.account.title")}
          >
            <div className="space-y-4 rounded-xl border border-sky-200 bg-sky-50 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <div className="font-medium text-slate-900">
                    {t("settings.localAi.localEngine.title")}
                  </div>
                  <p className="text-sm text-slate-600">
                    {t("settings.localAi.localEngine.description")}
                  </p>
                </div>
                <Badge variant="outline">{localEnginePreferenceLabel}</Badge>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-700">
                  {t("settings.localAi.localEngine.label")}
                </label>
                <select
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                  disabled={controlsDisabled}
                  onChange={(event) =>
                    persistDeviceState({
                      localEnginePreference:
                        event.target.value as LocalAiLocalEnginePreference,
                      ...(event.target.value === "localhost_backend"
                        ? {
                            externalTextBackend: {
                              ...deviceState.externalTextBackend,
                              enabled: true,
                            },
                          }
                        : {}),
                    })
                  }
                  value={deviceState.localEnginePreference}
                >
                  {(["auto", "on_device", "localhost_backend"] as const).map(
                    (value) => (
                      <option key={value} value={value}>
                        {getLocalEnginePreferenceLabel(t, value)}
                      </option>
                    ),
                  )}
                </select>
                <p className="text-xs text-slate-500">{localEngineSummary}</p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1">
                    <div className="font-medium text-slate-900">
                      {t("settings.localAi.externalBackend.shortcut.title")}
                    </div>
                    <p className="text-sm text-slate-600">
                      {t("settings.localAi.externalBackend.shortcut.description")}
                    </p>
                    <div className="text-xs text-slate-500">
                      {resolvedExternalTextBackend
                        ? t("settings.localAi.externalBackend.shortcut.current", {
                            baseUrl: resolvedExternalTextBackend.baseUrl,
                            model: resolvedExternalTextBackend.model,
                          })
                        : deviceState.externalTextBackend.enabled
                          ? t("settings.localAi.externalBackend.shortcut.needsAttention")
                          : t(
                              "settings.localAi.externalBackend.shortcut.notConfigured",
                            )}
                    </div>
                  </div>
                  <Button
                    onClick={() => setActivePanel("backend")}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    {t("settings.localAi.externalBackend.shortcut.button")}
                  </Button>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="font-medium text-slate-900">
                  {t("settings.localAi.synced.title")}
                </div>
                <div className="text-sm text-slate-500">
                  {t("settings.localAi.synced.description")}
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <input
                  checked={syncedPrefs.enabled}
                  disabled={controlsDisabled}
                  onChange={(event) =>
                    setSyncedPrefs((current) => ({
                      ...current,
                      enabled: event.target.checked,
                    }))
                  }
                  type="checkbox"
                />
                {t("settings.localAi.common.enable")}
              </label>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700">
                {t("settings.localAi.executionMode.label")}
              </label>
              <select
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                disabled={controlsDisabled}
                onChange={(event) =>
                  setSyncedPrefs((current) => ({
                    ...current,
                    mode: event.target.value as LocalAiSyncedPreferences["mode"],
                  }))
                }
                value={syncedPrefs.mode}
              >
                {LOCAL_AI_EXECUTION_MODES.map((mode) => (
                  <option key={mode} value={mode}>
                    {getExecutionModeLabel(t, mode)}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700">
                {t("settings.localAi.defaultProfile.label")}
              </label>
              <select
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                disabled={controlsDisabled || selectableCatalog.length === 0}
                onChange={(event) =>
                  setSyncedPrefs((current) => ({
                    ...current,
                    defaultModelId: event.target.value || null,
                  }))
                }
                value={syncedPrefs.defaultModelId ?? ""}
              >
                <option value="">
                  {t("settings.localAi.defaultProfile.none")}
                </option>
                {selectableCatalog.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.id}
                  </option>
                ))}
              </select>
              {selectedCatalogEntry ? (
                <p className="text-xs text-slate-500">
                  {t("settings.localAi.defaultProfile.summary", {
                    family: selectedCatalogEntry.family,
                    variant: selectedCatalogEntry.variant,
                    sizeMb: selectedCatalogEntry.approximateSizeMb,
                  })}
                </p>
              ) : null}
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  checked={syncedPrefs.useForGeneralChat}
                  disabled={controlsDisabled}
                  onChange={(event) =>
                    setSyncedPrefs((current) => ({
                      ...current,
                      useForGeneralChat: event.target.checked,
                    }))
                  }
                  type="checkbox"
                />
                {t("settings.localAi.toggle.generalChat")}
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  checked={syncedPrefs.useForSummaries}
                  disabled={controlsDisabled}
                  onChange={(event) =>
                    setSyncedPrefs((current) => ({
                      ...current,
                      useForSummaries: event.target.checked,
                    }))
                  }
                  type="checkbox"
                />
                {t("settings.localAi.toggle.summaries")}
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700 md:col-span-2">
                <input
                  checked={syncedPrefs.useForImageTasks}
                  disabled={controlsDisabled}
                  onChange={(event) =>
                    setSyncedPrefs((current) => ({
                      ...current,
                      useForImageTasks: event.target.checked,
                    }))
                  }
                  type="checkbox"
                />
                <ImageIcon className="h-4 w-4 text-sky-600" />
                {t("settings.localAi.toggle.imageTasks")}
              </label>
            </div>
          </LocalAiSubsection>
          </div>

          <div className="hidden border-t border-slate-200" />

          <div className={activePanel === "voice" ? "space-y-4" : "hidden"}>
          <LocalAiSubsection
            description={t("settings.localAi.section.voice.description")}
            title={t("settings.localAi.section.voice.title")}
          >
            <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <Mic className="h-4 w-4 text-sky-600" />
              {t("settings.localAi.voiceInput.label")}
            </label>
            <select
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              onChange={(event) =>
                setSyncedPrefs((current) => ({
                  ...current,
                  voiceInputMode:
                    event.target.value as LocalAiSyncedPreferences["voiceInputMode"],
                }))
              }
              value={syncedPrefs.voiceInputMode}
            >
              {LOCAL_AI_VOICE_INPUT_MODES.map((mode) => (
                <option
                  disabled={mode === "gemma4_local" && !localVoiceAvailability.supported}
                  key={mode}
                  value={mode}
                >
                  {mode === "gemma4_local" && !localVoiceAvailability.supported
                    ? t("settings.localAi.voiceInput.optionUnavailable", {
                        label: getVoiceInputModeLabel(t, mode),
                      })
                    : getVoiceInputModeLabel(t, mode)}
                </option>
              ))}
            </select>
            <p className="text-xs text-slate-500">
              {getVoicePrivacyCopy(t, syncedPrefs.voiceInputMode)}
            </p>
            {syncedPrefs.voiceInputMode === "gemma4_local" && (
              <p
                className={
                  localVoiceAvailability.ready
                    ? "text-xs text-emerald-700"
                    : "text-xs text-amber-700"
                }
              >
                {runtimePlatform === "tauri"
                  ? localVoiceAvailability.ready
                    ? t("settings.localAi.voiceInput.desktopReady")
                    : t("settings.localAi.voiceInput.desktopNeedsModel")
                  : localVoiceAvailability.ready
                    ? t("settings.localAi.voiceInput.webReady")
                    : localVoiceAvailability.supported
                      ? t("settings.localAi.voiceInput.webNeedsModel")
                      : t("settings.localAi.voiceInput.webUnavailable")}
              </p>
            )}
            {runtimePlatform === "web" &&
            !localVoiceAvailability.supported &&
            formattedCapabilityReasons.length > 0 ? (
              <p className="text-xs text-slate-500">
                {t("settings.localAi.voiceInput.blockers", {
                  reasons: formattedCapabilityReasons.join(", "),
                })}
              </p>
            ) : null}
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                checked={syncedPrefs.enableVoiceCommands}
                onChange={(event) =>
                  setSyncedPrefs((current) => ({
                    ...current,
                    enableVoiceCommands: event.target.checked,
                  }))
                }
                type="checkbox"
              />
              {t("settings.localAi.voiceInput.enableCommands")}
            </label>
          </div>

            <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <Bot className="h-4 w-4 text-sky-600" />
              {t("settings.localAi.voiceReadback.label")}
            </label>
            <select
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              disabled={controlsDisabled}
              onChange={(event) =>
                setSyncedPrefs((current) => ({
                  ...current,
                  voiceReadbackMode:
                    event.target.value as LocalAiSyncedPreferences["voiceReadbackMode"],
                }))
              }
              value={syncedPrefs.voiceReadbackMode}
            >
              {LOCAL_AI_VOICE_READBACK_MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {getVoiceReadbackModeLabel(t, mode)}
                </option>
              ))}
            </select>
            <p className="text-xs text-slate-500">{voiceReadbackDescription}</p>
          </div>

            <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700">
                {t("settings.localAi.voiceReadback.languageLabel")}
              </label>
              <Input
                disabled={controlsDisabled}
                onChange={(event) =>
                  setSyncedPrefs((current) => ({
                    ...current,
                    voiceReadbackLanguage: event.target.value.trim() || null,
                  }))
                }
                placeholder={t("settings.localAi.voiceReadback.languagePlaceholder")}
                value={syncedPrefs.voiceReadbackLanguage ?? ""}
              />
              <p className="text-xs text-slate-500">
                {t("settings.localAi.voiceReadback.languageHelp")}
              </p>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700">
                {t("settings.localAi.voiceReadback.rateLabel")}
              </label>
              <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <input
                  className="w-full accent-sky-600"
                  disabled={controlsDisabled}
                  max={1.5}
                  min={0.5}
                  onChange={(event) =>
                    setSyncedPrefs((current) => ({
                      ...current,
                      voiceReadbackRate: Math.min(
                        1.5,
                        Math.max(
                          0.5,
                          Number.parseFloat(event.target.value || "1") || 1,
                        ),
                      ),
                    }))
                  }
                  step={0.05}
                  type="range"
                  value={syncedPrefs.voiceReadbackRate}
                />
                <div className="flex items-center justify-between text-[11px] text-slate-500">
                  <span>0.5x</span>
                  <span className="font-medium text-slate-700">
                    {formatVoiceReadbackRate(syncedPrefs.voiceReadbackRate)}
                  </span>
                  <span>1.5x</span>
                </div>
              </div>
            </div>
          </div>

            <div className="grid gap-3 md:grid-cols-2">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                checked={syncedPrefs.voiceReadbackOnlyForVoiceCommands}
                disabled={controlsDisabled}
                onChange={(event) =>
                  setSyncedPrefs((current) => ({
                    ...current,
                    voiceReadbackOnlyForVoiceCommands: event.target.checked,
                  }))
                }
                type="checkbox"
              />
              {t("settings.localAi.voiceReadback.onlyVoiceCommands")}
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                checked={syncedPrefs.voiceSearchUsesLocation}
                disabled={controlsDisabled}
                onChange={(event) =>
                  setSyncedPrefs((current) => ({
                    ...current,
                    voiceSearchUsesLocation: event.target.checked,
                  }))
                }
                type="checkbox"
              />
              {t("settings.localAi.voiceReadback.searchUsesLocation")}
            </label>
          </div>

            {runtimePlatform === "tauri" ? (
              <div className="grid gap-3 md:grid-cols-[1fr,1fr]">
              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-700">
                  {t("settings.localAi.handsFree.label")}
                </label>
                <select
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                  disabled={controlsDisabled}
                  onChange={(event) =>
                    setSyncedPrefs((current) => ({
                      ...current,
                      handsFreeMode:
                        event.target.value as LocalAiSyncedPreferences["handsFreeMode"],
                    }))
                  }
                  value={syncedPrefs.handsFreeMode}
                >
                  {LOCAL_AI_HANDS_FREE_MODES.map((mode) => (
                    <option key={mode} value={mode}>
                      {getHandsFreeModeLabel(t, mode)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-700">
                  {t("settings.localAi.handsFree.wakePhraseLabel")}
                </label>
                <Input
                  disabled={
                    controlsDisabled || syncedPrefs.handsFreeMode !== "wake_phrase"
                  }
                  onChange={(event) =>
                    setSyncedPrefs((current) => ({
                      ...current,
                      wakePhrase: event.target.value.trim() || null,
                    }))
                  }
                  placeholder={t("settings.localAi.handsFree.wakePhrasePlaceholder")}
                  value={syncedPrefs.wakePhrase ?? ""}
                />
              </div>
            </div>
            ) : null}

            {runtimePlatform === "tauri" &&
            syncedPrefs.handsFreeMode === "wake_phrase" ? (
              <p className="text-xs text-slate-500">
                {t("settings.localAi.handsFree.help")}
              </p>
            ) : null}
          </LocalAiSubsection>
          </div>

          <Button
            className="w-full"
            disabled={updatePrefsMutation.isPending}
            onClick={() =>
              updatePrefsMutation.mutate({
                localAi: syncedPrefs,
              })
            }
          >
            {updatePrefsMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Bot className="mr-2 h-4 w-4" />
            )}
            {t("settings.localAi.save")}
          </Button>
        </div>

        <div
          className={
            activePanel === "device" ||
            activePanel === "backend" ||
            activePanel === "models"
              ? "space-y-6 rounded-xl border border-slate-200 bg-white p-5"
              : "hidden"
          }
        >
          <div className={activePanel === "device" ? "space-y-6" : "hidden"}>
          <LocalAiSubsection
            description={t("settings.localAi.section.device.description")}
            title={t("settings.localAi.section.device.title")}
          >
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              checked={deviceState.allowDownloads}
              disabled={downloadControlsDisabled}
              onChange={(event) =>
                persistDeviceState({ allowDownloads: event.target.checked })
              }
              type="checkbox"
            />
            {t("settings.localAi.device.allowDownloads")}
          </label>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              checked={deviceState.wifiOnlyDownloads}
              disabled={downloadControlsDisabled}
              onChange={(event) =>
                persistDeviceState({ wifiOnlyDownloads: event.target.checked })
              }
              type="checkbox"
            />
            {t("settings.localAi.device.wifiOnlyDownloads")}
          </label>

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <HardDrive className="h-4 w-4 text-sky-600" />
              {t("settings.localAi.device.storageBudget")}
            </label>
            <Input
              disabled={downloadControlsDisabled}
              min={512}
              onChange={(event) =>
                persistDeviceState({
                  storageBudgetMb: Math.max(
                    512,
                    Number.parseInt(event.target.value || "0", 10) || 0,
                  ),
                })
              }
              step={256}
              type="number"
              value={deviceState.storageBudgetMb}
            />
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
            <div className="flex items-center gap-2 font-medium text-slate-800">
              <Download className="h-4 w-4" />
              {t("settings.localAi.device.cacheSummary")}
            </div>
            <div className="mt-2 space-y-1">
              <div>
                {t("settings.localAi.device.consentedModels", {
                  count: deviceState.consentedModelIds.length,
                })}
              </div>
              <div>
                {t("settings.localAi.device.installedModels", {
                  count: deviceState.installedModelIds.length,
                })}
              </div>
              <div>
                {t("settings.localAi.device.lastCapabilityCheck", {
                  value:
                    deviceState.lastCapabilityCheckAt ??
                    t("settings.localAi.common.notRecorded"),
                })}
              </div>
              {formattedDownloadReason ? (
                <div className="text-amber-700">
                  {t("settings.localAi.device.lastDownloadAction", {
                    action: latestActionLabel,
                    reason: formattedDownloadReason,
                  })}
                </div>
              ) : null}
            </div>
          </div>
          </LocalAiSubsection>

          <div className="border-t border-slate-200" />

          <LocalAiSubsection
            description={t("settings.localAi.section.runtime.description")}
            title={t("settings.localAi.section.runtime.title")}
          >

          {runtimePlatform === "web" ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <label className="flex items-start gap-3 text-sm text-slate-700">
                <input
                  checked={browserStableRuntimeEnabled}
                  disabled={controlsDisabled}
                  onChange={(event) =>
                    updateStableBrowserRuntime(event.target.checked)
                  }
                  type="checkbox"
                />
                <span className="space-y-1">
                  <span className="block font-medium text-slate-900">
                    {t("settings.localAi.runtime.stableBrowserRuntime")}
                  </span>
                  <span className="block text-xs text-slate-500">
                    {t("settings.localAi.runtime.stableBrowserRuntimeHelp")}
                  </span>
                </span>
              </label>
            </div>
          ) : null}

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
            <div className="flex items-center justify-between gap-3">
              <div className="font-medium text-slate-800">
                {t("settings.localAi.diagnostics.title")}
              </div>
              <Button
                onClick={refreshDiagnostics}
                size="sm"
                type="button"
                variant="outline"
              >
                <RefreshCw className="mr-2 h-3.5 w-3.5" />
                {t("settings.localAi.diagnostics.refresh")}
              </Button>
            </div>
            <div className="mt-2">
              {t("settings.localAi.diagnostics.externalBackend")}:{" "}
              {resolvedExternalTextBackend
                ? t("settings.localAi.externalBackend.status.ready")
                : deviceState.externalTextBackend.enabled
                  ? t("settings.localAi.externalBackend.status.needsAttention")
                  : t("settings.localAi.externalBackend.status.off")}
            </div>
              {resolvedExternalTextBackend ? (
                <div>
                  {t("settings.localAi.diagnostics.externalBackendTarget", {
                    baseUrl: resolvedExternalTextBackend.baseUrl,
                    model: resolvedExternalTextBackend.model,
                  })}
                </div>
              ) : null}
            {externalTextBackendBrowserWarning ? (
              <div className="text-amber-700">
                {formatExternalTextBackendBrowserWarning(
                  t,
                  externalTextBackendBrowserWarning,
                )}
              </div>
            ) : null}
            {externalTextBackendReason ? (
              <div className="text-amber-700">
                {t("settings.localAi.externalBackend.reasonLabel", {
                  reason: formatExternalTextBackendReason(
                    t,
                    externalTextBackendReason,
                  ),
                })}
              </div>
            ) : null}
            {runtimePlatform === "web" ? (
              <div className="mt-2 space-y-1">
                <div>
                  {t("settings.localAi.diagnostics.web.secureContext")}:{" "}
                  {capability.secureContext
                    ? t("settings.localAi.common.yes")
                    : t("settings.localAi.common.no")}
                </div>
                <div>
                  {t("settings.localAi.diagnostics.web.webgpuExposed")}:{" "}
                  {capability.webgpu
                    ? t("settings.localAi.common.yes")
                    : t("settings.localAi.common.no")}
                </div>
                <div>
                  {t("settings.localAi.diagnostics.web.adapter")}:{" "}
                  {capability.webgpuAdapterAvailable
                    ? t("settings.localAi.common.ready")
                    : t("settings.localAi.common.notReady")}
                </div>
                <div>
                  {t("settings.localAi.diagnostics.web.currentAdapter")}:{" "}
                  {currentWebGpuAdapter}
                </div>
                <div>
                  {t("settings.localAi.diagnostics.web.lowPowerAdapter")}:{" "}
                  {lowPowerWebGpuAdapter}
                </div>
                <div>
                  {t("settings.localAi.diagnostics.web.highPerformanceAdapter")}:{" "}
                  {highPerformanceWebGpuAdapter}
                </div>
                <div>
                  {t("settings.localAi.diagnostics.web.adapterCandidates", {
                    count: browserVisibleGpuCandidateCount,
                  })}
                </div>
                <div
                  className={
                    browserGpuSelectionStatus === "mismatch"
                      ? "text-amber-700"
                      : browserGpuSelectionStatus === "nvidia_confirmed"
                        ? "text-emerald-700"
                        : "text-slate-700"
                  }
                >
                  {t(
                    `settings.localAi.diagnostics.web.selectionStatus.${browserGpuSelectionStatus}`,
                  )}
                </div>
                <div>
                  {t("settings.localAi.diagnostics.web.device")}:{" "}
                  {capability.webgpuDeviceAvailable
                    ? t("settings.localAi.common.ready")
                    : t("settings.localAi.common.notReady")}
                </div>
                <div>
                  {t("settings.localAi.diagnostics.web.deviceMemory")}:{" "}
                  {browserDeviceMemoryMb
                    ? t("settings.localAi.diagnostics.web.deviceMemoryValue", {
                        value: formatRoundedMb(browserDeviceMemoryMb) ?? browserDeviceMemoryMb,
                      })
                    : t("settings.localAi.common.notRecorded")}
                </div>
                <div>
                  {t("settings.localAi.diagnostics.web.subgroupsFeature")}:{" "}
                  {browserSubgroupsFeatureAvailable
                    ? t("settings.localAi.common.available")
                    : t("settings.localAi.common.unavailable")}
                </div>
                <div>
                  {t("settings.localAi.diagnostics.web.stableRuntime")}:{" "}
                  {browserStableRuntimeEnabled
                    ? t("settings.localAi.common.yes")
                    : t("settings.localAi.common.no")}
                </div>
                <div>
                  {t(
                    "settings.localAi.diagnostics.web.runtimeRequestedMaxBufferSize",
                  )}
                  :{" "}
                  {formatRoundedMb(runtimeRequestedMaxBufferMb) ??
                    t("settings.localAi.common.notRecorded")}
                </div>
                <div>
                  {t(
                    "settings.localAi.diagnostics.web.runtimeRequestedMaxStorageBufferBindingSize",
                  )}
                  :{" "}
                  {formatRoundedMb(
                    runtimeRequestedMaxStorageBufferBindingSizeMb,
                  ) ?? t("settings.localAi.common.notRecorded")}
                </div>
                {runtimeRequestedError ? (
                  <div className="text-amber-700">
                    {t("settings.localAi.diagnostics.web.runtimeRequestedError", {
                      error: runtimeRequestedError,
                    })}
                  </div>
                ) : null}
                <div>
                  {t("settings.localAi.diagnostics.web.adapterMaxBufferSize")}:{" "}
                  {formatRoundedMb(capability.webgpuAdapterMaxBufferSizeMb) ??
                    t("settings.localAi.common.notRecorded")}
                </div>
                <div>
                  {t(
                    "settings.localAi.diagnostics.web.adapterMaxStorageBufferBindingSize",
                  )}
                  :{" "}
                  {formatRoundedMb(
                    capability.webgpuAdapterMaxStorageBufferBindingSizeMb,
                  ) ?? t("settings.localAi.common.notRecorded")}
                </div>
                <div>
                  {t("settings.localAi.diagnostics.web.deviceDefaultMaxBufferSize")}
                  :{" "}
                  {formatRoundedMb(capability.webgpuDeviceMaxBufferSizeMb) ??
                    t("settings.localAi.common.notRecorded")}
                </div>
                <div>
                  {t(
                    "settings.localAi.diagnostics.web.deviceDefaultMaxStorageBufferBindingSize",
                  )}
                  :{" "}
                  {formatRoundedMb(
                    capability.webgpuDeviceMaxStorageBufferBindingSizeMb,
                  ) ?? t("settings.localAi.common.notRecorded")}
                </div>
                <div>
                  {t("settings.localAi.diagnostics.web.eligibleTextProfiles", {
                    count: capability.eligibleProfiles.length,
                  })}
                </div>
                <div>
                  {t("settings.localAi.diagnostics.web.eligibleVoiceProfiles", {
                    count: capability.eligibleVoiceProfiles.length,
                  })}
                </div>
                <div>
                  {t("settings.localAi.diagnostics.web.readback")}:{" "}
                  {localVoiceReadbackAvailability.supported
                    ? t("settings.localAi.common.available")
                    : t("settings.localAi.common.unavailable")}
                </div>
                {webGpuAdapterMismatch ? (
                  <div className="text-amber-700">
                    {t("settings.localAi.diagnostics.web.adapterMismatch")}
                  </div>
                ) : null}
                {browserExposesSingleGpuCandidate ? (
                  <div
                    className={
                      browserSingleGpuCandidateIsNvidia
                        ? "text-sky-700"
                        : "text-amber-700"
                    }
                  >
                    {browserSingleGpuCandidateIsNvidia
                      ? t(
                          "settings.localAi.diagnostics.web.singleAdapterExposedNvidia",
                        )
                      : t("settings.localAi.diagnostics.web.singleAdapterExposed")}
                  </div>
                ) : null}
                <div className="text-slate-500">
                  {t("settings.localAi.diagnostics.web.defaultProbeNote")}
                </div>
                <div className="text-slate-500">
                  {t("settings.localAi.diagnostics.web.memoryDisclaimer")}
                </div>
                {browserRuntimeWarnings.length > 0 ? (
                  <div className="rounded-lg border border-slate-200 bg-white p-3">
                    <div className="font-medium text-slate-800">
                      {t("settings.localAi.diagnostics.web.warning.title")}
                    </div>
                    <div className="mt-2 space-y-1">
                      {browserRuntimeWarnings.map((warning, index) => (
                        <div
                          key={`${warning.text}-${index}`}
                          className={
                            warning.tone === "emerald"
                              ? "text-emerald-700"
                              : "text-amber-700"
                          }
                        >
                          {warning.text}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
                {formattedCapabilityReasons.length > 0 ? (
                  <div className="text-amber-700">
                    {t("settings.localAi.diagnostics.web.blockers", {
                      reasons: formattedCapabilityReasons.join(", "),
                    })}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="mt-2 space-y-1">
                <div>
                  {t("settings.localAi.diagnostics.tauri.runtimeAvailable")}:{" "}
                  {tauriRuntimeStatus.available
                    ? t("settings.localAi.common.yes")
                    : t("settings.localAi.common.no")}
                </div>
                <div>
                  {t("settings.localAi.diagnostics.tauri.gemmaText")}:{" "}
                  {tauriRuntimeStatus.supportsGemma4Text
                    ? t("settings.localAi.common.ready")
                    : t("settings.localAi.common.notReady")}
                </div>
                <div>
                  {t("settings.localAi.diagnostics.tauri.gemmaVoice")}:{" "}
                  {tauriRuntimeStatus.supportsGemma4Voice
                    ? t("settings.localAi.common.ready")
                    : t("settings.localAi.common.notReady")}
                </div>
                <div>
                  {t("settings.localAi.diagnostics.tauri.litertPath", {
                    value:
                      tauriRuntimeStatus.litertLmPath ??
                      t("settings.localAi.common.notDetected"),
                  })}
                </div>
                <div>
                  {t("settings.localAi.diagnostics.tauri.bundledProfiles", {
                    count:
                      (tauriRuntimeStatus.bundledGemmaProfileIds ?? []).length,
                  })}
                </div>
                <div>
                  {t("settings.localAi.diagnostics.tauri.installedProfiles", {
                    count:
                      (tauriRuntimeStatus.installedGemmaProfileIds ?? []).length,
                  })}
                </div>
                <div>
                  {t("settings.localAi.diagnostics.tauri.readback")}:{" "}
                  {localVoiceReadbackAvailability.supported
                    ? t("settings.localAi.common.available")
                    : t("settings.localAi.common.unavailable")}
                </div>
                {tauriRuntimeStatus.reason ? (
                  <div className="text-amber-700">
                    {t("settings.localAi.diagnostics.tauri.runtimeNote", {
                      note: tauriRuntimeStatus.reason,
                    })}
                  </div>
                ) : null}
              </div>
            )}

            <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
              <div className="font-medium text-slate-800">
                {t("settings.localAi.diagnostics.performance.title")}
              </div>
              <div className="mt-1 text-[11px] text-slate-500">
                {t("settings.localAi.diagnostics.performance.sessionNote")}
              </div>

              <div className="mt-3 flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="font-medium text-slate-800">
                    {t("settings.localAi.diagnostics.performance.overlayToggleLabel")}
                  </div>
                  <div className="mt-1 text-[11px] text-slate-500">
                    {t(
                      "settings.localAi.diagnostics.performance.overlayToggleDescription",
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <Badge variant="outline">
                    {runtimePlatform === "tauri"
                      ? performanceOverlayEnabled
                        ? t(
                            "settings.localAi.diagnostics.performance.overlayStatusOn",
                          )
                        : t(
                            "settings.localAi.diagnostics.performance.overlayStatusOff",
                          )
                      : t(
                          "settings.localAi.diagnostics.performance.overlayStatusDesktopOnly",
                        )}
                  </Badge>
                  <Switch
                    aria-label={t(
                      "settings.localAi.diagnostics.performance.overlayToggleLabel",
                    )}
                    checked={runtimePlatform === "tauri" && performanceOverlayEnabled}
                    disabled={runtimePlatform !== "tauri"}
                    onCheckedChange={setPerformanceOverlayEnabled}
                  />
                </div>
              </div>

              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="font-medium text-slate-800">
                    {t("settings.localAi.diagnostics.performance.rendererTitle")}
                  </div>
                  {performanceDiagnostics.renderer.sampleCount > 0 ? (
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <div>
                        {t("settings.localAi.diagnostics.performance.avgFps")}:{" "}
                        <span className="font-medium text-slate-900">
                          {performanceDiagnostics.renderer.averageFps?.toFixed(1) ??
                            t("settings.localAi.common.notRecorded")}
                        </span>
                      </div>
                      <div>
                        {t("settings.localAi.diagnostics.performance.avgFrame")}:{" "}
                        <span className="font-medium text-slate-900">
                          {formatRuntimeMetricMs(
                            performanceDiagnostics.renderer.averageFrameTimeMs,
                            t("settings.localAi.common.notRecorded"),
                          )}
                        </span>
                      </div>
                      <div>
                        {t("settings.localAi.diagnostics.performance.worstFrame")}:{" "}
                        <span className="font-medium text-slate-900">
                          {formatRuntimeMetricMs(
                            performanceDiagnostics.renderer.worstFrameTimeMs,
                            t("settings.localAi.common.notRecorded"),
                          )}
                        </span>
                      </div>
                      <div>
                        {t("settings.localAi.diagnostics.performance.slowFrames")}:{" "}
                        <span className="font-medium text-slate-900">
                          {performanceDiagnostics.renderer.slowFrameCount.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-2 text-[11px] text-slate-500">
                      {t("settings.localAi.diagnostics.performance.noRendererSamples")}
                    </div>
                  )}
                </div>

                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="font-medium text-slate-800">
                    {t("settings.localAi.diagnostics.performance.localRuntimeTitle")}
                  </div>
                  {recentRuntimeOperations.length > 0 ? (
                    <div className="mt-2 space-y-2">
                      {recentRuntimeOperations.map((operation) => (
                        <div
                          className="rounded-md border border-slate-200 bg-white p-2"
                          key={`${operation.operation}-${operation.updatedAt}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium text-slate-900">
                              {formatPerformanceOperationLabel(operation.operation)}
                            </span>
                            <Badge variant="outline">
                              {t("settings.localAi.diagnostics.performance.samples", {
                                count: operation.count,
                              })}
                            </Badge>
                          </div>
                          <div className="mt-1 grid gap-1 text-[11px] text-slate-600 sm:grid-cols-2">
                            <div>
                              {t("settings.localAi.diagnostics.performance.avgLatency")}:{" "}
                              <span className="font-medium text-slate-900">
                                {formatRuntimeMetricMs(
                                  operation.averageDurationMs,
                                  t("settings.localAi.common.notRecorded"),
                                )}
                              </span>
                            </div>
                            <div>
                              {t("settings.localAi.diagnostics.performance.p95Latency")}:{" "}
                              <span className="font-medium text-slate-900">
                                {formatRuntimeMetricMs(
                                  operation.p95DurationMs,
                                  t("settings.localAi.common.notRecorded"),
                                )}
                              </span>
                            </div>
                            <div>
                              {t("settings.localAi.diagnostics.performance.lastLatency")}:{" "}
                              <span className="font-medium text-slate-900">
                                {formatRuntimeMetricMs(
                                  operation.lastDurationMs,
                                  t("settings.localAi.common.notRecorded"),
                                )}
                              </span>
                            </div>
                            <div>
                              {t("settings.localAi.diagnostics.performance.errors")}:{" "}
                              <span className="font-medium text-slate-900">
                                {operation.errorCount.toLocaleString()}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-2 text-[11px] text-slate-500">
                      {runtimePlatform === "tauri"
                        ? t(
                            "settings.localAi.diagnostics.performance.noLocalRuntimeSamples",
                          )
                        : t(
                            "settings.localAi.diagnostics.performance.localRuntimeTauriOnly",
                          )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
          </LocalAiSubsection>
          </div>

          <div className={activePanel === "backend" ? "space-y-4" : "hidden"}>
          <LocalAiSubsection
            description={t("settings.localAi.section.backend.description")}
            title={t("settings.localAi.section.backend.title")}
          >
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
              <div className="font-medium text-slate-900">
                {t("settings.localAi.localEngine.summaryTitle")}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge variant="outline">{localEnginePreferenceLabel}</Badge>
                <span>{localEngineSummary}</span>
              </div>
            </div>

            <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-slate-700">
              <div className="font-medium text-slate-900">
                {t("settings.localAi.externalBackend.localOnlyTitle")}
              </div>
              <p className="mt-1 text-sm text-slate-600">
                {t("settings.localAi.externalBackend.localOnlyDescription")}
              </p>
              <p className="mt-2 text-xs text-slate-500">
                {t("settings.localAi.externalBackend.multimodalSupport")}
              </p>
            </div>

            <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="space-y-1">
                <div className="font-medium text-slate-900">
                  {t("settings.localAi.externalBackend.title")}
                </div>
                <p className="text-sm text-slate-500">
                  {t("settings.localAi.externalBackend.description")}
                </p>
              </div>

              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  checked={
                    deviceState.localEnginePreference === "localhost_backend"
                      ? true
                      : deviceState.externalTextBackend.enabled
                  }
                  disabled={
                    controlsDisabled ||
                    deviceState.localEnginePreference === "localhost_backend"
                  }
                  onChange={(event) =>
                    persistExternalTextBackendPatch({
                      enabled: event.target.checked,
                    })
                  }
                  type="checkbox"
                />
                {t("settings.localAi.externalBackend.enable")}
              </label>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700">
                    {t("settings.localAi.externalBackend.baseUrl")}
                  </label>
                  <Input
                    disabled={controlsDisabled}
                    onChange={(event) =>
                      persistExternalTextBackendPatch({
                        baseUrl: event.target.value,
                      })
                    }
                    placeholder={t("settings.localAi.externalBackend.baseUrlPlaceholder")}
                    value={deviceState.externalTextBackend.baseUrl}
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-slate-700">
                    {t("settings.localAi.externalBackend.model")}
                  </label>
                  <Input
                    disabled={controlsDisabled}
                    onChange={(event) =>
                      persistExternalTextBackendPatch({
                        model: event.target.value.trim() || null,
                      })
                    }
                    placeholder={t("settings.localAi.externalBackend.modelPlaceholder")}
                    value={deviceState.externalTextBackend.model ?? ""}
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-slate-700">
                    {t("settings.localAi.externalBackend.apiKey")}
                  </label>
                  <Input
                    disabled={controlsDisabled}
                    onChange={(event) =>
                      persistExternalTextBackendPatch({
                        apiKey: event.target.value.trim() || null,
                      })
                    }
                    placeholder={t("settings.localAi.externalBackend.apiKeyPlaceholder")}
                    type="password"
                    value={deviceState.externalTextBackend.apiKey ?? ""}
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-slate-700">
                    {t("settings.localAi.externalBackend.timeout")}
                  </label>
                  <Input
                    disabled={controlsDisabled}
                    min={5000}
                    onChange={(event) =>
                      persistExternalTextBackendPatch({
                        requestTimeoutMs: Math.max(
                          5000,
                          Number.parseInt(event.target.value || "0", 10) || 0,
                        ),
                      })
                    }
                    step={1000}
                    type="number"
                    value={deviceState.externalTextBackend.requestTimeoutMs}
                  />
                </div>
              </div>

              <p className="text-xs text-slate-500">
                {t("settings.localAi.externalBackend.loopbackOnly")}
              </p>
              {externalTextBackendBrowserWarning ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                  {formatExternalTextBackendBrowserWarning(
                    t,
                    externalTextBackendBrowserWarning,
                  )}
                </div>
              ) : null}
              <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600">
                <div className="font-medium text-slate-900">
                  {t("settings.localAi.externalBackend.endpointHintTitle")}
                </div>
                <p className="mt-1">
                  {t("settings.localAi.externalBackend.endpointHintDescription")}
                </p>
                <div className="mt-2 rounded-lg bg-slate-900/95 px-3 py-2 font-mono text-[11px] text-slate-100">
                  POST /v1/chat/completions
                </div>
              </div>
              <p className="text-xs text-slate-500">
                {t("settings.localAi.externalBackend.scopeNote")}
              </p>

              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant="outline"
                  className={
                    resolvedExternalTextBackend &&
                    !externalTextBackendBrowserWarning
                      ? "border-emerald-300 text-emerald-700"
                      : deviceState.externalTextBackend.enabled
                        ? "border-amber-300 text-amber-700"
                        : "border-slate-300 text-slate-600"
                  }
                >
                  {resolvedExternalTextBackend &&
                  !externalTextBackendBrowserWarning
                    ? t("settings.localAi.externalBackend.status.ready")
                    : deviceState.externalTextBackend.enabled
                      ? t("settings.localAi.externalBackend.status.needsAttention")
                      : t("settings.localAi.externalBackend.status.off")}
                </Badge>
                <Button
                  disabled={controlsDisabled || externalBackendTestState.status === "testing"}
                  onClick={() => {
                    void testExternalTextBackend();
                  }}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  {externalBackendTestState.status === "testing" ? (
                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-2 h-3.5 w-3.5" />
                  )}
                  {t("settings.localAi.externalBackend.test.button")}
                </Button>
              </div>

              {externalTextBackendReason ? (
                <p className="text-xs text-amber-700">
                  {t("settings.localAi.externalBackend.reasonLabel", {
                    reason: formatExternalTextBackendReason(
                      t,
                      externalTextBackendReason,
                    ),
                  })}
                </p>
              ) : null}
              {!externalTextBackendReason && externalTextBackendBrowserWarning ? (
                <p className="text-xs text-amber-700">
                  {formatExternalTextBackendBrowserWarning(
                    t,
                    externalTextBackendBrowserWarning,
                  )}
                </p>
              ) : null}
              {externalBackendTestState.message ? (
                <p
                  className={
                    externalBackendTestState.status === "success"
                      ? "text-xs text-emerald-700"
                      : externalBackendTestState.status === "error"
                        ? "text-xs text-rose-700"
                        : "text-xs text-slate-500"
                  }
                >
                  {externalBackendTestState.message}
                </p>
              ) : null}
            </div>
          </LocalAiSubsection>
          </div>

          <div className={activePanel === "models" ? "space-y-4" : "hidden"}>
          <LocalAiSubsection
            description={t("settings.localAi.section.models.description")}
            title={t("settings.localAi.section.models.title")}
          >

          {!deviceRuntimeReady && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              {t("settings.localAi.download.disabledUntilReady")}
            </div>
          )}

          {runtimePlatform === "tauri" && (
            <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-xs text-sky-800">
              {t("settings.localAi.tauri.runtimePath", {
                root:
                  tauriRuntimeStatus.managedModelRoot ??
                  tauriRuntimeStatus.runtimeRoot ??
                  t("settings.localAi.common.notReady"),
              })}
              {tauriBundleSummary ? ` ${tauriBundleSummary}` : ""}
              <div className="mt-2 flex flex-wrap gap-2">
                <Badge variant="secondary">
                  {t("settings.localAi.tauri.bundleModeBadge", {
                    mode:
                      tauriRuntimeStatus.bundleMode ??
                      t("settings.localAi.common.unknown"),
                  })}
                </Badge>
                {bundledGemmaProfileIds.length > 0 ? (
                  <Badge variant="outline">
                    {t("settings.localAi.tauri.installerIncludes", {
                      count: bundledGemmaProfileIds.length,
                    })}
                  </Badge>
                ) : (
                  <Badge variant="outline">
                    {t("settings.localAi.tauri.onDemandInstall")}
                  </Badge>
                )}
              </div>
            </div>
          )}

          <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-slate-700">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-1">
                <div className="font-medium text-slate-900">
                  {t("settings.localAi.models.backendAlternative.title")}
                </div>
                <p className="text-sm text-slate-600">
                  {t("settings.localAi.models.backendAlternative.description")}
                </p>
                <div className="text-xs text-slate-500">
                  {resolvedExternalTextBackend
                    ? t("settings.localAi.externalBackend.shortcut.current", {
                        baseUrl: resolvedExternalTextBackend.baseUrl,
                        model: resolvedExternalTextBackend.model,
                      })
                    : deviceState.externalTextBackend.enabled
                      ? t("settings.localAi.externalBackend.shortcut.needsAttention")
                      : t("settings.localAi.externalBackend.shortcut.notConfigured")}
                </div>
              </div>
              <Button
                onClick={() => setActivePanel("backend")}
                size="sm"
                type="button"
                variant="outline"
              >
                {t("settings.localAi.models.backendAlternative.button")}
              </Button>
            </div>
          </div>

          {runtimePlatform === "web" ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
              <div className="font-medium text-slate-900">
                {t("settings.localAi.models.summary.title")}
              </div>
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="font-medium text-slate-800">
                    {t("settings.localAi.models.summary.storageTitle")}
                  </div>
                  <div className="mt-1">
                    {t("settings.localAi.models.summary.storageBudget", {
                      total: formatRoundedMb(deviceState.storageBudgetMb) ??
                        `${deviceState.storageBudgetMb} MB`,
                    })}
                  </div>
                  <div>
                    {t("settings.localAi.models.summary.storageUsed", {
                      used: formatRoundedMb(installedStorageMb) ??
                        `${installedStorageMb} MB`,
                    })}
                  </div>
                  <div>
                    {t("settings.localAi.models.summary.storageRemaining", {
                      remaining:
                        formatRoundedMb(remainingStorageBudgetMb) ??
                        `${remainingStorageBudgetMb} MB`,
                    })}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="font-medium text-slate-800">
                    {t("settings.localAi.models.summary.runtimeTitle")}
                  </div>
                  <div className="mt-1">
                    {t("settings.localAi.diagnostics.web.currentAdapter")}:{" "}
                    {currentWebGpuAdapter}
                  </div>
                  <div>
                    {t("settings.localAi.diagnostics.web.lowPowerAdapter")}:{" "}
                    {lowPowerWebGpuAdapter}
                  </div>
                  <div>
                    {t("settings.localAi.diagnostics.web.highPerformanceAdapter")}:{" "}
                    {highPerformanceWebGpuAdapter}
                  </div>
                  <div>
                    {t("settings.localAi.diagnostics.web.adapterCandidates", {
                      count: browserVisibleGpuCandidateCount,
                    })}
                  </div>
                  <div
                    className={
                      browserGpuSelectionStatus === "mismatch"
                        ? "text-amber-700"
                        : browserGpuSelectionStatus === "nvidia_confirmed"
                          ? "text-emerald-700"
                          : "text-slate-700"
                    }
                  >
                    {t(
                      `settings.localAi.diagnostics.web.selectionStatus.${browserGpuSelectionStatus}`,
                    )}
                  </div>
                  <div>
                    {t(
                      "settings.localAi.diagnostics.web.runtimeRequestedMaxBufferSize",
                    )}
                    :{" "}
                    {formatRoundedMb(runtimeRequestedMaxBufferMb) ??
                      t("settings.localAi.common.notRecorded")}
                  </div>
                  <div>
                    {t(
                      "settings.localAi.diagnostics.web.runtimeRequestedMaxStorageBufferBindingSize",
                    )}
                    :{" "}
                    {formatRoundedMb(
                      runtimeRequestedMaxStorageBufferBindingSizeMb,
                    ) ?? t("settings.localAi.common.notRecorded")}
                  </div>
                  <div>
                    {t("settings.localAi.diagnostics.web.adapterMaxBufferSize")}:
                    {" "}
                    {formatRoundedMb(capability.webgpuAdapterMaxBufferSizeMb) ??
                      t("settings.localAi.common.notRecorded")}
                  </div>
                  <div>
                    {t(
                      "settings.localAi.diagnostics.web.adapterMaxStorageBufferBindingSize",
                    )}
                    :{" "}
                    {formatRoundedMb(
                      capability.webgpuAdapterMaxStorageBufferBindingSizeMb,
                    ) ?? t("settings.localAi.common.notRecorded")}
                  </div>
                  <div>
                    {t("settings.localAi.diagnostics.web.deviceDefaultMaxBufferSize")}
                    :{" "}
                    {formatRoundedMb(capability.webgpuDeviceMaxBufferSizeMb) ??
                      t("settings.localAi.common.notRecorded")}
                  </div>
                  <div>
                    {t(
                      "settings.localAi.diagnostics.web.deviceDefaultMaxStorageBufferBindingSize",
                    )}
                    :{" "}
                    {formatRoundedMb(
                      capability.webgpuDeviceMaxStorageBufferBindingSizeMb,
                    ) ?? t("settings.localAi.common.notRecorded")}
                  </div>
                  <div>
                    {t("settings.localAi.diagnostics.web.deviceMemory")}:{" "}
                    {browserDeviceMemoryMb
                      ? t("settings.localAi.diagnostics.web.deviceMemoryValue", {
                          value:
                            formatRoundedMb(browserDeviceMemoryMb) ??
                            `${browserDeviceMemoryMb} MB`,
                        })
                      : t("settings.localAi.common.notRecorded")}
                  </div>
                </div>
              </div>
              {browserExposesSingleGpuCandidate ? (
                <div
                  className={`mt-2 text-[11px] ${
                    browserSingleGpuCandidateIsNvidia
                      ? "text-sky-700"
                      : "text-amber-700"
                  }`}
                >
                  {browserSingleGpuCandidateIsNvidia
                    ? t(
                        "settings.localAi.diagnostics.web.singleAdapterExposedNvidia",
                      )
                    : t("settings.localAi.diagnostics.web.singleAdapterExposed")}
                </div>
              ) : null}
              <div className="mt-2 text-[11px] text-slate-500">
                {t("settings.localAi.diagnostics.web.defaultProbeNote")}
              </div>
              <div className="mt-2 text-[11px] text-slate-500">
                {t("settings.localAi.diagnostics.web.memoryDisclaimer")}
              </div>
            </div>
          ) : null}

          {activeDownloadEntry
            ? renderDownloadStatusCard(activeDownloadEntry.id)
            : null}

          {modelDownload.status !== "idle" ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-medium text-slate-900">
                  {t("settings.localAi.download.statusLabel", {
                    status: t(`settings.localAi.download.status.${modelDownload.status}`),
                  })}
                </div>
                {modelDownload.activeProfileId ? (
                  <Badge variant="outline">
                    {t("settings.localAi.download.currentAction", {
                      action: latestActionLabel,
                      profileId: modelDownload.activeProfileId,
                    })}
                  </Badge>
                ) : null}
              </div>
              <div className="mt-2 text-slate-600">
                {modelDownload.status === "success"
                  ? t("settings.localAi.download.summary.success")
                  : modelDownload.status === "error"
                    ? t("settings.localAi.download.summary.error")
                    : modelDownload.status === "paused"
                      ? t("settings.localAi.download.summary.paused")
                      : modelDownload.status === "blocked"
                        ? t("settings.localAi.download.summary.blocked")
                        : t("settings.localAi.download.summary.downloading")}
              </div>
              {latestActionTime ? (
                <div className="mt-1 text-slate-500">
                  {t("settings.localAi.download.updatedAt", {
                    value: latestActionTime,
                  })}
                </div>
              ) : null}
            </div>
          ) : null}

          {runtimePlatform === "web" && activeCatalogEntry ? (
            <div className="space-y-3">
              {activeWebModelSummary &&
              activeWebModelRecommendation &&
              activeWebModelSummary.blockerState !== "none" ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                  <div className="font-medium">
                    {t("settings.localAi.models.quickFix.title", {
                      profileId: activeCatalogEntry.id,
                    })}
                  </div>
                  {activeWebModelSummary.blockerState === "storage" ||
                  activeWebModelSummary.blockerState ===
                    "storage_and_runtime" ? (
                    <div className="mt-2 space-y-2">
                      <div>
                        {t("settings.localAi.models.quickFix.storageRaise", {
                          total:
                            formatRoundedMb(
                              activeWebModelRecommendation.requiredStorageBudgetMb,
                            ) ??
                            `${activeWebModelRecommendation.requiredStorageBudgetMb} MB`,
                          extra:
                            formatRoundedMb(
                              activeWebModelRecommendation.storageShortfallMb,
                            ) ??
                            `${activeWebModelRecommendation.storageShortfallMb} MB`,
                        })}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          onClick={() =>
                            updateStorageBudget(
                              activeWebModelRecommendation.requiredStorageBudgetMb,
                            )
                          }
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          {t("settings.localAi.models.quickFix.storageRaiseButton", {
                            total:
                              formatRoundedMb(
                                activeWebModelRecommendation.requiredStorageBudgetMb,
                              ) ??
                              `${activeWebModelRecommendation.requiredStorageBudgetMb} MB`,
                          })}
                        </Button>
                      </div>
                      {activeWebModelRecommendation.installedOtherEntries.length >
                      0 ? (
                        <div className="text-[11px]">
                          {t("settings.localAi.models.quickFix.removeModelsHint", {
                            models:
                              activeWebModelRecommendation.installedOtherEntries
                                .map((entry) => entry.id)
                                .join(", "),
                          })}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  {activeWebModelSummary.blockerState === "runtime" ||
                  activeWebModelSummary.blockerState ===
                    "storage_and_runtime" ||
                  activeWebModelSummary.blockerState === "risk" ? (
                      <div className="mt-2 space-y-1">
                      <div>
                        {browserExposesSingleGpuCandidate
                          ? browserSingleGpuCandidateIsNvidia
                            ? t(
                                "settings.localAi.models.quickFix.runtimeSingleAdapterNvidia",
                              )
                            : t(
                                "settings.localAi.models.quickFix.runtimeSingleAdapter",
                              )
                          : webGpuAdapterMismatch
                            ? t(
                                "settings.localAi.models.quickFix.runtimeAdapterMismatch",
                              )
                            : t(
                                "settings.localAi.models.quickFix.runtimeBrowserLimit",
                              )}
                      </div>
                      <div className="text-[11px]">
                        {t("settings.localAi.models.quickFix.runtimeDesktopHint")}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
              <div className="grid gap-2 sm:grid-cols-2">
                <Button
                  disabled={
                    downloadControlsDisabled ||
                    modelDownload.status === "downloading" ||
                    modelDownload.isModelInstalled(activeCatalogEntry.id) ||
                    (activeWebModelSummary?.storageShortfallMb ?? 0) > 0
                  }
                  onClick={async () => {
                    if (!scope) {
                      return;
                    }
                    const downloaded = await modelDownload.startDownload(
                      activeCatalogEntry,
                    );
                    if (downloaded) {
                      setDeviceState(readLocalAiDeviceState(scope));
                      toast.success(
                        t("settings.localAi.toast.browserModelCached", {
                          profileId: activeCatalogEntry.id,
                        }),
                      );
                    } else {
                      handleModelActionFailure();
                    }
                  }}
                  type="button"
                >
                  {modelDownload.status === "downloading" &&
                  modelDownload.activeProfileId === activeCatalogEntry.id ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="mr-2 h-4 w-4" />
                  )}
                  {modelDownload.isModelInstalled(activeCatalogEntry.id)
                    ? t("settings.localAi.download.modelCached")
                    : t("settings.localAi.download.cacheSelectedModel")}
                </Button>
                <Button
                  disabled={
                    modelDownload.status === "downloading" ||
                    !modelDownload.isModelInstalled(activeCatalogEntry.id)
                  }
                  onClick={async () => {
                    if (!scope) {
                      return;
                    }
                    const removed = await modelDownload.removeDownloadedModel(
                      activeCatalogEntry,
                    );
                    if (removed) {
                      setDeviceState(readLocalAiDeviceState(scope));
                      toast.success(
                        t("settings.localAi.toast.browserModelRemoved", {
                          profileId: activeCatalogEntry.id,
                        }),
                      );
                    } else {
                      handleModelActionFailure();
                    }
                  }}
                  type="button"
                  variant="outline"
                >
                  {t("settings.localAi.download.removeSelectedModel")}
                </Button>
              </div>

              {modelDownload.activeProfileId === activeCatalogEntry.id &&
              !modelDownload.isModelInstalled(activeCatalogEntry.id) ? (
            <div className="grid gap-2 md:grid-cols-3">
              <Button
                className="h-auto whitespace-normal"
                disabled={modelDownload.status !== "downloading"}
                    onClick={() => {
                      const cancelled = modelDownload.cancelDownload(
                        activeCatalogEntry.id,
                      );
                      if (cancelled) {
                        toast.info(t("settings.localAi.toast.downloadPaused"));
                      }
                    }}
                    type="button"
                    variant="outline"
                  >
                    {t("settings.localAi.download.pause")}
                  </Button>
              <Button
                className="h-auto whitespace-normal"
                disabled={
                      modelDownload.status !== "paused" ||
                      !modelDownload.resumable
                    }
                    onClick={async () => {
                      if (!scope) {
                        return;
                      }
                      const resumed = await modelDownload.resumeDownload(
                        activeCatalogEntry,
                      );
                      if (resumed) {
                        setDeviceState(readLocalAiDeviceState(scope));
                        toast.success(
                          t("settings.localAi.toast.browserModelCached", {
                            profileId: activeCatalogEntry.id,
                          }),
                        );
                      } else {
                        handleModelActionFailure();
                      }
                    }}
                    type="button"
                    variant="outline"
                  >
                    {t("settings.localAi.download.resume")}
                  </Button>
              <Button
                className="h-auto whitespace-normal"
                disabled={
                      modelDownload.status !== "error" &&
                      modelDownload.status !== "paused"
                    }
                    onClick={async () => {
                      if (!scope) {
                        return;
                      }
                      const retried = await modelDownload.retryDownload(
                        activeCatalogEntry,
                      );
                      if (retried) {
                        setDeviceState(readLocalAiDeviceState(scope));
                        toast.success(
                          t("settings.localAi.toast.browserModelCached", {
                            profileId: activeCatalogEntry.id,
                          }),
                        );
                      } else {
                        handleModelActionFailure();
                      }
                    }}
                    type="button"
                    variant="outline"
                  >
                    {t("settings.localAi.download.retry")}
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}

          {runtimePlatform === "tauri" && activeCatalogEntry ? (
            <div className="space-y-2">
              <div className="grid gap-2 md:grid-cols-2">
                <Button
                  className="h-auto whitespace-normal"
                  disabled={
                    controlsDisabled ||
                    !deviceState.allowDownloads ||
                    modelDownload.status === "downloading" ||
                    modelDownload.isModelInstalled(activeCatalogEntry.id) ||
                    activeTauriProfileBundled
                  }
                  onClick={async () => {
                    if (!scope) {
                      return;
                    }
                    const prepared = await modelDownload.startDownload(
                      activeCatalogEntry,
                    );
                    if (prepared) {
                      setDeviceState(readLocalAiDeviceState(scope));
                      toast.success(
                        t("settings.localAi.toast.tauriModelPrepared", {
                          profileId: activeCatalogEntry.id,
                        }),
                      );
                    } else {
                      handleModelActionFailure();
                    }
                  }}
                  type="button"
                >
                  {modelDownload.status === "downloading" &&
                  modelDownload.activeProfileId === activeCatalogEntry.id ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="mr-2 h-4 w-4" />
                  )}
                  {activeTauriProfileBundled
                    ? t("settings.localAi.tauri.bundledWithApp")
                    : modelDownload.isModelInstalled(activeCatalogEntry.id)
                      ? t("settings.localAi.tauri.modelPrepared")
                      : t("settings.localAi.tauri.prepareSelectedModel")}
                </Button>
                <Button
                  className="h-auto whitespace-normal"
                  disabled={
                    modelDownload.status === "downloading" ||
                    !modelDownload.isModelInstalled(activeCatalogEntry.id) ||
                    activeTauriProfileBundled
                  }
                  onClick={async () => {
                    if (!scope) {
                      return;
                    }
                    const removed = await modelDownload.removeDownloadedModel(
                      activeCatalogEntry,
                    );
                    if (removed) {
                      setDeviceState(readLocalAiDeviceState(scope));
                      toast.success(
                        t("settings.localAi.toast.tauriModelRemoved", {
                          profileId: activeCatalogEntry.id,
                        }),
                      );
                    } else {
                      handleModelActionFailure();
                    }
                  }}
                  type="button"
                  variant="outline"
                >
                  {activeTauriProfileBundled
                    ? t("settings.localAi.tauri.bundledModel")
                    : t("settings.localAi.download.removeSelectedModel")}
                </Button>
              </div>
              <div className="grid gap-2 md:grid-cols-3">
                <Button
                  className="h-auto whitespace-normal"
                  disabled={
                    modelDownload.status === "downloading" ||
                    !modelDownload.isModelInstalled(activeCatalogEntry.id)
                  }
                  onClick={async () => {
                    const result = await modelDownload.verifyInstalledModel(
                      activeCatalogEntry,
                    );
                    if (!result) {
                      toast.error(
                        t("settings.localAi.toast.tauriOnlyVerifyRepairUpdate"),
                      );
                      return;
                    }
                    if (result.verified) {
                      toast.success(
                        t("settings.localAi.toast.modelVerified", {
                          profileId: activeCatalogEntry.id,
                        }),
                      );
                    } else {
                      toast.error(
                        result.verificationError ??
                          result.error ??
                          t("settings.localAi.toast.modelVerificationFailed", {
                            profileId: activeCatalogEntry.id,
                          }),
                      );
                    }
                  }}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  {t("settings.localAi.download.verify")}
                </Button>
                <Button
                  className="h-auto whitespace-normal"
                  disabled={
                    controlsDisabled ||
                    !deviceState.allowDownloads ||
                    modelDownload.status === "downloading" ||
                    (!modelDownload.isModelInstalled(activeCatalogEntry.id) &&
                      !activeTauriProfileBundled)
                  }
                  onClick={async () => {
                    const result = await modelDownload.repairInstalledModel(
                      activeCatalogEntry,
                    );
                    if (!result) {
                      toast.error(
                        t("settings.localAi.toast.tauriOnlyVerifyRepairUpdate"),
                      );
                      return;
                    }
                    if (result.installed && !result.error) {
                      if (scope) {
                        setDeviceState(readLocalAiDeviceState(scope));
                      }
                      toast.success(
                        t("settings.localAi.toast.modelRepaired", {
                          profileId: activeCatalogEntry.id,
                        }),
                      );
                    } else {
                      toast.error(
                        result.error ??
                          result.verificationError ??
                          t("settings.localAi.toast.modelRepairFailed", {
                            profileId: activeCatalogEntry.id,
                          }),
                      );
                    }
                  }}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  {t("settings.localAi.download.repair")}
                </Button>
                <Button
                  className="h-auto whitespace-normal"
                  disabled={
                    controlsDisabled ||
                    !deviceState.allowDownloads ||
                    modelDownload.status === "downloading"
                  }
                  onClick={async () => {
                    const result = await modelDownload.updateInstalledModel(
                      activeCatalogEntry,
                    );
                    if (!result) {
                      toast.error(
                        t("settings.localAi.toast.tauriOnlyVerifyRepairUpdate"),
                      );
                      return;
                    }
                    if (result.installed && !result.error) {
                      if (scope) {
                        setDeviceState(readLocalAiDeviceState(scope));
                      }
                      toast.success(
                        t("settings.localAi.toast.modelUpdatedMetadata", {
                          profileId: activeCatalogEntry.id,
                        }),
                      );
                    } else {
                      toast.error(
                        result.error ??
                          result.verificationError ??
                          t("settings.localAi.toast.modelUpdateFailed", {
                            profileId: activeCatalogEntry.id,
                          }),
                      );
                    }
                  }}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  {t("settings.localAi.download.update")}
                </Button>
              </div>
            </div>
          ) : null}

          {surfaceCatalog.length > 0 ? (
            <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="font-medium text-slate-800">
                {t("settings.localAi.surfaceProfiles.title")}
              </div>
              <div className="space-y-2">
                {surfaceCatalog.map((entry) => {
                  const bundled =
                    runtimePlatform === "tauri" &&
                    bundledGemmaProfileIds.includes(entry.id);
                  const installed = modelDownload.isModelInstalled(entry.id);
                  const busy =
                    modelDownload.status === "downloading" &&
                    modelDownload.activeProfileId === entry.id;
                  const webModelSummary =
                    runtimePlatform === "web"
                      ? getWebModelResourceSummary(entry)
                      : null;
                  const webModelRecommendation = webModelSummary
                    ? getWebModelRecommendation(entry, webModelSummary)
                    : null;

                  return (
                    <div
                      className="rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-700"
                      key={entry.id}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="font-medium text-slate-900">{entry.id}</div>
                          <div className="text-[11px] text-slate-500">
                            {t("settings.localAi.surfaceProfiles.entrySummary", {
                              family: entry.family,
                              variant: entry.variant,
                              sizeMb: entry.approximateSizeMb,
                            })}
                            {entry.supportsVoiceInput
                              ? ` • ${t("settings.localAi.surfaceProfiles.voice")}`
                              : ""}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          {webModelSummary &&
                          webModelSummary.blockerState !== "none" ? (
                            <Badge
                              variant={
                                webModelSummary.blockerState === "risk"
                                  ? "outline"
                                  : "destructive"
                              }
                            >
                              {t(
                                `settings.localAi.surfaceProfiles.blockerBadge.${webModelSummary.blockerState}`,
                              )}
                            </Badge>
                          ) : null}
                          {bundled ? (
                            <Badge variant="secondary">
                              {t("settings.localAi.badge.bundled")}
                            </Badge>
                          ) : installed ? (
                            <Badge variant="secondary">
                              {t("settings.localAi.badge.installed")}
                            </Badge>
                          ) : (
                            <Badge variant="outline">
                              {t("settings.localAi.badge.notInstalled")}
                            </Badge>
                          )}
                          {syncedPrefs.defaultModelId === entry.id ? (
                            <Badge>{t("settings.localAi.badge.default")}</Badge>
                          ) : null}
                        </div>
                      </div>
                      {webModelSummary ? (
                        <div className="mt-3 grid gap-2 md:grid-cols-2">
                          <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                            <div className="font-medium text-slate-800">
                              {t("settings.localAi.models.summary.storageTitle")}
                            </div>
                            <div className="mt-1">
                              {t("settings.localAi.surfaceProfiles.storageNeed", {
                                size: formatRoundedMb(entry.approximateSizeMb) ??
                                  `${entry.approximateSizeMb} MB`,
                              })}
                            </div>
                            <div>
                              {t("settings.localAi.surfaceProfiles.storageAvailable", {
                                size:
                                  formatRoundedMb(
                                    webModelSummary.availableStorageForEntryMb,
                                  ) ??
                                  `${webModelSummary.availableStorageForEntryMb} MB`,
                              })}
                            </div>
                            <div
                              className={
                                webModelSummary.storageShortfallMb > 0
                                  ? "text-amber-700"
                                  : "text-emerald-700"
                              }
                            >
                              {webModelSummary.storageShortfallMb > 0
                                ? t("settings.localAi.surfaceProfiles.storageShortfall", {
                                    size:
                                      formatRoundedMb(
                                        webModelSummary.storageShortfallMb,
                                      ) ??
                                      `${webModelSummary.storageShortfallMb} MB`,
                                  })
                                : t("settings.localAi.surfaceProfiles.storageEnough")}
                            </div>
                          </div>
                          <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                            <div className="font-medium text-slate-800">
                              {t("settings.localAi.models.summary.runtimeTitle")}
                            </div>
                            <div className="mt-1">
                              {t("settings.localAi.surfaceProfiles.runtimeEstimate", {
                                size:
                                  formatRoundedMb(
                                    webModelSummary.estimatedRuntimeWorkingSetMb,
                                  ) ??
                                  `${webModelSummary.estimatedRuntimeWorkingSetMb} MB`,
                              })}
                            </div>
                            <div>
                              {t("settings.localAi.surfaceProfiles.runtimeBuffer", {
                                size:
                                  formatRoundedMb(
                                    webModelSummary.preferredGpuMaxBufferMb,
                                  ) ?? t("settings.localAi.common.notRecorded"),
                              })}
                            </div>
                            <div
                              className={
                                webModelSummary.runtimeState === "ready"
                                  ? "text-emerald-700"
                                  : webModelSummary.runtimeState === "blocked"
                                    ? "text-rose-700"
                                    : webModelSummary.runtimeState === "risk"
                                      ? "text-amber-700"
                                      : "text-slate-600"
                              }
                            >
                              {t(
                                `settings.localAi.surfaceProfiles.runtimeState.${webModelSummary.runtimeState}`,
                              )}
                            </div>
                            <div
                              className={
                                webModelSummary.blockerState === "storage" ||
                                webModelSummary.blockerState === "storage_and_runtime"
                                  ? "text-rose-700"
                                  : webModelSummary.blockerState === "runtime"
                                    ? "text-rose-700"
                                    : webModelSummary.blockerState === "risk"
                                      ? "text-amber-700"
                                      : "text-slate-600"
                              }
                            >
                              {t(
                                `settings.localAi.surfaceProfiles.blockerState.${webModelSummary.blockerState}`,
                              )}
                            </div>
                          </div>
                        </div>
                      ) : null}
                      {webModelSummary &&
                      webModelSummary.blockerState !== "none" ? (
                        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-2 text-[11px]">
                          <div className="font-medium text-slate-800">
                            {t("settings.localAi.models.quickFix.nextStep")}
                          </div>
                          <div className="mt-1">
                            {t(
                              `settings.localAi.surfaceProfiles.blockerState.${webModelSummary.blockerState}`,
                            )}
                          </div>
                          {(webModelSummary.blockerState === "storage" ||
                            webModelSummary.blockerState ===
                              "storage_and_runtime") &&
                          webModelRecommendation ? (
                            <div className="mt-2 flex flex-wrap gap-2">
                              <Button
                                onClick={() =>
                                  updateStorageBudget(
                                    webModelRecommendation.requiredStorageBudgetMb,
                                  )
                                }
                                size="sm"
                                type="button"
                                variant="outline"
                              >
                                {t(
                                  "settings.localAi.models.quickFix.storageRaiseButton",
                                  {
                                    total:
                                      formatRoundedMb(
                                        webModelRecommendation.requiredStorageBudgetMb,
                                      ) ??
                                      `${webModelRecommendation.requiredStorageBudgetMb} MB`,
                                  },
                                )}
                              </Button>
                            </div>
                          ) : null}
                          {(webModelSummary.blockerState === "storage" ||
                            webModelSummary.blockerState ===
                              "storage_and_runtime") &&
                          webModelRecommendation &&
                          webModelRecommendation.installedOtherEntries.length >
                            0 ? (
                            <div className="mt-1 text-slate-600">
                              {t("settings.localAi.models.quickFix.removeModelsHint", {
                                models: webModelRecommendation.installedOtherEntries.map(
                                    (installedEntry) => installedEntry.id,
                                  )
                                  .join(", "),
                              })}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                      <div className="mt-3 grid gap-2 md:grid-cols-3">
                        <Button
                          className="h-auto whitespace-normal"
                          disabled={anyModelActionInFlight}
                          onClick={() =>
                            setSyncedPrefs((current) => ({
                              ...current,
                              defaultModelId: entry.id,
                            }))
                          }
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          {t("settings.localAi.surfaceProfiles.setDefault")}
                        </Button>
                        <Button
                          className="h-auto whitespace-normal"
                          disabled={
                            controlsDisabled ||
                            !deviceState.allowDownloads ||
                            anyModelActionInFlight ||
                            installed ||
                            bundled
                          }
                          onClick={async () => {
                            if (!scope) {
                              return;
                            }
                            const prepared = await modelDownload.startDownload(entry);
                            if (prepared) {
                              setDeviceState(readLocalAiDeviceState(scope));
                              toast.success(
                                t("settings.localAi.toast.modelPreparedOnDevice", {
                                  profileId: entry.id,
                                }),
                              );
                            } else {
                              handleModelActionFailure();
                            }
                          }}
                          size="sm"
                          type="button"
                        >
                          {busy ? (
                            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Download className="mr-2 h-3.5 w-3.5" />
                          )}
                          {bundled
                            ? t("settings.localAi.badge.bundled")
                            : installed
                              ? t("settings.localAi.badge.installed")
                              : t("settings.localAi.surfaceProfiles.prepare")}
                        </Button>
                        <Button
                          className="h-auto whitespace-normal"
                          disabled={anyModelActionInFlight || !installed || bundled}
                          onClick={async () => {
                            if (!scope) {
                              return;
                            }
                            const removed = await modelDownload.removeDownloadedModel(
                              entry,
                            );
                            if (removed) {
                              setDeviceState(readLocalAiDeviceState(scope));
                              toast.success(
                                t("settings.localAi.toast.modelRemovedFromDevice", {
                                  profileId: entry.id,
                                }),
                              );
                            } else {
                              handleModelActionFailure();
                            }
                          }}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          {t("settings.localAi.surfaceProfiles.remove")}
                        </Button>
                      </div>
                      {renderDownloadStatusCard(entry.id, { compact: true })}
                      {runtimePlatform === "tauri" && installed ? (
                        <div className="mt-2 grid gap-2 md:grid-cols-3">
                          <Button
                            className="h-auto whitespace-normal"
                            disabled={anyModelActionInFlight}
                            onClick={async () => {
                              const result =
                                await modelDownload.verifyInstalledModel(entry);
                              if (!result) {
                                toast.error(
                                  t(
                                    "settings.localAi.toast.tauriOnlyVerifyRepairUpdate",
                                  ),
                                );
                                return;
                              }
                              if (result.verified) {
                                toast.success(
                                  t("settings.localAi.toast.modelVerified", {
                                    profileId: entry.id,
                                  }),
                                );
                              } else {
                                toast.error(
                                  result.verificationError ??
                                    result.error ??
                                    t(
                                      "settings.localAi.toast.modelVerificationFailed",
                                      {
                                        profileId: entry.id,
                                      },
                                    ),
                                );
                              }
                            }}
                            size="sm"
                            type="button"
                            variant="outline"
                          >
                            {t("settings.localAi.download.verify")}
                          </Button>
                          <Button
                            className="h-auto whitespace-normal"
                            disabled={anyModelActionInFlight || controlsDisabled}
                            onClick={async () => {
                              const result =
                                await modelDownload.repairInstalledModel(entry);
                              if (!result) {
                                toast.error(
                                  t(
                                    "settings.localAi.toast.tauriOnlyVerifyRepairUpdate",
                                  ),
                                );
                                return;
                              }
                              if (result.installed && !result.error) {
                                if (scope) {
                                  setDeviceState(readLocalAiDeviceState(scope));
                                }
                                toast.success(
                                  t("settings.localAi.toast.modelRepaired", {
                                    profileId: entry.id,
                                  }),
                                );
                              } else {
                                toast.error(
                                  result.error ??
                                    result.verificationError ??
                                    t("settings.localAi.toast.modelRepairFailed", {
                                      profileId: entry.id,
                                    }),
                                );
                              }
                            }}
                            size="sm"
                            type="button"
                            variant="outline"
                          >
                            {t("settings.localAi.download.repair")}
                          </Button>
                          <Button
                            className="h-auto whitespace-normal"
                            disabled={anyModelActionInFlight || controlsDisabled}
                            onClick={async () => {
                              const result =
                                await modelDownload.updateInstalledModel(entry);
                              if (!result) {
                                toast.error(
                                  t(
                                    "settings.localAi.toast.tauriOnlyVerifyRepairUpdate",
                                  ),
                                );
                                return;
                              }
                              if (result.installed && !result.error) {
                                if (scope) {
                                  setDeviceState(readLocalAiDeviceState(scope));
                                }
                                toast.success(
                                  t("settings.localAi.toast.modelUpdated", {
                                    profileId: entry.id,
                                  }),
                                );
                              } else {
                                toast.error(
                                  result.error ??
                                    result.verificationError ??
                                    t("settings.localAi.toast.modelUpdateFailed", {
                                      profileId: entry.id,
                                    }),
                                );
                              }
                            }}
                            size="sm"
                            type="button"
                            variant="outline"
                          >
                            {t("settings.localAi.download.update")}
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          <Button onClick={clearDeviceState} type="button" variant="outline">
            <RefreshCw className="mr-2 h-4 w-4" />
            {t("settings.localAi.clearCache")}
          </Button>
          </LocalAiSubsection>
          </div>
        </div>
      </div>
    </div>
  );
}
