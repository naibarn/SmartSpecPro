import { useEffect, useMemo, useState } from "react";

import {
  buildBestEffortRequiredLimits,
  type BrowserGpuDeviceDescriptor,
} from "../workers/browserGpuDeviceLimits";
import type {
  CapabilityResult,
  LocalAiCatalogEntry,
} from "../types/capability";
import { detectBrowserLocalRuntimeAvailability } from "../adapters/browserLocalRuntime";

interface UseLocalAiCapabilityOptions {
  catalog?: LocalAiCatalogEntry[];
  refreshNonce?: number;
}

interface ProbeGpuAdapterInfo {
  vendor?: string;
  architecture?: string;
  device?: string;
  description?: string;
}

interface ProbeGpuDevice {
  limits?: {
    maxBufferSize?: number;
    maxStorageBufferBindingSize?: number;
  };
  destroy?: () => void;
}

interface ProbeGpuAdapter {
  features?: Iterable<string>;
  info?: ProbeGpuAdapterInfo;
  limits?: {
    maxBufferSize?: number;
    maxStorageBufferBindingSize?: number;
  };
  requestAdapterInfo?: () => Promise<ProbeGpuAdapterInfo>;
  requestDevice?: (
    descriptor?: BrowserGpuDeviceDescriptor,
  ) => Promise<ProbeGpuDevice | null>;
}

interface ProbeGpuNavigator {
  requestAdapter?: (options?: {
    powerPreference?: "low-power" | "high-performance";
  }) => Promise<ProbeGpuAdapter | null>;
}

async function requestProbeAdapter(
  navigatorGpu: ProbeGpuNavigator | null,
  powerPreference?: "low-power" | "high-performance",
): Promise<ProbeGpuAdapter | null> {
  if (!navigatorGpu?.requestAdapter) {
    return null;
  }

  return navigatorGpu.requestAdapter(
    typeof powerPreference === "string" ? { powerPreference } : undefined,
  );
}

function cleanGpuInfoValue(value?: string | null): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const next = value.trim();
  return next.length > 0 ? next : null;
}

async function readAdapterInfo(
  adapter: ProbeGpuAdapter | null,
): Promise<ProbeGpuAdapterInfo | null> {
  if (!adapter) {
    return null;
  }

  if (adapter.info) {
    return adapter.info;
  }

  if (typeof adapter.requestAdapterInfo === "function") {
    try {
      return (await adapter.requestAdapterInfo()) ?? null;
    } catch {
      return null;
    }
  }

  return null;
}

function formatAdapterLabel(info: ProbeGpuAdapterInfo | null): string | null {
  if (!info) {
    return null;
  }

  const description = cleanGpuInfoValue(info.description);
  if (description) {
    return description;
  }

  const device = cleanGpuInfoValue(info.device);
  const vendor = cleanGpuInfoValue(info.vendor);
  const architecture = cleanGpuInfoValue(info.architecture);
  const fallback = [vendor, architecture ?? device].filter(Boolean).join(" · ");

  return fallback.length > 0 ? fallback : null;
}

function bytesToRoundedMb(value?: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return Math.round(value / (1024 * 1024));
}

async function readDeviceDiagnostics(
  adapter: ProbeGpuAdapter | null,
  descriptor?: BrowserGpuDeviceDescriptor,
): Promise<{
  available: boolean;
  maxBufferSizeMb: number | null;
  maxStorageBufferBindingSizeMb: number | null;
  error: string | null;
}> {
  if (!adapter?.requestDevice) {
    return {
      available: Boolean(adapter),
      maxBufferSizeMb: null,
      maxStorageBufferBindingSizeMb: null,
      error: adapter ? "requestDevice_unavailable" : "adapter_unavailable",
    };
  }

  try {
    const device = await adapter.requestDevice(descriptor);
    const next = {
      available: Boolean(device),
      maxBufferSizeMb: bytesToRoundedMb(device?.limits?.maxBufferSize),
      maxStorageBufferBindingSizeMb: bytesToRoundedMb(
        device?.limits?.maxStorageBufferBindingSize,
      ),
      error: null,
    };
    device?.destroy?.();
    return next;
  } catch (error) {
    return {
      available: false,
      maxBufferSizeMb: null,
      maxStorageBufferBindingSizeMb: null,
      error:
        error instanceof Error
          ? error.message || error.name
          : "requestDevice_failed",
    };
  }
}

