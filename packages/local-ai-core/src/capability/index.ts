import type {
  LocalAiExecutionMode,
  LocalAiVoiceInputMode,
} from "../runtime-types/index";

export type LocalAiPlatform = "web" | "tauri" | "android_future";
export type LocalAiRuntimeFamily =
  | "mediapipe-webgpu"
  | "tauri-native"
  | "server-api";
export type LocalAiPolicyState =
  | "enabled"
  | "tenant_disabled"
  | "force_cloud_only";

export interface CapabilityResult {
  supported: boolean;
  platform: LocalAiPlatform;
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
  webgpuProfileRequirementsMet: boolean;
  eligibleProfiles: string[];
  eligibleVoiceProfiles: string[];
  reasons: string[];
  storageEstimateMb?: number | null;
}

export interface LocalAiCatalogEntry {
  id: string;
  family: string;
  variant: string;
  supportedPlatforms: LocalAiPlatform[];
  runtimeFamily: LocalAiRuntimeFamily;
  approximateSizeMb: number;
  downloadRequired: boolean;
  supportsVoiceInput: boolean;
  defaultVoiceInputMode?: LocalAiVoiceInputMode | null;
  modalities: {
    text: boolean;
    image: boolean;
    audio: boolean;
    ocr: "none" | "conditional" | "document_grade";
  };
  minimumRequirements: {
    requiresSecureContext: boolean;
    requiresWebGpu: boolean;
    requiredWebGpuFeatures?: string[];
  };
  integrity: {
    manifestVersion: number;
    checksumSha256: string | null;
  };
  runtimeConfig?: {
    browser?: {
      bundleUrl?: string | null;
      bundleSha256?: string | null;
      wasmRootUrl?: string | null;
      wasmVersion?: string | null;
      wasmAssetChecksums?: Record<string, string> | null;
      modelAssetUrl?: string | null;
    } | null;
    tauri?: {
      fromHuggingFaceRepo?: string | null;
      modelFileName?: string | null;
      cliBinaryName?: string | null;
    } | null;
  };
  status: "allowed" | "revoked";
  statusReason?: string | null;
}

export interface LocalAiPolicy {
  state: LocalAiPolicyState;
  featureEnabled: boolean;
  forceCloudOnly: boolean;
  defaultExecutionMode: LocalAiExecutionMode;
  allowedProfileIds: string[] | null;
  reason: string | null;
}

export interface LocalAiPolicyCatalogResponse {
  policy: LocalAiPolicy;
  catalog: LocalAiCatalogEntry[];
}
