import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetMcpMediaTask = vi.fn();
const mockSubmitMcpMediaGeneration = vi.fn();
const mockResolveMediaTransport = vi.fn();
const mockCreateProviderManagedStorageDownloadRef = vi.fn();

vi.mock("../mcpMediaAdapter", () => ({
  getMcpMediaTask: (...args: unknown[]) => mockGetMcpMediaTask(...args),
  submitMcpMediaGeneration: (...args: unknown[]) =>
    mockSubmitMcpMediaGeneration(...args),
}));

vi.mock("../mediaTransportResolver", () => ({
  resolveMediaTransport: (...args: unknown[]) =>
    mockResolveMediaTransport(...args),
}));

vi.mock("../mcpDownloadBrokerService", () => ({
  createProviderManagedStorageDownloadRef: (...args: unknown[]) =>
    mockCreateProviderManagedStorageDownloadRef(...args),
}));

vi.mock("../enabledMediaModelSelection", () => ({
  inferMediaModelHintFromText: vi.fn(() => null),
  resolveEnabledMediaModelSelection: vi.fn(async () => ({
    ok: false,
    reasonCode: "media_model_not_enabled",
    message: "test selection disabled",
  })),
}));

vi.mock("../auditLogger", () => ({
  auditLogger: {
    log: vi.fn(),
  },
}));

vi.mock("../imagePromptSafetyService", () => ({
  isVerticalDramaImageRequest: vi.fn(() => false),
  prepareImagePromptSafety: vi.fn(async (input: { prompt: string }) => ({
    prompt: input.prompt.trim(),
    metadata: {
      checked: true,
      mode: "standard",
      skillId: "image-prompt-safety-rewriter",
      skillVersion: "1.0.0",
      riskLevel: "low",
      rewritten: false,
      fallback: false,
      blocked: false,
      originalPromptHash: "test-original",
      safePromptHash: "test-safe",
      changes: [],
      preservedIntent: [],
    },
  })),
}));

import { MediaGenerationService } from "../mediaGenerationService";