async function readRequestedDeviceDiagnostics(
  adapter: ProbeGpuAdapter | null,
): Promise<{
  available: boolean;
  maxBufferSizeMb: number | null;
  maxStorageBufferBindingSizeMb: number | null;
  error: string | null;
}> {
  const requiredLimits = buildBestEffortRequiredLimits(adapter);
  const descriptor =
    requiredLimits != null
      ? {
          requiredLimits,
        }
      : undefined;
  return readDeviceDiagnostics(adapter, descriptor);
}

function readAdapterDiagnostics(adapter: ProbeGpuAdapter | null): {
  maxBufferSizeMb: number | null;
  maxStorageBufferBindingSizeMb: number | null;
} {
  return {
    maxBufferSizeMb: bytesToRoundedMb(adapter?.limits?.maxBufferSize),
    maxStorageBufferBindingSizeMb: bytesToRoundedMb(
      adapter?.limits?.maxStorageBufferBindingSize,
    ),
  };
}

function buildUnsupportedCapability(
  catalog: LocalAiCatalogEntry[],
  input: {
    secureContext: boolean;
    browserDeviceMemoryGb?: number | null;
    webgpu: boolean;
    webgpuAdapterAvailable: boolean;
    webgpuAdapterLabel?: string | null;
    webgpuAdapterVendor?: string | null;
    webgpuSubgroupsFeatureAvailable?: boolean;
    webgpuAdapterMaxBufferSizeMb?: number | null;
    webgpuAdapterMaxStorageBufferBindingSizeMb?: number | null;
    webgpuLowPowerAdapterAvailable?: boolean;
    webgpuLowPowerAdapterLabel?: string | null;
    webgpuLowPowerAdapterVendor?: string | null;
    webgpuDeviceAvailable?: boolean;
    webgpuDeviceMaxBufferSizeMb?: number | null;
    webgpuDeviceMaxStorageBufferBindingSizeMb?: number | null;
    webgpuRequestedDeviceAvailable?: boolean;
    webgpuRequestedDeviceMaxBufferSizeMb?: number | null;
    webgpuRequestedDeviceMaxStorageBufferBindingSizeMb?: number | null;
    webgpuRequestedDeviceError?: string | null;
    webgpuHighPerformanceAdapterAvailable?: boolean;
    webgpuHighPerformanceAdapterLabel?: string | null;
    webgpuHighPerformanceAdapterVendor?: string | null;
    webgpuHighPerformanceSubgroupsFeatureAvailable?: boolean;
    webgpuHighPerformanceDeviceAvailable?: boolean;
    webgpuHighPerformanceDeviceMaxBufferSizeMb?: number | null;
    webgpuHighPerformanceDeviceMaxStorageBufferBindingSizeMb?: number | null;
    webgpuHighPerformanceRequestedDeviceAvailable?: boolean;
    webgpuHighPerformanceRequestedDeviceMaxBufferSizeMb?: number | null;
    webgpuHighPerformanceRequestedDeviceMaxStorageBufferBindingSizeMb?:
      | number
      | null;
    webgpuHighPerformanceRequestedDeviceError?: string | null;
    webgpuProfileRequirementsMet?: boolean;
    reasons: string[];
  },
): CapabilityResult {
  return {
    supported: false,
    platform: "web",
    secureContext: input.secureContext,
    browserDeviceMemoryGb: input.browserDeviceMemoryGb ?? null,
    webgpu: input.webgpu,
    webgpuAdapterAvailable: input.webgpuAdapterAvailable,
    webgpuAdapterLabel: input.webgpuAdapterLabel ?? null,
    webgpuAdapterVendor: input.webgpuAdapterVendor ?? null,
    webgpuSubgroupsFeatureAvailable:
      input.webgpuSubgroupsFeatureAvailable ?? false,
    webgpuAdapterMaxBufferSizeMb: input.webgpuAdapterMaxBufferSizeMb ?? null,
    webgpuAdapterMaxStorageBufferBindingSizeMb:
      input.webgpuAdapterMaxStorageBufferBindingSizeMb ?? null,
    webgpuLowPowerAdapterAvailable: input.webgpuLowPowerAdapterAvailable ?? false,
    webgpuLowPowerAdapterLabel: input.webgpuLowPowerAdapterLabel ?? null,
    webgpuLowPowerAdapterVendor: input.webgpuLowPowerAdapterVendor ?? null,
    webgpuDeviceAvailable: input.webgpuDeviceAvailable ?? false,
    webgpuDeviceMaxBufferSizeMb: input.webgpuDeviceMaxBufferSizeMb ?? null,
    webgpuDeviceMaxStorageBufferBindingSizeMb:
      input.webgpuDeviceMaxStorageBufferBindingSizeMb ?? null,
    webgpuRequestedDeviceAvailable:
      input.webgpuRequestedDeviceAvailable ?? false,
    webgpuRequestedDeviceMaxBufferSizeMb:
      input.webgpuRequestedDeviceMaxBufferSizeMb ?? null,
    webgpuRequestedDeviceMaxStorageBufferBindingSizeMb:
      input.webgpuRequestedDeviceMaxStorageBufferBindingSizeMb ?? null,
    webgpuRequestedDeviceError: input.webgpuRequestedDeviceError ?? null,
    webgpuHighPerformanceAdapterAvailable:
      input.webgpuHighPerformanceAdapterAvailable ?? false,
    webgpuHighPerformanceAdapterLabel:
      input.webgpuHighPerformanceAdapterLabel ?? null,
    webgpuHighPerformanceAdapterVendor:
      input.webgpuHighPerformanceAdapterVendor ?? null,
    webgpuHighPerformanceSubgroupsFeatureAvailable:
      input.webgpuHighPerformanceSubgroupsFeatureAvailable ?? false,
    webgpuHighPerformanceDeviceAvailable:
      input.webgpuHighPerformanceDeviceAvailable ?? false,
    webgpuHighPerformanceDeviceMaxBufferSizeMb:
      input.webgpuHighPerformanceDeviceMaxBufferSizeMb ?? null,
    webgpuHighPerformanceDeviceMaxStorageBufferBindingSizeMb:
      input.webgpuHighPerformanceDeviceMaxStorageBufferBindingSizeMb ?? null,
    webgpuHighPerformanceRequestedDeviceAvailable:
      input.webgpuHighPerformanceRequestedDeviceAvailable ?? false,
    webgpuHighPerformanceRequestedDeviceMaxBufferSizeMb:
      input.webgpuHighPerformanceRequestedDeviceMaxBufferSizeMb ?? null,
    webgpuHighPerformanceRequestedDeviceMaxStorageBufferBindingSizeMb:
      input.webgpuHighPerformanceRequestedDeviceMaxStorageBufferBindingSizeMb ??
      null,
    webgpuHighPerformanceRequestedDeviceError:
      input.webgpuHighPerformanceRequestedDeviceError ?? null,
    webgpuProfileRequirementsMet: input.webgpuProfileRequirementsMet ?? false,
    eligibleProfiles: [],
    eligibleVoiceProfiles: [],
    reasons: input.reasons,
    storageEstimateMb:
      catalog.length > 0
        ? catalog.reduce((sum, entry) => sum + entry.approximateSizeMb, 0)
        : null,
  };
}

