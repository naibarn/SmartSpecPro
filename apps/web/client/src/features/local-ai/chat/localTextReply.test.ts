/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  generateTauriLocalGeneralReply,
  isLocalTextRuntimeError,
} from "./localTextReply";

const mockGenerateTextWithBrowserLocalRuntime = vi.fn();
const mockDisposeBrowserLocalRuntime = vi.fn();
const mockExecuteTauriLocalGemmaTextStream = vi.fn();
const mockGetTauriLocalSkillRuntimeStatus = vi.fn();
const mockExecuteExternalLocalTextCompletion = vi.fn();
const mockReadConfiguredExternalLocalTextBackend = vi.fn();
const mockReadLocalAiDeviceState = vi.fn();
const mockWriteLocalAiDeviceState = vi.fn();

vi.mock("../adapters/browserLocalRuntime", () => ({
  generateTextWithBrowserLocalRuntime: (...args: unknown[]) =>
    mockGenerateTextWithBrowserLocalRuntime(...args),
  disposeBrowserLocalRuntime: (...args: unknown[]) =>
    mockDisposeBrowserLocalRuntime(...args),
  isBrowserLocalRuntimeAbortError: vi.fn(() => false),
  isBrowserLocalRuntimeRetryableError: vi.fn(() => false),
}));

vi.mock("../skills/tauriSkillRuntime", () => ({
  executeTauriLocalGemmaTextStream: (...args: unknown[]) =>
    mockExecuteTauriLocalGemmaTextStream(...args),
  getTauriLocalSkillRuntimeStatus: (...args: unknown[]) =>
    mockGetTauriLocalSkillRuntimeStatus(...args),
  isTauriLocalRuntimeAbortError: vi.fn(() => false),
}));

vi.mock("../adapters/externalLocalTextBackend", () => ({
  executeExternalLocalTextCompletion: (...args: unknown[]) =>
    mockExecuteExternalLocalTextCompletion(...args),
  readConfiguredExternalLocalTextBackend: (...args: unknown[]) =>
    mockReadConfiguredExternalLocalTextBackend(...args),
  readLocalAiLocalEnginePreference: (scope?: {
    runtimeNamespace?: "web" | "tauri";
  } | null) =>
    mockReadLocalAiDeviceState(scope ?? null).localEnginePreference ?? "auto",
  EXTERNAL_LOCAL_TEXT_BACKEND_PROVIDER: "openai_compatible_local",
  shouldAllowExternalLocalBackend: (preference: string) =>
    preference !== "on_device",
  shouldAllowOnDeviceLocalEngine: (preference: string) =>
    preference !== "localhost_backend",
  isExternalLocalTextBackendAbortError: vi.fn(() => false),
}));

vi.mock("../state/localAiDeviceStateStorage", () => ({
  readLocalAiDeviceState: (...args: unknown[]) =>
    mockReadLocalAiDeviceState(...args),
  writeLocalAiDeviceState: (...args: unknown[]) =>
    mockWriteLocalAiDeviceState(...args),
}));

