/**
 * @vitest-environment jsdom
 */
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const updatePreferencesMutate = vi.fn();
const mockAuthState = {
  user: {
    id: "user-1",
    currentTenantId: "tenant-1",
  },
  isAuthenticated: true,
};
const mockPrefsQuery = {
  data: {
    localAi: {
      enabled: false,
      mode: "off",
      voiceInputMode: "legacy_stt",
    },
  },
  refetch: vi.fn(),
};
const mockCatalog = [
  {
    id: "gemma4-e2b-web-fast",
    family: "gemma4",
    variant: "E2B",
    approximateSizeMb: 2004,
    status: "allowed",
    supportedPlatforms: ["web"],
    supportsVoiceInput: false,
  },
  {
    id: "gemma4-e4b-web-balanced",
    family: "gemma4",
    variant: "E4B",
    approximateSizeMb: 2964,
    status: "allowed",
    supportedPlatforms: ["web"],
    supportsVoiceInput: true,
  },
];
const mockPolicyQuery = {
  data: {
    policy: {
      state: "enabled",
    },
    catalog: mockCatalog,
  },
  isLoading: false,
};
const mockCapability = {
  supported: true,
  browserDeviceMemoryGb: 8,
  secureContext: true,
  webgpu: true,
  webgpuAdapterAvailable: true,
  webgpuAdapterLabel: "Intel(R) UHD Graphics 730",
  webgpuAdapterVendor: "Intel",
  webgpuSubgroupsFeatureAvailable: true,
  webgpuAdapterMaxBufferSizeMb: 4096,
  webgpuAdapterMaxStorageBufferBindingSizeMb: 4096,
  webgpuLowPowerAdapterAvailable: true,
  webgpuLowPowerAdapterLabel: "Intel(R) UHD Graphics 730",
  webgpuLowPowerAdapterVendor: "Intel",
  webgpuDeviceAvailable: true,
  webgpuDeviceMaxBufferSizeMb: 2048,
  webgpuDeviceMaxStorageBufferBindingSizeMb: 1024,
  webgpuRequestedDeviceAvailable: true,
  webgpuRequestedDeviceMaxBufferSizeMb: 3072,
  webgpuRequestedDeviceMaxStorageBufferBindingSizeMb: 2048,
  webgpuHighPerformanceAdapterAvailable: true,
  webgpuHighPerformanceAdapterLabel: "NVIDIA GeForce RTX",
  webgpuHighPerformanceAdapterVendor: "NVIDIA",
  webgpuHighPerformanceSubgroupsFeatureAvailable: true,
  webgpuHighPerformanceDeviceAvailable: true,
  webgpuHighPerformanceDeviceMaxBufferSizeMb: 4096,
  webgpuHighPerformanceDeviceMaxStorageBufferBindingSizeMb: 2048,
  webgpuHighPerformanceRequestedDeviceAvailable: true,
  webgpuHighPerformanceRequestedDeviceMaxBufferSizeMb: 4096,
  webgpuHighPerformanceRequestedDeviceMaxStorageBufferBindingSizeMb: 4096,
  eligibleProfiles: ["gemma4-e2b-web-fast"],
  eligibleVoiceProfiles: ["gemma4-e4b-web-balanced"],
  reasons: [],
};
const mockModelDownload = {
  action: null,
  status: "idle",
  reason: null,
  activeProfileId: null,
  downloadedBytes: 0,
  totalBytes: null,
  progressPercent: null,
  resumable: false,
  updatedAt: null,
  getSnapshot: () => ({
    action: null,
    status: "idle",
    reason: null,
    activeProfileId: null,
    downloadedBytes: 0,
    totalBytes: null,
    progressPercent: null,
    resumable: false,
    updatedAt: null,
  }),
  isModelInstalled: () => false,
  startDownload: vi.fn(),
  removeDownloadedModel: vi.fn(),
  cancelDownload: vi.fn(),
  resumeDownload: vi.fn(),
  retryDownload: vi.fn(),
  refreshRuntimeStatus: vi.fn(),
  verifyInstalledModel: vi.fn(),
  repairInstalledModel: vi.fn(),
  updateInstalledModel: vi.fn(),
};
const mockTauriRuntimeStatus = {
  available: false,
  supportsGemma4Text: false,
  supportsGemma4Voice: false,
  litertLmPath: null,
  bundledGemmaProfileIds: [],
  installedGemmaProfileIds: [],
  reason: null,
  bundleMode: "on-demand",
  runtimeRoot: null,
  managedModelRoot: null,
};
const mockVoiceAvailability = {
  supported: false,
  ready: false,
  reason: "browser_local_voice_unavailable",
};
const mockVoiceReadbackAvailability = {
  supported: true,
  backend: "browser",
  reason: null,
};

