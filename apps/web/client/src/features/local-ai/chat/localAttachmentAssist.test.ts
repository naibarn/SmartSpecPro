import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_LOCAL_AI_SYNCED_PREFERENCES } from "../types/capability";
import { buildHybridAttachmentAssist } from "./localAttachmentAssist";

const {
  executeTauriLocalGemmaImageAnalysisMock,
  executeTauriLocalGemmaTextMock,
  generateTextWithBrowserLocalRuntimeMock,
  executeExternalLocalChatCompletionMock,
  executeExternalLocalTextCompletionMock,
  readConfiguredExternalLocalTextBackendMock,
  readLocalAiDeviceStateMock,
} = vi.hoisted(() => ({
  executeTauriLocalGemmaImageAnalysisMock: vi.fn(),
  executeTauriLocalGemmaTextMock: vi.fn(),
  generateTextWithBrowserLocalRuntimeMock: vi.fn(),
  executeExternalLocalChatCompletionMock: vi.fn(),
  executeExternalLocalTextCompletionMock: vi.fn(),
  readConfiguredExternalLocalTextBackendMock: vi.fn(() => null),
  readLocalAiDeviceStateMock: vi.fn(() => ({
    installedModelIds: [],
  })),
}));

vi.mock("../skills/tauriSkillRuntime", () => ({
  executeTauriLocalGemmaImageAnalysis: executeTauriLocalGemmaImageAnalysisMock,
  executeTauriLocalGemmaText: executeTauriLocalGemmaTextMock,
}));

vi.mock("../adapters/browserLocalRuntime", () => ({
  generateTextWithBrowserLocalRuntime:
    generateTextWithBrowserLocalRuntimeMock,
}));

vi.mock("../adapters/externalLocalTextBackend", () => ({
  executeExternalLocalChatCompletion: executeExternalLocalChatCompletionMock,
  executeExternalLocalTextCompletion: executeExternalLocalTextCompletionMock,
  readConfiguredExternalLocalTextBackend:
    readConfiguredExternalLocalTextBackendMock,
}));

vi.mock("../state/localAiDeviceStateStorage", () => ({
  readLocalAiDeviceState: readLocalAiDeviceStateMock,
}));