describe("localTextReply", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReadConfiguredExternalLocalTextBackend.mockReturnValue(null);
    mockGetTauriLocalSkillRuntimeStatus.mockResolvedValue({
      supportsGemma4Text: false,
      installedGemmaProfileIds: [],
    });
    mockReadLocalAiDeviceState.mockReturnValue({
      installedModelIds: [],
      localEnginePreference: "auto",
      preferStableBrowserRuntime: true,
    });
    mockDisposeBrowserLocalRuntime.mockResolvedValue(undefined);
    mockWriteLocalAiDeviceState.mockImplementation(
      (_scope: unknown, patch: Record<string, unknown>) => patch,
    );
  });

  it("prefers the configured external local text backend before embedded runtimes", async () => {
    mockReadConfiguredExternalLocalTextBackend.mockReturnValue({
      baseUrl: "http://localhost:8000",
      apiKey: "local-dev-token",
      model: "HauhauCS/Gemma-4-E2B",
      requestTimeoutMs: 30000,
    });
    mockExecuteExternalLocalTextCompletion.mockResolvedValue({
      text: "สวัสดี ผมพร้อมช่วยบนเครื่องนี้",
      model: "HauhauCS/Gemma-4-E2B",
      provider: "openai_compatible_local",
    });

    const result = await generateTauriLocalGeneralReply({
      platform: "web",
      preferences: {
        enabled: true,
        mode: "prefer_local",
        defaultModelId: null,
        useForGeneralChat: true,
        useForSummaries: true,
        useForImageTasks: false,
        enableVoiceCommands: false,
        voiceInputMode: "legacy_stt",
        voiceReadbackMode: "off",
        voiceReadbackLanguage: null,
        voiceReadbackRate: 1,
        voiceReadbackOnlyForVoiceCommands: false,
        voiceSearchUsesLocation: false,
        handsFreeMode: "off",
        wakePhrase: null,
      },
      forceCloudOnly: false,
      catalog: [],
      capability: {
        supported: false,
        reasons: [],
        eligibleProfiles: [],
        eligibleVoiceProfiles: [],
      } as any,
      scope: {
        tenantId: "tenant-1",
        userId: "user-1",
        runtimeNamespace: "web",
      },
      recentMessages: [],
      userText: "สวัสดี",
    });

    expect(mockExecuteExternalLocalTextCompletion).toHaveBeenCalledTimes(1);
    expect(mockGenerateTextWithBrowserLocalRuntime).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      text: "สวัสดี ผมพร้อมช่วยบนเครื่องนี้",
      profileId: "HauhauCS/Gemma-4-E2B",
      provider: "openai_compatible_local",
      model: "HauhauCS/Gemma-4-E2B",
    });
  });

  it("skips the localhost backend when this device is pinned to on-device Gemma", async () => {
    mockReadConfiguredExternalLocalTextBackend.mockReturnValue({
      baseUrl: "http://localhost:8000",
      apiKey: "local-dev-token",
      model: "HauhauCS/Gemma-4-E2B",
      requestTimeoutMs: 30000,
    });
    mockReadLocalAiDeviceState.mockReturnValue({
      installedModelIds: ["gemma4-e2b-web-fast"],
      localEnginePreference: "on_device",
      preferStableBrowserRuntime: true,
    });
    mockGenerateTextWithBrowserLocalRuntime.mockResolvedValue({
      text: "ตอบจาก on-device Gemma",
      profileId: "gemma4-e2b-web-fast",
    });

    const result = await generateTauriLocalGeneralReply({
      platform: "web",
      preferences: {
        enabled: true,
        mode: "local_only",
        defaultModelId: "gemma4-e2b-web-fast",
        useForGeneralChat: true,
        useForSummaries: true,
        useForImageTasks: false,
        enableVoiceCommands: false,
        voiceInputMode: "legacy_stt",
        voiceReadbackMode: "off",
        voiceReadbackLanguage: null,
        voiceReadbackRate: 1,
        voiceReadbackOnlyForVoiceCommands: false,
        voiceSearchUsesLocation: false,
        handsFreeMode: "off",
        wakePhrase: null,
      },
      forceCloudOnly: false,
      catalog: [
        {
          id: "gemma4-e2b-web-fast",
          status: "allowed",
          supportedPlatforms: ["web"],
        },
      ] as any,
      capability: {
        supported: true,
        reasons: [],
        eligibleProfiles: ["gemma4-e2b-web-fast"],
        eligibleVoiceProfiles: [],
      } as any,
      scope: {
        tenantId: "tenant-1",
        userId: "user-1",
        runtimeNamespace: "web",
      },
      recentMessages: [],
      userText: "ทดสอบ on-device",
    });

    expect(mockExecuteExternalLocalTextCompletion).not.toHaveBeenCalled();
    expect(mockGenerateTextWithBrowserLocalRuntime).toHaveBeenCalledTimes(1);
    expect(result?.text).toBe("ตอบจาก on-device Gemma");
  });

  it("does not fall back to on-device Gemma when localhost backend is selected explicitly", async () => {
    mockReadConfiguredExternalLocalTextBackend.mockReturnValue({
      baseUrl: "http://localhost:8000",
      apiKey: "local-dev-token",
      model: "HauhauCS/Gemma-4-E2B",
      requestTimeoutMs: 30000,
    });
    mockReadLocalAiDeviceState.mockReturnValue({
      installedModelIds: ["gemma4-e2b-web-fast"],
      localEnginePreference: "localhost_backend",
      preferStableBrowserRuntime: true,
    });
    mockExecuteExternalLocalTextCompletion.mockRejectedValue(
      new Error("external_local_backend_unreachable"),
    );

    await expect(
      generateTauriLocalGeneralReply({
        platform: "web",
        preferences: {
          enabled: true,
          mode: "local_only",
          defaultModelId: "gemma4-e2b-web-fast",
          useForGeneralChat: true,
          useForSummaries: true,
          useForImageTasks: false,
          enableVoiceCommands: false,
          voiceInputMode: "legacy_stt",
          voiceReadbackMode: "off",
          voiceReadbackLanguage: null,
          voiceReadbackRate: 1,
          voiceReadbackOnlyForVoiceCommands: false,
          voiceSearchUsesLocation: false,
          handsFreeMode: "off",
          wakePhrase: null,
        },
        forceCloudOnly: false,
        catalog: [
          {
            id: "gemma4-e2b-web-fast",
            status: "allowed",
            supportedPlatforms: ["web"],
          },
        ] as any,
        capability: {
          supported: true,
          reasons: [],
          eligibleProfiles: ["gemma4-e2b-web-fast"],
          eligibleVoiceProfiles: [],
        } as any,
        scope: {
          tenantId: "tenant-1",
          userId: "user-1",
          runtimeNamespace: "web",
        },
        recentMessages: [],
        userText: "ทดสอบ backend",
      }),
    ).rejects.toSatisfy((error: unknown) => {
      expect(isLocalTextRuntimeError(error)).toBe(true);
      expect((error as Error).message).toContain(
        "external_local_backend_unreachable",
      );
      return true;
    });
    expect(mockGenerateTextWithBrowserLocalRuntime).not.toHaveBeenCalled();
  });

  it("still attempts browser local text when an installed model exists even if capability probe is conservative", async () => {
    mockReadLocalAiDeviceState.mockReturnValue({
      installedModelIds: ["gemma4-e2b-web-fast"],
    });
    mockGenerateTextWithBrowserLocalRuntime.mockResolvedValue({
      text: "ตอบจากโมเดล local บนเว็บ",
      profileId: "gemma4-e2b-web-fast",
    });

    const result = await generateTauriLocalGeneralReply({
      platform: "web",
      preferences: {
        enabled: true,
        mode: "local_only",
        defaultModelId: "gemma4-e2b-web-fast",
        useForGeneralChat: true,
        useForSummaries: true,
        useForImageTasks: false,
        enableVoiceCommands: false,
        voiceInputMode: "legacy_stt",
        voiceReadbackMode: "off",
        voiceReadbackLanguage: null,
        voiceReadbackRate: 1,
        voiceReadbackOnlyForVoiceCommands: false,
        voiceSearchUsesLocation: false,
        handsFreeMode: "off",
        wakePhrase: null,
      },
      forceCloudOnly: false,
      catalog: [
        {
          id: "gemma4-e2b-web-fast",
          status: "allowed",
          supportedPlatforms: ["web"],
        },
      ] as any,
      capability: {
        supported: false,
        reasons: ["webgpu_device_unavailable"],
        eligibleProfiles: [],
        eligibleVoiceProfiles: [],
      } as any,
      scope: {
        tenantId: "tenant-1",
        userId: "user-1",
        runtimeNamespace: "web",
      },
      recentMessages: [],
      userText: "ทดสอบ local",
    });

    expect(mockGenerateTextWithBrowserLocalRuntime).toHaveBeenCalledTimes(1);
    expect(mockGenerateTextWithBrowserLocalRuntime).toHaveBeenCalledWith(
      expect.objectContaining({
        disableExperimentalSubgroups: true,
      }),
    );
    expect(result).toMatchObject({
      text: "ตอบจากโมเดล local บนเว็บ",
      profileId: "gemma4-e2b-web-fast",
    });
  });

  it("surfaces browser runtime failures when an installed browser model cannot start", async () => {
    mockReadLocalAiDeviceState.mockReturnValue({
      installedModelIds: ["gemma4-e2b-web-fast"],
    });
    mockGenerateTextWithBrowserLocalRuntime.mockRejectedValue(
      new Error("browser_model_not_cached"),
    );

    await expect(
      generateTauriLocalGeneralReply({
        platform: "web",
        preferences: {
          enabled: true,
          mode: "local_only",
          defaultModelId: "gemma4-e2b-web-fast",
          useForGeneralChat: true,
          useForSummaries: true,
          useForImageTasks: false,
          enableVoiceCommands: false,
          voiceInputMode: "legacy_stt",
          voiceReadbackMode: "off",
          voiceReadbackLanguage: null,
          voiceReadbackRate: 1,
          voiceReadbackOnlyForVoiceCommands: false,
          voiceSearchUsesLocation: false,
          handsFreeMode: "off",
          wakePhrase: null,
        },
        forceCloudOnly: false,
        catalog: [
          {
            id: "gemma4-e2b-web-fast",
            status: "allowed",
            supportedPlatforms: ["web"],
          },
        ] as any,
        capability: {
          supported: false,
          reasons: [],
          eligibleProfiles: [],
          eligibleVoiceProfiles: [],
        } as any,
        scope: {
          tenantId: "tenant-1",
          userId: "user-1",
          runtimeNamespace: "web",
        },
        recentMessages: [],
        userText: "ทดสอบ local",
      }),
    ).rejects.toSatisfy((error: unknown) => {
      expect(isLocalTextRuntimeError(error)).toBe(true);
      expect((error as Error).message).toBe("browser_model_not_cached");
      return true;
    });
  });

  it("retries once after an empty browser local response and succeeds after a runtime reset", async () => {
    mockReadLocalAiDeviceState.mockReturnValue({
      installedModelIds: ["gemma4-e2b-web-fast"],
    });
    mockGenerateTextWithBrowserLocalRuntime
      .mockResolvedValueOnce({
        text: "   ",
        profileId: "gemma4-e2b-web-fast",
      })
      .mockResolvedValueOnce({
        text: "ตอบจาก local browser หลังรีเซ็ต runtime",
        profileId: "gemma4-e2b-web-fast",
      });

    const result = await generateTauriLocalGeneralReply({
      platform: "web",
      preferences: {
        enabled: true,
        mode: "local_only",
        defaultModelId: "gemma4-e2b-web-fast",
        useForGeneralChat: true,
        useForSummaries: true,
        useForImageTasks: false,
        enableVoiceCommands: false,
        voiceInputMode: "legacy_stt",
        voiceReadbackMode: "off",
        voiceReadbackLanguage: null,
        voiceReadbackRate: 1,
        voiceReadbackOnlyForVoiceCommands: false,
        voiceSearchUsesLocation: false,
        handsFreeMode: "off",
        wakePhrase: null,
      },
      forceCloudOnly: false,
      catalog: [
        {
          id: "gemma4-e2b-web-fast",
          status: "allowed",
          supportedPlatforms: ["web"],
        },
      ] as any,
      capability: {
        supported: false,
        reasons: [],
        eligibleProfiles: [],
        eligibleVoiceProfiles: [],
      } as any,
      scope: {
        tenantId: "tenant-1",
        userId: "user-1",
        runtimeNamespace: "web",
      },
      recentMessages: [],
      userText: "ทดสอบ local",
    });

    expect(mockGenerateTextWithBrowserLocalRuntime).toHaveBeenCalledTimes(2);
    expect(mockDisposeBrowserLocalRuntime).toHaveBeenCalledTimes(1);
    expect(mockGenerateTextWithBrowserLocalRuntime).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        prompt: expect.stringContaining("[Current user message]"),
        maxTokens: 768,
        temperature: 0.2,
        topK: 32,
      }),
    );
    expect(mockGenerateTextWithBrowserLocalRuntime).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        prompt: expect.stringContaining("Do not include labels such as [Response]"),
        maxTokens: 512,
        temperature: 0.1,
        topK: 24,
      }),
    );
    expect(result).toMatchObject({
      text: "ตอบจาก local browser หลังรีเซ็ต runtime",
      profileId: "gemma4-e2b-web-fast",
    });
  });

  it("normalizes response labels and treats label-only output as empty before retrying", async () => {
    mockReadLocalAiDeviceState.mockReturnValue({
      installedModelIds: ["gemma4-e2b-web-fast"],
    });
    mockGenerateTextWithBrowserLocalRuntime
      .mockResolvedValueOnce({
        text: "[Response]",
        profileId: "gemma4-e2b-web-fast",
      })
      .mockResolvedValueOnce({
        text: "[Response] คำตอบหลัง retry",
        profileId: "gemma4-e2b-web-fast",
      });

    const result = await generateTauriLocalGeneralReply({
      platform: "web",
      preferences: {
        enabled: true,
        mode: "local_only",
        defaultModelId: "gemma4-e2b-web-fast",
        useForGeneralChat: true,
        useForSummaries: true,
        useForImageTasks: false,
        enableVoiceCommands: false,
        voiceInputMode: "legacy_stt",
        voiceReadbackMode: "off",
        voiceReadbackLanguage: null,
        voiceReadbackRate: 1,
        voiceReadbackOnlyForVoiceCommands: false,
        voiceSearchUsesLocation: false,
        handsFreeMode: "off",
        wakePhrase: null,
      },
      forceCloudOnly: false,
      catalog: [
        {
          id: "gemma4-e2b-web-fast",
          status: "allowed",
          supportedPlatforms: ["web"],
        },
      ] as any,
      capability: {
        supported: false,
        reasons: [],
        eligibleProfiles: [],
        eligibleVoiceProfiles: [],
      } as any,
      scope: {
        tenantId: "tenant-1",
        userId: "user-1",
        runtimeNamespace: "web",
      },
      recentMessages: [],
      userText: "อธิบายสั้น ๆ",
    });

    expect(mockGenerateTextWithBrowserLocalRuntime).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      text: "คำตอบหลัง retry",
      profileId: "gemma4-e2b-web-fast",
    });
  });

  it("retries with a shorter browser-local prompt when MediaPipe rejects the request as too long", async () => {
    mockReadLocalAiDeviceState.mockReturnValue({
      installedModelIds: ["gemma4-e2b-web-fast"],
    });
    mockGenerateTextWithBrowserLocalRuntime
      .mockRejectedValueOnce(
        new Error(
          "INVALID_ARGUMENT: Input is too long for the model to process: current_step(0) + input_size(512) was not less than maxTokens(512).",
        ),
      )
      .mockResolvedValueOnce({
        text: "คำตอบหลังลด context",
        profileId: "gemma4-e2b-web-fast",
      });

    const result = await generateTauriLocalGeneralReply({
      platform: "web",
      preferences: {
        enabled: true,
        mode: "local_only",
        defaultModelId: "gemma4-e2b-web-fast",
        useForGeneralChat: true,
        useForSummaries: true,
        useForImageTasks: false,
        enableVoiceCommands: false,
        voiceInputMode: "legacy_stt",
        voiceReadbackMode: "off",
        voiceReadbackLanguage: null,
        voiceReadbackRate: 1,
        voiceReadbackOnlyForVoiceCommands: false,
        voiceSearchUsesLocation: false,
        handsFreeMode: "off",
        wakePhrase: null,
      },
      forceCloudOnly: false,
      catalog: [
        {
          id: "gemma4-e2b-web-fast",
          status: "allowed",
          supportedPlatforms: ["web"],
        },
      ] as any,
      capability: {
        supported: false,
        reasons: [],
        eligibleProfiles: [],
        eligibleVoiceProfiles: [],
      } as any,
      scope: {
        tenantId: "tenant-1",
        userId: "user-1",
        runtimeNamespace: "web",
      },
      recentMessages: [
        {
          role: "assistant",
          content:
            "สรุปบริบทยาวมาก ".repeat(80),
        },
      ],
      userText: "ช่วยตอบสั้น ๆ ให้เข้าใจง่าย",
    });

    expect(mockGenerateTextWithBrowserLocalRuntime).toHaveBeenCalledTimes(2);
    expect(mockGenerateTextWithBrowserLocalRuntime).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        maxTokens: 768,
        prompt: expect.stringContaining("[Recent conversation]"),
      }),
    );
    expect(mockGenerateTextWithBrowserLocalRuntime).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        maxTokens: 512,
        prompt: expect.not.stringContaining("[Recent conversation]"),
      }),
    );
    expect(result).toMatchObject({
      text: "คำตอบหลังลด context",
      profileId: "gemma4-e2b-web-fast",
    });
  });

  it("surfaces a specific error after browser local response stays empty across retries", async () => {
    mockReadLocalAiDeviceState.mockReturnValue({
      installedModelIds: ["gemma4-e2b-web-fast"],
    });
    mockGenerateTextWithBrowserLocalRuntime.mockResolvedValue({
      text: " ",
      profileId: "gemma4-e2b-web-fast",
    });

    await expect(
      generateTauriLocalGeneralReply({
        platform: "web",
        preferences: {
          enabled: true,
          mode: "local_only",
          defaultModelId: "gemma4-e2b-web-fast",
          useForGeneralChat: true,
          useForSummaries: true,
          useForImageTasks: false,
          enableVoiceCommands: false,
          voiceInputMode: "legacy_stt",
          voiceReadbackMode: "off",
          voiceReadbackLanguage: null,
          voiceReadbackRate: 1,
          voiceReadbackOnlyForVoiceCommands: false,
          voiceSearchUsesLocation: false,
          handsFreeMode: "off",
          wakePhrase: null,
        },
        forceCloudOnly: false,
        catalog: [
          {
            id: "gemma4-e2b-web-fast",
            status: "allowed",
            supportedPlatforms: ["web"],
          },
        ] as any,
        capability: {
          supported: false,
          reasons: [],
          eligibleProfiles: [],
          eligibleVoiceProfiles: [],
        } as any,
        scope: {
          tenantId: "tenant-1",
          userId: "user-1",
          runtimeNamespace: "web",
        },
        recentMessages: [],
        userText: "ทดสอบ local",
      }),
    ).rejects.toSatisfy((error: unknown) => {
      expect(isLocalTextRuntimeError(error)).toBe(true);
      expect((error as { code?: string }).code).toBe(
        "browser_local_text_runtime_empty_response",
      );
      return true;
    });
    expect(mockGenerateTextWithBrowserLocalRuntime).toHaveBeenCalledTimes(2);
  });

  it("surfaces a specific local-only error when no prepared browser model is installed", async () => {
    mockReadLocalAiDeviceState.mockReturnValue({
      installedModelIds: [],
    });

    await expect(
      generateTauriLocalGeneralReply({
        platform: "web",
        preferences: {
          enabled: true,
          mode: "local_only",
          defaultModelId: null,
          useForGeneralChat: true,
          useForSummaries: true,
          useForImageTasks: false,
          enableVoiceCommands: false,
          voiceInputMode: "legacy_stt",
          voiceReadbackMode: "off",
          voiceReadbackLanguage: null,
          voiceReadbackRate: 1,
          voiceReadbackOnlyForVoiceCommands: false,
          voiceSearchUsesLocation: false,
          handsFreeMode: "off",
          wakePhrase: null,
        },
        forceCloudOnly: false,
        catalog: [
          {
            id: "gemma4-e2b-web-fast",
            status: "allowed",
            supportedPlatforms: ["web"],
          },
        ] as any,
        capability: {
          supported: false,
          reasons: [],
          eligibleProfiles: [],
          eligibleVoiceProfiles: [],
        } as any,
        scope: {
          tenantId: "tenant-1",
          userId: "user-1",
          runtimeNamespace: "web",
        },
        recentMessages: [],
        userText: "ทดสอบ local",
      }),
    ).rejects.toSatisfy((error: unknown) => {
      expect(isLocalTextRuntimeError(error)).toBe(true);
      expect((error as { code?: string }).code).toBe("browser_no_installed_model");
      return true;
    });
  });
});
