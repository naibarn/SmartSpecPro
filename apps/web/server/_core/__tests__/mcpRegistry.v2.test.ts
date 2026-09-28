import { describe, expect, it, vi } from "vitest";
import { executeMcpToolByName, getMcpRegistryTools } from "../mcpRegistry";

const {
  mockSearchLibraryItems,
  mockGenerateImageAsync,
  mockGenerateVideoAsync,
  mockListTasks,
  mockGetTask,
  mockDeductCredits,
  mockHasEnoughCredits,
} = vi.hoisted(() => ({
  mockSearchLibraryItems: vi.fn(async (input: any) => ({
    version: "library_search_v1",
    query: input.query ?? "",
    total: 1,
    limit: input.limit ?? 20,
    offset: input.offset ?? 0,
    has_more: false,
    results: [
      {
        item_id: 101,
        item_type: input.filters?.itemType ?? "image",
        title: "Sample Image",
        created_at: "2026-09-01T00:00:00.000Z",
      },
    ],
  })),
  mockGenerateImageAsync: vi.fn(async (_payload: any) => ({
    id: "task_img_mock_123",
    status: "processing",
  })),
  mockGenerateVideoAsync: vi.fn(async (_payload: any) => ({
    id: "task_vid_mock_456",
    status: "processing",
  })),
  mockListTasks: vi.fn(async () => ({
    tasks: [
      {
        id: "task_img_mock_123",
        mediaType: "image",
        status: "completed",
        model: "gpt-image-2-text-to-image",
        prompt: "A beautiful shampoo bottle on a marble countertop",
        createdAt: "2026-09-02T10:00:00.000Z",
        creditsUsed: 70,
      },
      {
        id: "task_vid_mock_456",
        mediaType: "video",
        status: "completed",
        model: "grok-imagine-video-1-5-preview",
        prompt: "A sports car accelerating on highway at sunset",
        createdAt: "2026-09-03T11:00:00.000Z",
        creditsUsed: 125,
      },
    ],
  })),
  mockGetTask: vi.fn(async (id: string) => ({
    id,
    mediaType: "image",
    status: "completed",
    model: "gpt-image-2-text-to-image",
    prompt: "A beautiful shampoo bottle on a marble countertop",
    createdAt: "2026-09-02T10:00:00.000Z",
    creditsUsed: 70,
    resultUrl: "/api/storage/files/123/shampoo.png",
  })),
  mockDeductCredits: vi.fn(async () => ({ success: true })),
  mockHasEnoughCredits: vi.fn(async () => true),
}));

vi.mock("../../services/libraryService", async () => {
  const actual = await vi.importActual<typeof import("../../services/libraryService")>("../../services/libraryService");
  return {
    ...actual,
    searchLibraryItems: (input: any, actor: any, dbClient?: any) => mockSearchLibraryItems(input, actor, dbClient),
  };
});

vi.mock("../../services/mediaGenerationService", () => ({
  mediaGenerationService: {
    generateImageAsync: (...args: any[]) => mockGenerateImageAsync(...args),
    generateVideoAsync: (...args: any[]) => mockGenerateVideoAsync(...args),
    listTasks: (...args: any[]) => mockListTasks(...args),
    getTask: (...args: any[]) => mockGetTask(...args),
  },
}));

vi.mock("../../services/creditService", async () => {
  const actual = await vi.importActual<typeof import("../../services/creditService")>("../../services/creditService");
  return {
    ...actual,
    hasEnoughCredits: (...args: any[]) => mockHasEnoughCredits(...args),
    deductCredits: (...args: any[]) => mockDeductCredits(...args),
    getCreditBalance: vi.fn(async () => 1000),
  };
});

vi.mock("../../services/tenantFeatureFlagService", async () => {
  const actual = await vi.importActual<typeof import("../../services/tenantFeatureFlagService")>("../../services/tenantFeatureFlagService");
  const flags = await vi.importActual<typeof import("../../../shared/featureFlags")>("../../../shared/featureFlags");
  return {
    ...actual,
    getTenantFeatureFlags: vi.fn(async () => ({
      ...flags.FEATURE_FLAG_DEFAULTS,
      mcpGuideToolAliasesEnabled: true,
      mcpResourcesEnabled: true,
      mcpModernProtocolEnabled: true,
      mcpLegacyCompatibilityEnabled: true,
    })),
  };
});

