export interface LocalAiExternalTextBackendConfig {
  enabled: boolean;
  baseUrl: string;
  apiKey: string | null;
  model: string | null;
  requestTimeoutMs: number;
}

export type LocalAiLocalEnginePreference =
  | "auto"
  | "on_device"
  | "localhost_backend";

export interface LocalAiDeviceState {
  allowDownloads: boolean;
  wifiOnlyDownloads: boolean;
  storageBudgetMb: number;
  localEnginePreference: LocalAiLocalEnginePreference;
  preferStableBrowserRuntime: boolean;
  consentedModelIds: string[];
  installedModelIds: string[];
  lastCapabilityCheckAt: string | null;
  lastCapabilityReasons: string[];
  derivedArtifactRetentionMode: "session_only" | "until_cleared" | "ttl_24h";
  hiddenAfterSignOut: boolean;
  externalTextBackend: LocalAiExternalTextBackendConfig;
}

export interface LocalAiDeviceStateScope {
  tenantId: string | null;
  userId: string | null;
  runtimeNamespace: "web" | "tauri";
}

export const DEFAULT_LOCAL_AI_EXTERNAL_TEXT_BACKEND: Readonly<LocalAiExternalTextBackendConfig> = {
  enabled: false,
  baseUrl: "http://localhost:8000",
  apiKey: "local-dev-token",
  model: null,
  requestTimeoutMs: 30_000,
};

export const DEFAULT_LOCAL_AI_DEVICE_STATE: Readonly<LocalAiDeviceState> = {
  allowDownloads: false,
  wifiOnlyDownloads: true,
  storageBudgetMb: 4096,
  localEnginePreference: "auto",
  preferStableBrowserRuntime: true,
  consentedModelIds: [],
  installedModelIds: [],
  lastCapabilityCheckAt: null,
  lastCapabilityReasons: [],
  derivedArtifactRetentionMode: "until_cleared",
  hiddenAfterSignOut: false,
  externalTextBackend: {
    ...DEFAULT_LOCAL_AI_EXTERNAL_TEXT_BACKEND,
  },
};