vi.mock("@/i18n/useScopedTranslation", () => ({
  useScopedTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      const values: Record<string, string> = {
        "settings.localAi.title": "Local AI",
        "settings.localAi.save": "Save Local AI preferences",
        "settings.localAi.helpButton": "Help",
        "settings.localAi.synced.title": "Synced account preferences",
        "settings.localAi.nav.account": "Account",
        "settings.localAi.nav.voice": "Voice",
        "settings.localAi.nav.device": "Device",
        "settings.localAi.nav.backend": "URL backend",
        "settings.localAi.nav.models": "Models",
        "settings.localAi.section.backend.title": "Local AI URL backend",
        "settings.localAi.section.backend.description":
          "Backend URL description",
        "settings.localAi.localEngine.title":
          "Choose the Local AI engine for this device",
        "settings.localAi.localEngine.description":
          "Choose whether this device should auto-pick, stay on on-device Gemma, or stay on the Local AI URL backend.",
        "settings.localAi.localEngine.label":
          "Local AI engine for this device",
        "settings.localAi.localEngine.options.auto": "Auto",
        "settings.localAi.localEngine.options.on_device": "On-device Gemma",
        "settings.localAi.localEngine.options.localhost_backend":
          "URL backend",
        "settings.localAi.localEngine.summaryTitle":
          "Current Local AI engine on this device",
        "settings.localAi.localEngine.summary.autoWithGemma":
          "Auto will use the prepared on-device Gemma path when it is the best Local AI option on this device.",
        "settings.localAi.localEngine.summary.autoWithBackend":
          `Auto will try the Local AI URL backend first: ${options?.baseUrl ?? ""} · ${options?.model ?? ""}`,
        "settings.localAi.localEngine.summary.onDevice":
          "This device is pinned to the on-device Gemma runtime for supported Local AI tasks.",
        "settings.localAi.localEngine.summary.localhostConfigured":
          `This device is pinned to the Local AI URL backend: ${options?.baseUrl ?? ""} · ${options?.model ?? ""}`,
        "settings.localAi.localEngine.summary.localhostNeedsConfig":
          "This device is pinned to the Local AI URL backend, but the backend URL still needs a valid configuration.",
        "settings.localAi.externalBackend.shortcut.title":
          "Use a Local AI URL backend instead of the Gemma model on this device?",
        "settings.localAi.externalBackend.shortcut.description":
          "Shortcut description",
        "settings.localAi.externalBackend.shortcut.button":
          "Open backend URL settings",
        "settings.localAi.externalBackend.shortcut.current":
          `Current Local AI backend: ${options?.baseUrl ?? ""} · ${options?.model ?? ""}`,
        "settings.localAi.externalBackend.shortcut.notConfigured":
          "No Local AI URL backend is configured yet.",
        "settings.localAi.externalBackend.shortcut.needsAttention":
          "The Local AI URL backend is enabled, but it still needs attention before Local AI can use it.",
        "settings.localAi.externalBackend.title":
          "Local AI URL backend",
        "settings.localAi.externalBackend.description":
          "Use an OpenAI-compatible multimodal backend on this device or your private LAN as the Local AI engine for this device.",
        "settings.localAi.externalBackend.enable":
          "Enable the Local AI URL backend on this device",
        "settings.localAi.externalBackend.localOnlyTitle":
          "This is part of Local AI, not your cloud provider list",
        "settings.localAi.externalBackend.localOnlyDescription":
          "Use this when you want a local backend on the same machine to replace on-device Gemma 4.",
        "settings.localAi.externalBackend.multimodalSupport":
          "Supported here: text chat, summaries, image understanding, OCR assist, and local-safe text skills when the backend accepts text and image_url content.",
        "settings.localAi.externalBackend.endpointHintTitle":
          "Expected endpoint",
        "settings.localAi.externalBackend.endpointHintDescription":
          "Point this at a service on this device or your private LAN that exposes an OpenAI-compatible chat completions endpoint and accepts text plus image_url parts.",
        "settings.localAi.externalBackend.baseUrl": "Base URL",
        "settings.localAi.externalBackend.baseUrlPlaceholder":
          "http://localhost:8000, http://127.0.0.1:8000, or http://192.168.1.50:1234",
        "settings.localAi.externalBackend.model": "Model name",
        "settings.localAi.externalBackend.modelPlaceholder":
          "HauhauCS/Gemma-4-E2B-Uncensored-HauhauCS-Aggressive:Q4_K_M",
        "settings.localAi.externalBackend.apiKey": "Bearer token",
        "settings.localAi.externalBackend.apiKeyPlaceholder":
          "local-dev-token",
        "settings.localAi.externalBackend.timeout": "Request timeout (ms)",
        "settings.localAi.externalBackend.loopbackOnly":
          "Use localhost, 127.0.0.1, ::1, or a private LAN IP such as 10.x.x.x, 172.16-31.x.x, or 192.168.x.x. Public internet hosts are not allowed here.",
        "settings.localAi.externalBackend.scopeNote":
          "This path is device-local only. It can replace on-device Gemma 4 for local text chat, summaries, image understanding, and local-safe text skills.",
        "settings.localAi.externalBackend.status.off": "Off",
        "settings.localAi.externalBackend.status.ready": "Configured",
        "settings.localAi.externalBackend.status.needsAttention":
          "Needs attention",
        "settings.localAi.externalBackend.test.button": "Test connection",
        "settings.localAi.externalBackend.reason.mixedContent":
          "This page is running on HTTPS, but the Local AI URL backend is still plain HTTP on your private network. Use HTTPS on the backend URL, or run SmartSpecPro in desktop/Tauri for this path.",
        "settings.localAi.runtime.stableBrowserRuntime":
          "Prefer the stable browser runtime",
        "settings.localAi.runtime.stableBrowserRuntimeHelp":
          "Stable runtime help",
        "settings.localAi.diagnostics.web.currentAdapter":
          "Browser default adapter",
        "settings.localAi.diagnostics.web.lowPowerAdapter":
          "Low-power adapter",
        "settings.localAi.diagnostics.web.highPerformanceAdapter":
          "High-performance adapter",
        "settings.localAi.diagnostics.web.adapterCandidates":
          `GPU candidates exposed to the browser: ${options?.count ?? ""}`,
        "settings.localAi.diagnostics.web.selectionStatus.nvidia_confirmed":
          "GPU selection status: the browser is already locked to NVIDIA for this page",
        "settings.localAi.diagnostics.web.selectionStatus.single_unknown":
          "GPU selection status: the browser currently exposes only one GPU candidate",
        "settings.localAi.diagnostics.web.selectionStatus.same_adapter":
          "GPU selection status: browser default, low-power, and high-performance resolve to the same adapter",
        "settings.localAi.diagnostics.web.selectionStatus.mismatch":
          "GPU selection status: browser default and high-performance adapters are different",
        "settings.localAi.diagnostics.web.deviceMemory":
          "Browser memory bucket",
        "settings.localAi.diagnostics.web.deviceMemoryValue":
          String(options?.value ?? ""),
        "settings.localAi.diagnostics.web.subgroupsFeature":
          "WGSL subgroup support",
        "settings.localAi.diagnostics.web.stableRuntime":
          "Stable browser runtime",
        "settings.localAi.diagnostics.web.runtimeRequestedMaxBufferSize":
          "runtime(requested).maxBufferSize",
        "settings.localAi.diagnostics.web.runtimeRequestedMaxStorageBufferBindingSize":
          "runtime(requested).maxStorageBufferBindingSize",
        "settings.localAi.diagnostics.web.adapterMaxBufferSize":
          "adapter.maxBufferSize",
        "settings.localAi.diagnostics.web.adapterMaxStorageBufferBindingSize":
          "adapter.maxStorageBufferBindingSize",
        "settings.localAi.diagnostics.web.deviceDefaultMaxBufferSize":
          "device(default).maxBufferSize",
        "settings.localAi.diagnostics.web.deviceDefaultMaxStorageBufferBindingSize":
          "device(default).maxStorageBufferBindingSize",
        "settings.localAi.diagnostics.web.currentMaxBuffer":
          "Default WebGPU max buffer",
        "settings.localAi.diagnostics.web.highPerformanceMaxBuffer":
          "High-performance WebGPU max buffer",
        "settings.localAi.diagnostics.web.adapterMismatch":
          "Adapter mismatch warning",
        "settings.localAi.diagnostics.web.singleAdapterExposed":
          "Single adapter exposed warning",
        "settings.localAi.diagnostics.web.defaultProbeNote":
          "Default probe note",
        "settings.localAi.diagnostics.web.warning.title":
          "Browser runtime notes",
        "settings.localAi.diagnostics.web.warning.powerPreferenceIgnored":
          "Chromium powerPreference hint note",
        "settings.localAi.diagnostics.web.warning.subgroupsEnabled":
          "Subgroups enabled note",
        "settings.localAi.diagnostics.web.warning.subgroupsDisabled":
          "Subgroups disabled note",
        "settings.localAi.models.summary.title": "Model fit overview",
        "settings.localAi.models.summary.storageTitle": "Storage",
        "settings.localAi.models.summary.runtimeTitle": "Runtime",
        "settings.localAi.models.summary.storageBudget":
          `Storage budget: ${options?.total ?? ""}`,
        "settings.localAi.models.summary.storageUsed":
          `Installed models use: ${options?.used ?? ""}`,
        "settings.localAi.models.summary.storageRemaining":
          `Remaining budget: ${options?.remaining ?? ""}`,
        "settings.localAi.models.backendAlternative.title":
          "Use a Local AI URL backend instead of downloading another Gemma model",
        "settings.localAi.models.backendAlternative.description":
          "If you already run a local multimodal backend on this machine, Local AI can use that backend instead of another on-device Gemma download for supported local tasks.",
        "settings.localAi.models.backendAlternative.button":
          "Open backend URL settings",
        "settings.localAi.models.quickFix.title":
          `Recommended next step for ${options?.profileId ?? ""}`,
        "settings.localAi.models.quickFix.nextStep": "Recommended next step",
        "settings.localAi.models.quickFix.storageRaise":
          `Increase storage to ${options?.total ?? ""} with extra ${options?.extra ?? ""}`,
        "settings.localAi.models.quickFix.storageRaiseButton":
          `Increase storage budget to ${options?.total ?? ""}`,
        "settings.localAi.models.quickFix.removeModelsHint":
          `Remove models first: ${options?.models ?? ""}`,
        "settings.localAi.models.quickFix.runtimeSingleAdapter":
          "Single adapter runtime guidance",
        "settings.localAi.models.quickFix.runtimeAdapterMismatch":
          "Adapter mismatch runtime guidance",
        "settings.localAi.models.quickFix.runtimeBrowserLimit":
          "Browser runtime limit guidance",
        "settings.localAi.models.quickFix.runtimeDesktopHint":
          "Desktop hint guidance",
        "settings.localAi.surfaceProfiles.blockerBadge.storage":
          "Storage blocked",
        "settings.localAi.surfaceProfiles.blockerBadge.runtime":
          "Runtime blocked",
        "settings.localAi.surfaceProfiles.blockerBadge.storage_and_runtime":
          "Storage + runtime blocked",
        "settings.localAi.surfaceProfiles.blockerBadge.risk": "Runtime risk",
        "settings.localAi.surfaceProfiles.blockerState.none":
          "No obvious blocker from storage or runtime diagnostics",
        "settings.localAi.toast.storageBudgetUpdated":
          `Storage budget updated to ${options?.value ?? ""} MB`,
        "settings.localAi.diagnostics.web.memoryDisclaimer":
          "Browser VRAM disclaimer",
      };
      if (key === "settings.localAi.policy.catalogReady") {
        return `Catalog ready: ${options?.count ?? 0}`;
      }
      return values[key] ?? key;
    },
  }),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => mockAuthState,
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    users: {
      getPreferences: {
        useQuery: () => mockPrefsQuery,
      },
      updatePreferences: {
        useMutation: () => ({
          mutate: updatePreferencesMutate,
          isPending: false,
        }),
      },
    },
    localAi: {
      getPolicyAndCatalog: {
        useQuery: () => mockPolicyQuery,
      },
    },
  },
}));