const session = {
  state: "ready" as const,
  authMode: "api_key" as const,
  tenantId: "tenant-1",
  userId: 1,
  apiKeyId: "key-1",
  scopes: ["mcp:read", "llm:chat", "remotion:read"],
  createdAt: new Date().toISOString(),
};

describe("MCP v2 registry metadata and aliases", () => {
  it("publishes safe guide aliases and output/schema metadata", () => {
    const tools = getMcpRegistryTools();
    const byName = new Map(tools.map((tool) => [tool.name, tool]));

    expect(byName.get("smartspec.media.generate_image")).toBeDefined();
    expect(byName.get("image.generate")?.name).toBe("image.generate");
    expect(byName.get("video.generate")?.name).toBe("video.generate");
    expect(byName.get("models.list")?.requiredScope).toBe("llm:chat");
    expect(byName.get("account.get_balance")?.requiredScope).toBe("llm:chat");
    expect(byName.get("credits.estimate")?.inputSchema).toBeDefined();
    expect(byName.get("render.get")?.inputSchema).toMatchObject({ required: ["kind", "job_id"] });
    expect(byName.get("render.list")?.inputSchema).toMatchObject({ required: ["kind"] });
    expect(byName.get("smartspec.media.generate_image")?.outputSchema).toBeDefined();
    expect(byName.get("smartspec.media.generate_image")?.schemaVersion).toBe("1");
  });

  it("guarantees every tool in listMcpToolsForSession has valid inputSchema of type object", async () => {
    const { listMcpToolsForSession } = await import("../mcpRegistry");
    const fullSession = {
      ...session,
      scopes: [
        "mcp:read",
        "mcp:write",
        "media:read",
        "media:generate",
        "knowledge:read",
        "knowledge:write",
        "library:search",
        "library:read",
        "llm:chat",
        "remotion:read",
        "agencies:invoke",
      ],
    };
    const { tools } = await listMcpToolsForSession({
      session: fullSession,
      delegatedManifest: null,
      idempotencyKey: null,
    });
    expect(tools.length).toBeGreaterThanOrEqual(50);
    for (const tool of tools) {
      expect(tool.inputSchema).toBeDefined();
      expect(typeof tool.inputSchema).toBe("object");
      expect((tool.inputSchema as any).type).toBe("object");
    }
  });

  it("estimates credits through the canonical service using the credits.estimate alias", async () => {
    const result = await executeMcpToolByName("credits.estimate", {
      prompt: "A short test prompt",
      model: "gpt-5.4-mini",
      max_output_tokens: 128,
    }, { session, delegatedManifest: null, idempotencyKey: null });

    expect(result.result).toMatchObject({
      model: "gpt-5.4-mini",
      estimated_output_tokens: 128,
      pricing_source: "server_model_catalog",
    });
    expect((result.result as any).estimated_credits).toBeGreaterThan(0);
  });

  it("requires an explicit remotion kind before a render alias can execute", async () => {
    await expect(executeMcpToolByName("render.get", { job_id: "job-1" }, {
      session,
      delegatedManifest: null,
      idempotencyKey: null,
    })).rejects.toMatchObject({ code: -32602 });
  });

  it("applies the canonical Remotion scope gate to render.list", async () => {
    await expect(executeMcpToolByName("render.list", { kind: "remotion" }, {
      session: { ...session, scopes: ["mcp:read"] },
      delegatedManifest: null,
      idempotencyKey: null,
    })).rejects.toMatchObject({ code: -32603 });
  });

  it("rejects unknown fields against the published tool schema", async () => {
    await expect(executeMcpToolByName("models.list", { unexpected: true }, {
      session,
      delegatedManifest: null,
      idempotencyKey: null,
    })).rejects.toMatchObject({ code: -32602 });
  });

  it("publishes complete inputSchema for smartspec.knowledge.library.search", () => {
    const tools = getMcpRegistryTools();
    const tool = tools.find((t) => t.name === "smartspec.knowledge.library.search");
    expect(tool).toBeDefined();
    expect(tool?.inputSchema).toMatchObject({
      type: "object",
      properties: expect.objectContaining({
        query: expect.any(Object),
        limit: expect.any(Object),
        offset: expect.any(Object),
        item_type: expect.any(Object),
        from_date: expect.any(Object),
        to_date: expect.any(Object),
        recent_days: expect.any(Object),
      }),
      additionalProperties: true,
    });
  });

  it("filters library items by type, date range, count, and query", async () => {
    const librarySession = {
      ...session,
      scopes: ["mcp:read", "library:search"],
    };

    // 1. Filter by item_type "image" and limit 10
    await executeMcpToolByName("smartspec.knowledge.library.search", {
      item_type: "image",
      limit: 10,
    }, { session: librarySession, delegatedManifest: null, idempotencyKey: null });

    expect(mockSearchLibraryItems).toHaveBeenLastCalledWith(
      expect.objectContaining({
        limit: 10,
        itemType: "image",
        filters: expect.objectContaining({
          itemType: "image",
        }),
      }),
      expect.anything(),
      undefined,
    );

    // 2. Filter using Thai alias "รูปภาพ" and camelCase itemType
    await executeMcpToolByName("smartspec.knowledge.library.search", {
      itemType: "รูปภาพ",
      from_date: "2026-08-01",
      to_date: "2026-09-01",
      recent_days: "7d",
      query: "logo",
    }, { session: librarySession, delegatedManifest: null, idempotencyKey: null });

    expect(mockSearchLibraryItems).toHaveBeenLastCalledWith(
      expect.objectContaining({
        query: "logo",
        itemType: "image",
        filters: expect.objectContaining({
          itemType: "image",
          fromDate: expect.any(Date),
          toDate: expect.any(Date),
          recentDays: 7,
        }),
      }),
      expect.anything(),
      undefined,
    );
  });

  it("supports smartaihub_library_search alias with rich nested filters and dual response", async () => {
    const librarySession = {
      ...session,
      tenantId: "tenant_secret_123",
      userId: 777,
      scopes: ["mcp:read", "library:search"],
    };

    mockSearchLibraryItems.mockResolvedValueOnce({
      results: [
        {
          item_id: 101,
          item_type: "video",
          title: "render.mp4",
          description: "Completed render",
          source_url: "https://example.com/render.mp4",
          thumbnail_url: null,
          status: "ready",
          source: "rendered",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          metadata: { mimeType: "video/mp4" },
        },
      ],
      total: 1,
      limit: 15,
      offset: 0,
      has_more: false,
    });

    const { result: response } = (await executeMcpToolByName("smartaihub_library_search", {
      // Trying to inject a different tenant_id to test tenant isolation
      tenant_id: "attacker_tenant",
      filters: {
        file_types: ["video"],
        mime_types: ["video/mp4"],
        extensions: [".mp4"],
        filename_contains: "render",
        folder_id: "folder_42",
        recursive: true,
        tags_all: ["campaign"],
        tags_any: ["advertisement"],
        source: ["rendered"],
        status: ["ready"],
        created_at: {
          from: "2026-09-01T00:00:00Z",
          to: "2026-09-03T23:59:59Z",
        },
        size_bytes: { min: 1000, max: 50000000 },
      },
      sort_by: "created_at",
      sort_order: "desc",
      page_size: 15,
      cursor: "0",
    }, { session: librarySession, delegatedManifest: null, idempotencyKey: null })) as any;

    // Verify tenant isolation: actor always receives session.tenantId, NOT args.tenant_id!
    expect(mockSearchLibraryItems).toHaveBeenLastCalledWith(
      expect.objectContaining({
        limit: 15,
        offset: 0,
        sortBy: "created_at",
        sortOrder: "desc",
        filters: expect.objectContaining({
          fileTypes: ["video"],
          mimeTypes: ["video/mp4"],
          extensions: [".mp4"],
          filenameContains: "render",
          folderId: 42,
          recursive: true,
          tagsAll: ["campaign"],
          tagsAny: ["advertisement"],
          source: ["rendered"],
          status: ["ready"],
          sizeBytes: { min: 1000, max: 50000000 },
        }),
      }),
      expect.objectContaining({
        tenantId: "tenant_secret_123",
        userId: 777,
      }),
      undefined,
    );

    // Verify dual output response: text content summary + structuredContent
    expect(response.content).toBeDefined();
    expect(response.content[0].text).toContain("พบไฟล์ 1 รายการ จากทั้งหมด 1 รายการ");
    expect(response.structuredContent).toBeDefined();
    expect(response.structuredContent.items[0].item_id).toBe(101);
    expect(response.structuredContent.items[0].resource_uri).toBe("smartaihub://library/items/101");
    expect(response.structuredContent.available_next_actions).toContain(
      "เปิด metadata (smartspec.knowledge.library.get หรือ smartaihub_library_get_file)"
    );
  });

  it("returns actionable structured error when an unsupported filter is provided", async () => {
    const librarySession = {
      ...session,
      scopes: ["mcp:read", "library:search"],
    };

    const { result: errorResult } = (await executeMcpToolByName("smartspec.knowledge.library.search", {
      filters: {
        duration_seconds: 120, // Unsupported filter
      },
    }, { session: librarySession, delegatedManifest: null, idempotencyKey: null })) as any;

    expect(errorResult.isError).toBe(true);
    expect(errorResult.content[0].text).toContain("ไม่รองรับ filter ชื่อ duration_seconds");
    expect(errorResult.structuredContent).toEqual(
      expect.objectContaining({
        error_code: "UNSUPPORTED_FILTER",
        message: "ไม่รองรับ filter ชื่อ duration_seconds",
        supported_filters: expect.arrayContaining([
          "file_types",
          "mime_types",
          "extensions",
          "filename_contains",
          "folder_id",
          "recursive",
          "tags_all",
          "tags_any",
          "source",
          "status",
          "created_at",
          "size_bytes",
        ]),
        example: {
          filters: {
            file_types: ["video"],
          },
        },
      })
    );
  });

  it("executes smartaihub_help tool for library search guidance", async () => {
    const { result: helpResult } = (await executeMcpToolByName("smartaihub_help", {
      topic: "library.search",
    }, { session, delegatedManifest: null, idempotencyKey: null })) as any;

    expect(helpResult.content[0].text).toContain("คุณกำลังเชื่อมต่อกับ SmartAIHub MCP Server");
    expect(helpResult.content[0].text).toContain("smartaihub_library_search");
    expect(helpResult.content[0].text).toContain("ห้ามส่ง tenant_id จากผู้ใช้โดยตรง");
    expect(helpResult.structuredContent.topic).toBe("library.search");
    expect(helpResult.structuredContent.resource_uri).toBe("smartaihub://help/library-search");
  });

  it("executes smartspec.media.models.list and smartaihub_media_models_list alias", async () => {
    const mediaSession = {
      ...session,
      scopes: ["mcp:read", "media:read"],
    };

    const { result } = (await executeMcpToolByName("smartaihub_media_models_list", {}, {
      session: mediaSession,
      delegatedManifest: null,
      idempotencyKey: null,
    })) as any;

    expect(result.content[0].text).toContain("โมเดลแนะนำยอดนิยม");
    expect(result.content[0].text).toContain("GPT Image 2");
    expect(result.content[0].text).toContain("Nano Banana 2 Lite");
    expect(result.content[0].text).toContain("Seedream 5.0 Pro");
    expect(result.content[0].text).toContain("Grok Imagine Video 1.5");
    expect(result.content[0].text).toContain("Veo 3.1 Lite");
    expect(result.content[0].text).toContain("Gemini Omni Flash 1.1");
    expect(result.structuredContent).toBeDefined();
  });

  it("executes smartaihub_help for media topics", async () => {
    const { result: genHelp } = (await executeMcpToolByName("smartaihub_help", {
      topic: "media.generate",
    }, { session, delegatedManifest: null, idempotencyKey: null })) as any;

    expect(genHelp.content[0].text).toContain("Media Studio Generation");
    expect(genHelp.content[0].text).toContain("GPT Image 2");
    expect(genHelp.content[0].text).toContain("Grok Imagine Video 1.5");
    expect(genHelp.structuredContent.topic).toBe("media.generate");
    expect(genHelp.structuredContent.recommended_image_models).toBeDefined();
    expect(genHelp.structuredContent.recommended_video_models).toBeDefined();

    const { result: histHelp } = (await executeMcpToolByName("smartaihub_help", {
      topic: "media.history",
    }, { session, delegatedManifest: null, idempotencyKey: null })) as any;
    expect(histHelp.content[0].text).toContain("Media History");
    expect(histHelp.structuredContent.supported_filters).toContain("query");
    expect(histHelp.structuredContent.supported_filters).toContain("model");
  });

  it("searches and filters media history with smartaihub_media_history_search", async () => {
    const mediaSession = {
      ...session,
      scopes: ["mcp:read", "media:read"],
    };

    const { result } = (await executeMcpToolByName("smartaihub_media_history_search", {
      query: "shampoo",
      media_type: "รูปภาพ",
      model: "gpt-image",
      limit: 10,
    }, {
      session: mediaSession,
      delegatedManifest: null,
      idempotencyKey: null,
    })) as any;

    expect(result.content[0].text).toContain("พบประวัติการสั่งสร้างสื่อ 1 รายการ");
    expect(result.content[0].text).toContain("shampoo");
    expect(result.structuredContent.tasks).toHaveLength(1);
    expect(result.structuredContent.tasks[0].id).toBe("task_img_mock_123");
    expect(result.structuredContent.tasks[0].resource_uri).toBe("smartaihub://media/tasks/task_img_mock_123");
    expect(result.structuredContent.applied_filters.media_type).toBe("image");
    expect(result.structuredContent.applied_filters.query).toBe("shampoo");
  });

  it("generates image with dynamic credits based on real model pricing", async () => {
    mockDeductCredits.mockClear();
    const mediaSession = {
      ...session,
      scopes: ["mcp:read", "mcp:write", "media:generate"],
    };

    const { result } = (await executeMcpToolByName("smartaihub_media_generate_image", {
      prompt: "A futuristic sports car in cyber city",
      model: "gpt-image-2-text-to-image",
    }, {
      session: mediaSession,
      delegatedManifest: null,
      idempotencyKey: "idem-img-1",
    })) as any;

    expect(result.content[0].text).toContain("สั่งสร้างรูปภาพสำเร็จ");
    expect(result.content[0].text).toContain("GPT Image 2");
    expect(result.structuredContent.task_id).toBe("task_img_mock_123");
    expect(result.structuredContent.credits_charged).toBe(70);

    // Verify deductCredits was called with 70 credits (matching web pricing), NOT 1
    expect(mockDeductCredits).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 70,
        sourceType: "media_image",
      }),
    );
  });

  it("generates video with dynamic credits based on real model pricing", async () => {
    mockDeductCredits.mockClear();
    const mediaSession = {
      ...session,
      scopes: ["mcp:read", "mcp:write", "media:generate"],
    };

    const { result } = (await executeMcpToolByName("smartaihub_media_generate_video", {
      prompt: "A drone flying over a tropical beach",
      model: "grok-imagine-video-1-5-preview",
      duration_seconds: 5,
    }, {
      session: mediaSession,
      delegatedManifest: null,
      idempotencyKey: "idem-vid-1",
    })) as any;

    expect(result.content[0].text).toContain("สั่งสร้างวิดีโอสำเร็จ");
    expect(result.content[0].text).toContain("Grok Imagine Video 1.5 Preview");
    expect(result.structuredContent.task_id).toBe("task_vid_mock_456");
    expect(result.structuredContent.credits_charged).toBe(125);

    // Verify deductCredits was called with 125 credits, NOT 2
    expect(mockDeductCredits).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 125,
        sourceType: "media_video",
      }),
    );
  });
});
