import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetMcpMediaTask = vi.fn();
const mockSubmitMcpMediaGeneration = vi.fn();
const mockResolveMediaTransport = vi.fn();

vi.mock("../mcpMediaAdapter", () => ({
  getMcpMediaTask: (...args: unknown[]) => mockGetMcpMediaTask(...args),
  submitMcpMediaGeneration: (...args: unknown[]) => mockSubmitMcpMediaGeneration(...args),
}));

vi.mock("../mediaTransportResolver", () => ({
  resolveMediaTransport: (...args: unknown[]) => mockResolveMediaTransport(...args),
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

import { MediaGenerationService } from "../mediaGenerationService";

describe("MediaGenerationService MCP task polling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn(async () => new Response("{}", { status: 404 })) as typeof fetch;
    mockResolveMediaTransport.mockImplementation(async (input) => ({
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
    expect(mockGetMcpMediaTask).toHaveBeenCalledWith("mcp_task_1", 109);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("requires authenticated user context for MCP task polling", async () => {
    const service = new MediaGenerationService("https://python.example");

    await expect(service.getTask("mcp_task_1", "user-token")).rejects.toThrow(
      "MCP task polling requires authenticated user context",
    );
    expect(mockGetMcpMediaTask).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
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
    await service.generateImageAsync({
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
    }, "user-token");

    expect(mockSubmitMcpMediaGeneration).toHaveBeenCalledWith(expect.objectContaining({
      model: "higgsfield/nano_banana_2",
      metadata: expect.objectContaining({
        providerKey: "higgsfield",
        providerModelId: "nano_banana_2",
      }),
    }));
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
    await service.generateImageAsync({
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
    }, "user-token");

    expect(mockSubmitMcpMediaGeneration).toHaveBeenCalledWith(expect.objectContaining({
      parameters: expect.objectContaining({
        referenceImageUrls: [
          "https://smartaihub.app/api/storage/files/product.webp",
          "https://smartaihub.app/api/storage/files/character.png",
        ],
        referenceImageManifest: [
          expect.objectContaining({ placeholder: "@Image1", role: "product" }),
          expect.objectContaining({ placeholder: "@Image2", role: "character" }),
        ],
        referenceImageCount: 2,
      }),
    }));
  });
});