describe("buildHybridAttachmentAssist", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {
      location: {
        origin: "https://app.example.test",
      },
    });
    vi.stubGlobal("btoa", (value: string) =>
      Buffer.from(value, "binary").toString("base64"),
    );
    vi.stubGlobal("fetch", vi.fn());
    executeTauriLocalGemmaImageAnalysisMock.mockReset();
    executeTauriLocalGemmaTextMock.mockReset();
    generateTextWithBrowserLocalRuntimeMock.mockReset();
    executeExternalLocalChatCompletionMock.mockReset();
    executeExternalLocalTextCompletionMock.mockReset();
    readConfiguredExternalLocalTextBackendMock.mockReset();
    readConfiguredExternalLocalTextBackendMock.mockReturnValue(null);
    readLocalAiDeviceStateMock.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns on-device image understanding context for local-safe tauri image chat", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(new Blob(["image-binary"], { type: "image/png" }), {
        status: 200,
      }),
    );
    executeTauriLocalGemmaImageAnalysisMock.mockResolvedValue({
      success: true,
      profileId: "gemma4-e4b-tauri-balanced",
      text: "The image shows a restaurant dining area with a visible horizon.",
    });

    const result = await buildHybridAttachmentAssist({
      platform: "tauri",
      preferences: {
        ...DEFAULT_LOCAL_AI_SYNCED_PREFERENCES,
        enabled: true,
        useForImageTasks: true,
      },
      forceCloudOnly: false,
      catalog: [
        {
          id: "gemma4-e4b-tauri-balanced",
          family: "gemma4",
          variant: "E4B",
          supportedPlatforms: ["tauri"],
          runtimeFamily: "tauri-native",
          approximateSizeMb: 4200,
          downloadRequired: true,
          supportsVoiceInput: true,
          defaultVoiceInputMode: "gemma4_local",
          modalities: {
            text: true,
            image: true,
            audio: true,
            ocr: "conditional",
          },
          minimumRequirements: {
            requiresSecureContext: false,
            requiresWebGpu: false,
            requiredWebGpuFeatures: [],
          },
          integrity: {
            manifestVersion: 1,
            checksumSha256: "abc",
          },
          runtimeConfig: {
            tauri: {
              fromHuggingFaceRepo:
                "litert-community/gemma-4-E4B-it-litert-lm",
              modelFileName: "gemma-4-E4B-it.litertlm",
              cliBinaryName: "litert-lm",
            },
          },
          status: "allowed",
          statusReason: null,
        },
      ],
      tauriRuntimeStatus: {
        available: true,
        supportsScriptBundle: true,
        supportsGemma4Text: true,
        supportsGemma4Image: true,
        supportsGemma4Voice: true,
        nodePath: "/usr/bin/node",
        litertLmPath: "/usr/bin/litert-lm",
        runtimeRoot: "/tmp/local-ai",
        managedModelRoot: "/tmp/local-ai/models",
        bundleMode: "on-demand",
        gemmaProfileIds: ["gemma4-e4b-tauri-balanced"],
        bundledGemmaProfileIds: [],
        installedGemmaProfileIds: ["gemma4-e4b-tauri-balanced"],
        reason: null,
      },
      attachments: [
        {
          url: "/uploads/restaurant.png",
          fileType: "image/png",
          fileName: "restaurant.png",
        },
      ],
      userText: "อธิบายภาพนี้หน่อย",
      analyzeAttachmentAssist: vi.fn(),
    });

    expect(result).toMatchObject({
      localOnlyCompatible: true,
      runtimeMetadataHint: {
        source: "hybrid",
        taskClass: "image_understanding",
        profileId: "gemma4-e4b-tauri-balanced",
      },
    });
    expect(result?.providerContext).toContain("[On-device image understanding]");
    expect(result?.localReplyContext).toContain("restaurant dining area");
  });

  it("returns hybrid OCR context and disables local-only fallback for document flows", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(new Blob(["pdf-binary"], { type: "application/pdf" }), {
        status: 200,
      }),
    );
    executeTauriLocalGemmaTextMock.mockResolvedValue({
      success: true,
      profileId: "gemma4-e2b-tauri-fast",
      text: "Merchant: Esan Kitchen\nTotal: 480 THB\nLooks like a receipt.",
    });

    const analyzeAttachmentAssist = vi.fn().mockResolvedValue({
      kind: "extract_text",
      extractedText: "Esan Kitchen\nTotal 480 THB\nCash",
      extractor: "extract_text",
      caption: null,
      ocrText: "Esan Kitchen\nTotal 480 THB\nCash",
      warning: null,
      searchQuality: "full_text",
      metadata: {},
    });

    const result = await buildHybridAttachmentAssist({
      platform: "tauri",
      preferences: {
        ...DEFAULT_LOCAL_AI_SYNCED_PREFERENCES,
        enabled: true,
        useForImageTasks: true,
      },
      forceCloudOnly: false,
      catalog: [
        {
          id: "gemma4-e2b-tauri-fast",
          family: "gemma4",
          variant: "E2B",
          supportedPlatforms: ["tauri"],
          runtimeFamily: "tauri-native",
          approximateSizeMb: 2500,
          downloadRequired: true,
          supportsVoiceInput: true,
          defaultVoiceInputMode: "gemma4_local",
          modalities: {
            text: true,
            image: true,
            audio: true,
            ocr: "conditional",
          },
          minimumRequirements: {
            requiresSecureContext: false,
            requiresWebGpu: false,
            requiredWebGpuFeatures: [],
          },
          integrity: {
            manifestVersion: 1,
            checksumSha256: "abc",
          },
          runtimeConfig: {
            tauri: {
              fromHuggingFaceRepo:
                "litert-community/gemma-4-E2B-it-litert-lm",
              modelFileName: "gemma-4-E2B-it.litertlm",
              cliBinaryName: "litert-lm",
            },
          },
          status: "allowed",
          statusReason: null,
        },
      ],
      tauriRuntimeStatus: {
        available: true,
        supportsScriptBundle: true,
        supportsGemma4Text: true,
        supportsGemma4Image: true,
        supportsGemma4Voice: true,
        nodePath: "/usr/bin/node",
        litertLmPath: "/usr/bin/litert-lm",
        runtimeRoot: "/tmp/local-ai",
        managedModelRoot: "/tmp/local-ai/models",
        bundleMode: "on-demand",
        gemmaProfileIds: ["gemma4-e2b-tauri-fast"],
        bundledGemmaProfileIds: [],
        installedGemmaProfileIds: ["gemma4-e2b-tauri-fast"],
        reason: null,
      },
      attachments: [
        {
          url: "/uploads/receipt.pdf",
          fileType: "application/pdf",
          fileName: "receipt.pdf",
        },
      ],
      userText: "ช่วยอ่านใบเสร็จนี้ให้หน่อย",
      analyzeAttachmentAssist,
    });

    expect(analyzeAttachmentAssist).toHaveBeenCalledWith(
      expect.objectContaining({
        fileName: "receipt.pdf",
        mimeType: "application/pdf",
        mode: "extract_text",
      }),
    );
    expect(result).toMatchObject({
      localOnlyCompatible: false,
      localReplyContext: null,
      runtimeMetadataHint: {
        source: "hybrid",
        taskClass: "document_ocr",
        profileId: "gemma4-e2b-tauri-fast",
      },
    });
    expect(result?.providerContext).toContain("[Hybrid OCR pre-read]");
    expect(result?.providerContext).toContain("Merchant: Esan Kitchen");
  });

  it("uses the localhost multimodal backend for image understanding when configured", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(new Blob(["image-binary"], { type: "image/png" }), {
        status: 200,
      }),
    );
    readConfiguredExternalLocalTextBackendMock.mockReturnValue({
      baseUrl: "http://localhost:8000",
      apiKey: "local-dev-token",
      model: "HauhauCS/Gemma-4-E2B-Uncensored-HauhauCS-Aggressive:Q4_K_M",
      requestTimeoutMs: 30000,
    });
    executeExternalLocalChatCompletionMock.mockResolvedValue({
      text: "A mobile app screen showing a receipt summary and total amount.",
      model: "HauhauCS/Gemma-4-E2B-Uncensored-HauhauCS-Aggressive:Q4_K_M",
      provider: "openai_compatible_local",
    });

    const result = await buildHybridAttachmentAssist({
      platform: "web",
      preferences: {
        ...DEFAULT_LOCAL_AI_SYNCED_PREFERENCES,
        enabled: true,
        useForImageTasks: true,
      },
      forceCloudOnly: false,
      catalog: [],
      capability: {
        supported: false,
        secureContext: true,
        webgpu: false,
        webgpuAdapterAvailable: false,
        webgpuDeviceAvailable: false,
        browserDeviceMemoryGb: 8,
        eligibleProfiles: [],
        eligibleVoiceProfiles: [],
        reasons: [],
      },
      scope: {
        tenantId: "tenant-1",
        userId: "user-1",
        runtimeNamespace: "web",
      },
      tauriRuntimeStatus: {
        available: false,
        supportsScriptBundle: false,
        supportsGemma4Text: false,
        supportsGemma4Image: false,
        supportsGemma4Voice: false,
        nodePath: null,
        litertLmPath: null,
        runtimeRoot: null,
        managedModelRoot: null,
        bundleMode: "on-demand",
        gemmaProfileIds: [],
        bundledGemmaProfileIds: [],
        installedGemmaProfileIds: [],
        reason: null,
      },
      attachments: [
        {
          url: "/uploads/mobile-ui.png",
          fileType: "image/png",
          fileName: "mobile-ui.png",
        },
      ],
      userText: "ช่วยอธิบายภาพหน้าจอนี้ให้หน่อย",
      analyzeAttachmentAssist: vi.fn(),
    });

    expect(executeExternalLocalChatCompletionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({
          baseUrl: "http://localhost:8000",
        }),
        messages: expect.arrayContaining([
          expect.objectContaining({ role: "system" }),
          expect.objectContaining({
            role: "user",
            content: expect.arrayContaining([
              expect.objectContaining({ type: "text" }),
              expect.objectContaining({ type: "image_url" }),
            ]),
          }),
        ]),
      }),
    );
    expect(result).toMatchObject({
      localOnlyCompatible: true,
      runtimeMetadataHint: {
        source: "hybrid",
        taskClass: "image_understanding",
        profileId: "HauhauCS/Gemma-4-E2B-Uncensored-HauhauCS-Aggressive:Q4_K_M",
      },
    });
    expect(result?.providerContext).toContain("[Local AI multimodal backend]");
    expect(result?.providerContext).toContain("receipt summary");
  });
});