vi.mock("@/components/help/HelpButton", () => ({
  HelpButton: ({ label }: { label?: string }) => <button>{label ?? "Help"}</button>,
}));

vi.mock("../hooks/useLocalAiCapability", () => ({
  useLocalAiCapability: () => mockCapability,
}));

vi.mock("../hooks/useModelDownload", () => ({
  useModelDownload: () => mockModelDownload,
}));

vi.mock("../skills/useTauriLocalSkillRuntimeStatus", () => ({
  useTauriLocalSkillRuntimeStatus: () => mockTauriRuntimeStatus,
}));

vi.mock("../voice/localVoiceRuntime", () => ({
  getLocalVoiceRuntimeAvailability: () => mockVoiceAvailability,
}));

vi.mock("../voice/useLocalVoiceReadbackAvailability", () => ({
  useLocalVoiceReadbackAvailability: () => mockVoiceReadbackAvailability,
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import { LocalAiSettingsSection } from "./LocalAiSettingsSection";

function renderWithQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

describe("LocalAiSettingsSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    Object.defineProperty(window.navigator, "userAgent", {
      configurable: true,
      value:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
    });
  });

  it("renders the Local AI section", () => {
    renderWithQueryClient(<LocalAiSettingsSection />);

    expect(screen.getByTestId("local-ai-settings-section")).toBeTruthy();
    expect(screen.getByText("Local AI")).toBeTruthy();
  });

  it("saves synced local ai preferences", () => {
    renderWithQueryClient(<LocalAiSettingsSection />);

    fireEvent.click(screen.getByText("Save Local AI preferences"));

    expect(updatePreferencesMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        localAi: expect.objectContaining({
          mode: "off",
          voiceInputMode: "legacy_stt",
        }),
      }),
    );
  });

  it("shows current and high-performance webgpu adapters in diagnostics", () => {
    renderWithQueryClient(<LocalAiSettingsSection />);

    fireEvent.click(screen.getByText("Device"));

    expect(
      screen.getAllByText("Browser default adapter: Intel(R) UHD Graphics 730").length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText("Low-power adapter: Intel(R) UHD Graphics 730").length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText("High-performance adapter: NVIDIA GeForce RTX").length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText("runtime(requested).maxBufferSize: 4,096 MB").length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText(
        "runtime(requested).maxStorageBufferBindingSize: 4,096 MB",
      ).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByText("Prefer the stable browser runtime"),
    ).toBeTruthy();
    expect(
      screen.getAllByText("adapter.maxBufferSize: 4,096 MB").length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText(
        "adapter.maxStorageBufferBindingSize: 4,096 MB",
      ).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText("device(default).maxBufferSize: 2,048 MB").length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText(
        "device(default).maxStorageBufferBindingSize: 1,024 MB",
      ).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText("GPU candidates exposed to the browser: 2").length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText(
        "GPU selection status: browser default and high-performance adapters are different",
      ).length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByText("Default probe note").length).toBeGreaterThan(0);
    expect(screen.getByText("Adapter mismatch warning")).toBeTruthy();
    expect(screen.getByText("Browser runtime notes")).toBeTruthy();
    expect(
      screen.getByText("Chromium powerPreference hint note"),
    ).toBeTruthy();
    expect(screen.getByText("Subgroups disabled note")).toBeTruthy();
  });

  it("shows storage and runtime summary in the models panel", () => {
    renderWithQueryClient(<LocalAiSettingsSection />);

    fireEvent.click(screen.getByText("Models"));

    expect(screen.getByText("Model fit overview")).toBeTruthy();
    expect(screen.getByText("Storage budget: 4,096 MB")).toBeTruthy();
    expect(screen.getByText("Remaining budget: 4,096 MB")).toBeTruthy();
    expect(
      screen.getAllByText("runtime(requested).maxBufferSize: 4,096 MB").length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText(
        "runtime(requested).maxStorageBufferBindingSize: 4,096 MB",
      ).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByText("No obvious blocker from storage or runtime diagnostics"),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Use a Local AI URL backend instead of downloading another Gemma model",
      ),
    ).toBeTruthy();
    expect(screen.getAllByText("Open backend URL settings").length).toBeGreaterThan(0);
  });

  it("shows the Local AI URL backend form in the backend tab", () => {
    renderWithQueryClient(<LocalAiSettingsSection />);

    fireEvent.click(screen.getByRole("button", { name: "URL backend" }));

    expect(screen.getAllByText("Local AI URL backend").length).toBeGreaterThan(0);
    expect(
      screen.getByText("Current Local AI engine on this device"),
    ).toBeTruthy();
    expect(screen.getAllByText("Auto").length).toBeGreaterThan(0);
    expect(screen.getByText("Expected endpoint")).toBeTruthy();
    expect(screen.getByText("POST /v1/chat/completions")).toBeTruthy();
    expect(
      screen.getByPlaceholderText(
        "http://localhost:8000, http://127.0.0.1:8000, or http://192.168.1.50:1234",
      ),
    ).toBeTruthy();
    expect(
      screen.getByPlaceholderText(
        "HauhauCS/Gemma-4-E2B-Uncensored-HauhauCS-Aggressive:Q4_K_M",
      ),
    ).toBeTruthy();
    expect(screen.getByPlaceholderText("local-dev-token")).toBeTruthy();
    expect(screen.getByDisplayValue("30000")).toBeTruthy();
    expect(screen.getByText("Test connection")).toBeTruthy();
  });

  it("shows the current local engine summary in the account panel", () => {
    renderWithQueryClient(<LocalAiSettingsSection />);

    expect(
      screen.getByText("Choose the Local AI engine for this device"),
    ).toBeTruthy();
    expect(screen.getByText("Local AI engine for this device")).toBeTruthy();
    expect(screen.getByDisplayValue("Auto")).toBeTruthy();
    expect(
      screen.getByText("Current Local AI engine on this device"),
    ).toBeTruthy();
    expect(
      screen.getAllByText(
        "Auto will use the prepared on-device Gemma path when it is the best Local AI option on this device.",
      ).length,
    ).toBeTruthy();
    expect(screen.getAllByText("Open backend URL settings").length).toBeGreaterThan(0);
  });

  it("shows storage blocker guidance for larger models", () => {
    const originalLocalStorage = window.localStorage;
    window.localStorage.setItem(
      "smartspec.localAi.device:web:tenant-1:user-1",
      JSON.stringify({
        storageBudgetMb: 4096,
        installedModelIds: ["gemma4-e2b-web-fast"],
        consentedModelIds: [],
        allowDownloads: true,
        wifiOnlyDownloads: false,
      }),
    );

    renderWithQueryClient(<LocalAiSettingsSection />);

    fireEvent.click(screen.getByText("Models"));

    expect(screen.getByText("Storage blocked")).toBeTruthy();
    expect(
      screen.getByText("Increase storage budget to 5,120 MB"),
    ).toBeTruthy();
    expect(screen.getByText("Remove models first: gemma4-e2b-web-fast")).toBeTruthy();
    window.localStorage.clear();
  });
});