export function useLocalAiCapability(
  options: UseLocalAiCapabilityOptions = {},
): CapabilityResult {
  const catalog = useMemo(() => options.catalog ?? [], [options.catalog]);
  const refreshNonce = options.refreshNonce ?? 0;
  const [capability, setCapability] = useState<CapabilityResult>(() =>
    buildUnsupportedCapability(catalog, {
      secureContext:
        typeof window !== "undefined" ? window.isSecureContext : false,
      browserDeviceMemoryGb: null,
      webgpu: false,
      webgpuAdapterAvailable: false,
      webgpuAdapterLabel: null,
      webgpuAdapterVendor: null,
      webgpuSubgroupsFeatureAvailable: false,
      webgpuAdapterMaxBufferSizeMb: null,
      webgpuAdapterMaxStorageBufferBindingSizeMb: null,
      webgpuLowPowerAdapterAvailable: false,
      webgpuLowPowerAdapterLabel: null,
      webgpuLowPowerAdapterVendor: null,
      webgpuDeviceAvailable: false,
      webgpuDeviceMaxBufferSizeMb: null,
      webgpuDeviceMaxStorageBufferBindingSizeMb: null,
      webgpuRequestedDeviceAvailable: false,
      webgpuRequestedDeviceMaxBufferSizeMb: null,
      webgpuRequestedDeviceMaxStorageBufferBindingSizeMb: null,
      webgpuRequestedDeviceError: null,
      webgpuHighPerformanceAdapterAvailable: false,
      webgpuHighPerformanceAdapterLabel: null,
      webgpuHighPerformanceAdapterVendor: null,
      webgpuHighPerformanceSubgroupsFeatureAvailable: false,
      webgpuHighPerformanceDeviceAvailable: false,
      webgpuHighPerformanceDeviceMaxBufferSizeMb: null,
      webgpuHighPerformanceDeviceMaxStorageBufferBindingSizeMb: null,
      webgpuHighPerformanceRequestedDeviceAvailable: false,
      webgpuHighPerformanceRequestedDeviceMaxBufferSizeMb: null,
      webgpuHighPerformanceRequestedDeviceMaxStorageBufferBindingSizeMb: null,
      webgpuHighPerformanceRequestedDeviceError: null,
      webgpuProfileRequirementsMet: false,
      reasons: ["capability_probe_pending"],
    }),
  );

  useEffect(() => {
    let cancelled = false;

    async function probe() {
      const secureContext =
        typeof window !== "undefined" ? window.isSecureContext : false;
      const browserDeviceMemoryGb =
        typeof navigator !== "undefined" &&
        typeof (
          navigator as Navigator & {
            deviceMemory?: number;
          }
        ).deviceMemory === "number"
          ? (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? null
          : null;
      const navigatorGpu =
        typeof navigator !== "undefined"
          ? ((navigator as Navigator & {
              gpu?: ProbeGpuNavigator;
            }).gpu ?? null)
          : null;
      const webgpu = Boolean(navigatorGpu);
      let webgpuAdapterAvailable = false;
      let webgpuAdapterLabel: string | null = null;
      let webgpuAdapterVendor: string | null = null;
      let webgpuSubgroupsFeatureAvailable = false;
      let webgpuAdapterMaxBufferSizeMb: number | null = null;
      let webgpuAdapterMaxStorageBufferBindingSizeMb: number | null = null;
      let webgpuLowPowerAdapterAvailable = false;
      let webgpuLowPowerAdapterLabel: string | null = null;
      let webgpuLowPowerAdapterVendor: string | null = null;
      let webgpuDeviceAvailable = false;
      let webgpuDeviceMaxBufferSizeMb: number | null = null;
      let webgpuDeviceMaxStorageBufferBindingSizeMb: number | null = null;
      let webgpuRequestedDeviceAvailable = false;
      let webgpuRequestedDeviceMaxBufferSizeMb: number | null = null;
      let webgpuRequestedDeviceMaxStorageBufferBindingSizeMb: number | null =
        null;
      let webgpuRequestedDeviceError: string | null = null;
      let webgpuHighPerformanceAdapterAvailable = false;
      let webgpuHighPerformanceAdapterLabel: string | null = null;
      let webgpuHighPerformanceAdapterVendor: string | null = null;
      let webgpuHighPerformanceSubgroupsFeatureAvailable = false;
      let webgpuHighPerformanceDeviceAvailable = false;
      let webgpuHighPerformanceDeviceMaxBufferSizeMb: number | null = null;
      let webgpuHighPerformanceDeviceMaxStorageBufferBindingSizeMb: number | null =
        null;
      let webgpuHighPerformanceRequestedDeviceAvailable = false;
      let webgpuHighPerformanceRequestedDeviceMaxBufferSizeMb: number | null =
        null;
      let webgpuHighPerformanceRequestedDeviceMaxStorageBufferBindingSizeMb:
        | number
        | null = null;
      let webgpuHighPerformanceRequestedDeviceError: string | null = null;
      let adapterFeatures: string[] = [];

      if (navigatorGpu?.requestAdapter) {
        try {
          const adapter = await requestProbeAdapter(navigatorGpu);
          webgpuAdapterAvailable = Boolean(adapter);
          const adapterInfo = await readAdapterInfo(adapter);
          webgpuAdapterLabel = formatAdapterLabel(adapterInfo);
          webgpuAdapterVendor = cleanGpuInfoValue(adapterInfo?.vendor);
          const adapterDiagnostics = readAdapterDiagnostics(adapter);
          webgpuAdapterMaxBufferSizeMb = adapterDiagnostics.maxBufferSizeMb;
          webgpuAdapterMaxStorageBufferBindingSizeMb =
            adapterDiagnostics.maxStorageBufferBindingSizeMb;
          if (adapter?.features) {
            adapterFeatures = Array.from(adapter.features);
            webgpuSubgroupsFeatureAvailable =
              adapterFeatures.includes("subgroups");
          }
          const defaultDeviceDiagnostics = await readDeviceDiagnostics(
            await requestProbeAdapter(navigatorGpu),
          );
          webgpuDeviceAvailable = defaultDeviceDiagnostics.available;
          webgpuDeviceMaxBufferSizeMb =
            defaultDeviceDiagnostics.maxBufferSizeMb;
          webgpuDeviceMaxStorageBufferBindingSizeMb =
            defaultDeviceDiagnostics.maxStorageBufferBindingSizeMb;
          const requestedDeviceDiagnostics =
            await readRequestedDeviceDiagnostics(
              await requestProbeAdapter(navigatorGpu),
            );
          webgpuRequestedDeviceAvailable =
            requestedDeviceDiagnostics.available;
          webgpuRequestedDeviceMaxBufferSizeMb =
            requestedDeviceDiagnostics.maxBufferSizeMb;
          webgpuRequestedDeviceMaxStorageBufferBindingSizeMb =
            requestedDeviceDiagnostics.maxStorageBufferBindingSizeMb;
          webgpuRequestedDeviceError = requestedDeviceDiagnostics.error;
        } catch {
          webgpuAdapterAvailable = false;
          webgpuAdapterLabel = null;
          webgpuAdapterVendor = null;
          webgpuAdapterMaxBufferSizeMb = null;
          webgpuAdapterMaxStorageBufferBindingSizeMb = null;
          webgpuDeviceAvailable = false;
          webgpuDeviceMaxBufferSizeMb = null;
          webgpuDeviceMaxStorageBufferBindingSizeMb = null;
          webgpuRequestedDeviceAvailable = false;
          webgpuRequestedDeviceMaxBufferSizeMb = null;
          webgpuRequestedDeviceMaxStorageBufferBindingSizeMb = null;
          webgpuRequestedDeviceError = "requestDevice_failed";
        }

        try {
          const lowPowerAdapter = await requestProbeAdapter(
            navigatorGpu,
            "low-power",
          );
          webgpuLowPowerAdapterAvailable = Boolean(lowPowerAdapter);
          const lowPowerInfo = await readAdapterInfo(lowPowerAdapter);
          webgpuLowPowerAdapterLabel = formatAdapterLabel(lowPowerInfo);
          webgpuLowPowerAdapterVendor = cleanGpuInfoValue(lowPowerInfo?.vendor);
        } catch {
          webgpuLowPowerAdapterAvailable = false;
          webgpuLowPowerAdapterLabel = null;
          webgpuLowPowerAdapterVendor = null;
        }

        try {
          const highPerformanceAdapter = await requestProbeAdapter(
            navigatorGpu,
            "high-performance",
          );
          webgpuHighPerformanceAdapterAvailable = false;
          webgpuHighPerformanceAdapterLabel = null;
          webgpuHighPerformanceAdapterVendor = null;
          if (highPerformanceAdapter) {
            webgpuHighPerformanceAdapterAvailable = true;
            const highPerformanceInfo = await readAdapterInfo(
              highPerformanceAdapter,
            );
            webgpuHighPerformanceAdapterLabel =
              formatAdapterLabel(highPerformanceInfo);
            webgpuHighPerformanceAdapterVendor = cleanGpuInfoValue(
              highPerformanceInfo?.vendor,
            );
            webgpuHighPerformanceSubgroupsFeatureAvailable = Array.from(
              highPerformanceAdapter.features ?? [],
            ).includes("subgroups");
            const highPerformanceDeviceDiagnostics =
              await readDeviceDiagnostics(
                await requestProbeAdapter(navigatorGpu, "high-performance"),
              );
            webgpuHighPerformanceDeviceAvailable =
              highPerformanceDeviceDiagnostics.available;
            webgpuHighPerformanceDeviceMaxBufferSizeMb =
              highPerformanceDeviceDiagnostics.maxBufferSizeMb;
            webgpuHighPerformanceDeviceMaxStorageBufferBindingSizeMb =
              highPerformanceDeviceDiagnostics.maxStorageBufferBindingSizeMb;
            const highPerformanceRequestedDeviceDiagnostics =
              await readRequestedDeviceDiagnostics(
                await requestProbeAdapter(navigatorGpu, "high-performance"),
              );
            webgpuHighPerformanceRequestedDeviceAvailable =
              highPerformanceRequestedDeviceDiagnostics.available;
            webgpuHighPerformanceRequestedDeviceMaxBufferSizeMb =
              highPerformanceRequestedDeviceDiagnostics.maxBufferSizeMb;
            webgpuHighPerformanceRequestedDeviceMaxStorageBufferBindingSizeMb =
              highPerformanceRequestedDeviceDiagnostics.maxStorageBufferBindingSizeMb;
            webgpuHighPerformanceRequestedDeviceError =
              highPerformanceRequestedDeviceDiagnostics.error;
          }
        } catch {
          webgpuHighPerformanceAdapterAvailable = false;
          webgpuHighPerformanceAdapterLabel = null;
          webgpuHighPerformanceAdapterVendor = null;
          webgpuHighPerformanceDeviceAvailable = false;
          webgpuHighPerformanceDeviceMaxBufferSizeMb = null;
          webgpuHighPerformanceDeviceMaxStorageBufferBindingSizeMb = null;
          webgpuHighPerformanceRequestedDeviceAvailable = false;
          webgpuHighPerformanceRequestedDeviceMaxBufferSizeMb = null;
          webgpuHighPerformanceRequestedDeviceMaxStorageBufferBindingSizeMb =
            null;
          webgpuHighPerformanceRequestedDeviceError = "requestDevice_failed";
        }
      }

      const effectiveRuntimeDeviceAvailable = webgpuHighPerformanceAdapterAvailable
        ? webgpuHighPerformanceRequestedDeviceAvailable
        : webgpuRequestedDeviceAvailable;

      const runtimeAvailability = detectBrowserLocalRuntimeAvailability({
        secureContext,
        webgpu,
        webgpuAdapterAvailable,
        webgpuDeviceAvailable: effectiveRuntimeDeviceAvailable,
      });

      const eligibleProfiles = catalog
        .filter((entry) => entry.status === "allowed")
        .filter((entry) => entry.supportedPlatforms.includes("web"))
        .filter(
          (entry) =>
            (!entry.minimumRequirements.requiresSecureContext ||
              secureContext) &&
            (!entry.minimumRequirements.requiresWebGpu || webgpu) &&
            (!entry.minimumRequirements.requiresWebGpu ||
              webgpuAdapterAvailable) &&
            (!entry.minimumRequirements.requiresWebGpu ||
              effectiveRuntimeDeviceAvailable),
        )
        .filter((entry) =>
          (entry.minimumRequirements.requiredWebGpuFeatures ?? []).every(
            (feature) => adapterFeatures.includes(feature),
          ),
        )
        .filter(
          (entry) =>
            typeof entry.runtimeConfig?.browser?.modelAssetUrl === "string" &&
            entry.runtimeConfig.browser.modelAssetUrl.trim().length > 0,
        );
      const eligibleVoiceProfiles = eligibleProfiles
        .filter((entry) => entry.supportsVoiceInput)
        .map((entry) => entry.id);

      const reasons: string[] = runtimeAvailability.reason
        ? [runtimeAvailability.reason]
        : [];
      if (!secureContext && !reasons.includes("secure_context_required")) {
        reasons.unshift("secure_context_required");
      }
      if (!webgpu && !reasons.includes("webgpu_unavailable")) {
        reasons.push("webgpu_unavailable");
      }
      if (
        webgpu &&
        !webgpuAdapterAvailable &&
        !reasons.includes("webgpu_adapter_unavailable")
      ) {
        reasons.push("webgpu_adapter_unavailable");
      }
      if (
        webgpuAdapterAvailable &&
        !effectiveRuntimeDeviceAvailable &&
        !reasons.includes("webgpu_device_unavailable")
      ) {
        reasons.push("webgpu_device_unavailable");
      }
      if (
        runtimeAvailability.available &&
        eligibleProfiles.length === 0 &&
        !reasons.includes("no_eligible_browser_profiles")
      ) {
        reasons.push("no_eligible_browser_profiles");
      }

      const next: CapabilityResult =
        runtimeAvailability.available && eligibleProfiles.length > 0
          ? {
              supported: true,
              platform: "web",
              secureContext,
              browserDeviceMemoryGb,
              webgpu,
              webgpuAdapterAvailable,
              webgpuAdapterLabel,
              webgpuAdapterVendor,
              webgpuSubgroupsFeatureAvailable,
              webgpuAdapterMaxBufferSizeMb,
              webgpuAdapterMaxStorageBufferBindingSizeMb,
              webgpuLowPowerAdapterAvailable,
              webgpuLowPowerAdapterLabel,
              webgpuLowPowerAdapterVendor,
              webgpuDeviceAvailable,
              webgpuDeviceMaxBufferSizeMb,
              webgpuDeviceMaxStorageBufferBindingSizeMb,
              webgpuRequestedDeviceAvailable,
              webgpuRequestedDeviceMaxBufferSizeMb,
              webgpuRequestedDeviceMaxStorageBufferBindingSizeMb,
              webgpuRequestedDeviceError,
              webgpuHighPerformanceAdapterAvailable,
              webgpuHighPerformanceAdapterLabel,
              webgpuHighPerformanceAdapterVendor,
              webgpuHighPerformanceSubgroupsFeatureAvailable,
              webgpuHighPerformanceDeviceAvailable,
              webgpuHighPerformanceDeviceMaxBufferSizeMb,
              webgpuHighPerformanceDeviceMaxStorageBufferBindingSizeMb,
              webgpuHighPerformanceRequestedDeviceAvailable,
              webgpuHighPerformanceRequestedDeviceMaxBufferSizeMb,
              webgpuHighPerformanceRequestedDeviceMaxStorageBufferBindingSizeMb,
              webgpuHighPerformanceRequestedDeviceError,
              webgpuProfileRequirementsMet: true,
              eligibleProfiles: eligibleProfiles.map((entry) => entry.id),
              eligibleVoiceProfiles,
              reasons: [],
              storageEstimateMb: eligibleProfiles.reduce(
                (sum, entry) => sum + entry.approximateSizeMb,
                0,
              ),
            }
          : buildUnsupportedCapability(catalog, {
              secureContext,
              browserDeviceMemoryGb,
              webgpu,
              webgpuAdapterAvailable,
              webgpuAdapterLabel,
              webgpuAdapterVendor,
              webgpuSubgroupsFeatureAvailable,
              webgpuAdapterMaxBufferSizeMb,
              webgpuAdapterMaxStorageBufferBindingSizeMb,
              webgpuLowPowerAdapterAvailable,
              webgpuLowPowerAdapterLabel,
              webgpuLowPowerAdapterVendor,
              webgpuDeviceAvailable,
              webgpuDeviceMaxBufferSizeMb,
              webgpuDeviceMaxStorageBufferBindingSizeMb,
              webgpuRequestedDeviceAvailable,
              webgpuRequestedDeviceMaxBufferSizeMb,
              webgpuRequestedDeviceMaxStorageBufferBindingSizeMb,
              webgpuRequestedDeviceError,
              webgpuHighPerformanceAdapterAvailable,
              webgpuHighPerformanceAdapterLabel,
              webgpuHighPerformanceAdapterVendor,
              webgpuHighPerformanceSubgroupsFeatureAvailable,
              webgpuHighPerformanceDeviceAvailable,
              webgpuHighPerformanceDeviceMaxBufferSizeMb,
              webgpuHighPerformanceDeviceMaxStorageBufferBindingSizeMb,
              webgpuHighPerformanceRequestedDeviceAvailable,
              webgpuHighPerformanceRequestedDeviceMaxBufferSizeMb,
              webgpuHighPerformanceRequestedDeviceMaxStorageBufferBindingSizeMb,
              webgpuHighPerformanceRequestedDeviceError,
              webgpuProfileRequirementsMet: eligibleProfiles.length > 0,
              reasons,
            });

      if (!cancelled) {
        setCapability(next);
      }
    }

    void probe();

    return () => {
      cancelled = true;
    };
  }, [catalog, refreshNonce]);

  return capability;
}