describe("MediaGenerationService MCP task polling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateProviderManagedStorageDownloadRef.mockImplementation(
      async (storageKey: string) => ({
        downloadRef: `broker-${storageKey}`,
        expiresInSeconds: 3600,
        fileName: storageKey.split("/").pop() || "reference.bin",
        contentType: "image/png",
      })
    );
    global.fetch = vi.fn(
      async () => new Response("{}", { status: 404 })
    ) as typeof fetch;
    mockResolveMediaTransport.mockImplementation(async input => ({
      transport: "mcp",
      tenantId: input.tenantId,
      originSurface: input.originSurface,
      assetType: input.assetType,
      actorUserId: input.actorUserId,
      ownerUserId: 1,
      connectionId: input.mcpConnectionId,
      sharedGroupId: input.sharedGroupId,
      shareId: "share-1",
      connectionScope: "shared",
      providerKey: input.providerKey,
      providerModelId: input.providerModelId,
      toolName: input.toolName,
      argumentShape: input.argumentShape,
      creditPolicy: "provider_credits_tracked",
      idempotencyKey: input.idempotencyKey,
    }));
  });

  it("loads MCP tasks through the MCP adapter instead of the gateway backend", async () => {
    mockGetMcpMediaTask.mockResolvedValueOnce({
      id: "mcp_task_1",
      taskId: "provider_task_1",
      userId: "109",
      mediaType: "image",
      status: "processing",
      model: "higgsfield/nano_banana_2",
      prompt: "prompt",
      parameters: {},
      creditsUsed: 0,
      createdAt: new Date().toISOString(),
    });

    const service = new MediaGenerationService("https://python.example");
    const task = await service.getTask("mcp_task_1", "user-token", {
      userId: 109,
      source: "marketplace_auto_review",
    });

    expect(task.id).toBe("mcp_task_1");
    expect(mockGetMcpMediaTask).toHaveBeenCalledWith(
      "mcp_task_1",
      109,
      undefined
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("requires authenticated user context for MCP task polling", async () => {
    const service = new MediaGenerationService("https://python.example");

    await expect(service.getTask("mcp_task_1", "user-token")).rejects.toThrow(
      "MCP task polling requires authenticated user context"
    );
    expect(mockGetMcpMediaTask).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("derives resultUrl from nested result_data for direct provider polling", async () => {
    global.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            id: "provider_task_1",
            task_id: "provider_task_1",
            user_id: "109",
            media_type: "image",
            status: "completed",
            model: "kie/gpt-image-2",
            prompt: "prompt",
            parameters: {},
            result_url: null,
            result_data: {
              image_url: "https://cdn.example.com/generated/image.png",
            },
            created_at: new Date().toISOString(),
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
    ) as typeof fetch;

    const service = new MediaGenerationService("https://python.example");
    const task = await service.getTask("provider_task_1", "user-token", {
      userId: 109,
      source: "video_studio_broll",
    });

    expect(task.resultUrl).toBe("https://cdn.example.com/generated/image.png");
  });

  it("keeps the requested MCP model instead of substituting a gateway API model", async () => {
    mockSubmitMcpMediaGeneration.mockResolvedValueOnce({
      id: "mcp_task_1",
      taskId: "provider_task_1",
      userId: "109",
      mediaType: "image",
      status: "processing",
      model: "higgsfield/nano_banana_2",
      prompt: "prompt",
      parameters: {},
      creditsUsed: 0,
      createdAt: new Date().toISOString(),
    });

    const service = new MediaGenerationService("https://python.example");
    await service.generateImageAsync(
      {
        prompt: "prompt",
        model: "higgsfield/nano_banana_2",
        transportMetadata: {
          transport: "mcp",
          tenantId: "tenant-1",
          actorUserId: 109,
          connectionId: "connection-1",
          providerKey: "higgsfield",
          providerModelId: "nano_banana_2",
          toolName: "generate_image",
          argumentShape: "higgsfield.generate_image",
          originSurface: "marketplace_capture",
          assetType: "image",
        },
        auditContext: {
          tenantId: "tenant-1",
          userId: 109,
          source: "marketplace_auto_review",
        },
      },
      "user-token"
    );

    expect(mockSubmitMcpMediaGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "higgsfield/nano_banana_2",
        metadata: expect.objectContaining({
          providerKey: "higgsfield",
          providerModelId: "nano_banana_2",
        }),
      })
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("passes reference image URLs and role manifest into MCP submissions", async () => {
    mockSubmitMcpMediaGeneration.mockResolvedValueOnce({
      id: "mcp_task_1",
      taskId: "provider_task_1",
      userId: "109",
      mediaType: "image",
      status: "processing",
      model: "higgsfield/nano_banana_2",
      prompt: "prompt",
      parameters: {},
      creditsUsed: 0,
      createdAt: new Date().toISOString(),
    });

    const service = new MediaGenerationService("https://python.example");
    await service.generateImageAsync(
      {
        prompt: "prompt",
        model: "higgsfield/nano_banana_2",
        aspectRatio: "9:16",
        resolution: "2K",
        publicUrl: "https://smartaihub.app",
        referenceImageUrls: [
          "/api/storage/files/product.webp",
          "/api/storage/files/character.png",
        ],
        extraParams: {
          referenceImageManifest: [
            {
              placeholder: "@Image1",
              role: "product",
              url: "https://smartaihub.app/api/storage/files/product.webp",
            },
            {
              placeholder: "@Image2",
              role: "character",
              url: "https://smartaihub.app/api/storage/files/character.png",
            },
          ],
        },
        transportMetadata: {
          transport: "mcp",
          tenantId: "tenant-1",
          actorUserId: 109,
          connectionId: "connection-1",
          providerKey: "higgsfield",
          providerModelId: "nano_banana_2",
          toolName: "generate_image",
          argumentShape: "higgsfield.generate_image",
          originSurface: "marketplace_capture",
          assetType: "image",
        },
        auditContext: {
          tenantId: "tenant-1",
          userId: 109,
          source: "marketplace_auto_review",
        },
      },
      "user-token"
    );

    expect(mockSubmitMcpMediaGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        parameters: expect.objectContaining({
          referenceImageUrls: [
            "https://smartaihub.app/api/mcp/downloads/broker-product.webp/product.webp",
            "https://smartaihub.app/api/mcp/downloads/broker-character.png/character.png",
          ],
          referenceImageManifest: [
            expect.objectContaining({
              placeholder: "@Image1",
              role: "product",
            }),
            expect.objectContaining({
              placeholder: "@Image2",
              role: "character",
            }),
          ],
          referenceImageCount: 2,
        }),
      })
    );
  });

  it("omits target character negative_prompt from MCP parameters", async () => {
    mockSubmitMcpMediaGeneration.mockResolvedValueOnce({
      id: "mcp_task_1",
      taskId: "provider_task_1",
      userId: "109",
      mediaType: "image",
      status: "processing",
      model: "gpt-image-2",
      prompt: "natural human portrait",
      parameters: {},
      creditsUsed: 0,
      createdAt: new Date().toISOString(),
    });

    const service = new MediaGenerationService("https://python.example");
    await service.generateImageAsync(
      {
        prompt: "natural human portrait",
        model: "gpt-image-2",
        negativePrompt: "plastic skin",
        characterPromptContext: {
          marker: "vertical_drama_character_v1",
          contractVersion: "vd_character_natural_human_v1",
          target: true,
          family: "gpt_image_2",
          maxPromptChars: 20_000,
          promptProfile: "rich",
        },
        transportMetadata: {
          transport: "mcp",
          tenantId: "tenant-1",
          actorUserId: 109,
          connectionId: "connection-1",
          providerKey: "kie_ai",
          providerModelId: "gpt-image-2",
          toolName: "generate_image",
          argumentShape: "kie_ai.generate_image",
          originSurface: "vertical_drama",
          assetType: "image",
        },
        auditContext: {
          tenantId: "tenant-1",
          userId: 109,
          source: "vertical_drama",
        },
      },
      "user-token"
    );

    const call = mockSubmitMcpMediaGeneration.mock.calls[0][0] as {
      parameters: Record<string, unknown>;
    };
    expect(call.parameters).not.toHaveProperty("negative_prompt");
    expect(call.parameters).not.toHaveProperty("negativePrompt");
  });
});
