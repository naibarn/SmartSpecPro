import { afterEach, describe, expect, it, vi } from "vitest";
import type { MediaTask } from "../mediaGenerationService";
import {
  buildMcpToolArguments,
  higgsfieldMediaRolesForReferenceImagesForTest,
  internalizeMcpProviderUrlsForTest,
  isMcpProviderAuthErrorForTest,
  parseMcpJsonResponse,
  prepareMcpToolArgumentsForTest,
  refreshMcpMediaTaskStatus,
  sanitizeMcpConnectionErrorMessageForTest,
  withCompletedProviderResultForTest,
} from "../mcpMediaAdapter";

describe("mcpMediaAdapter", () => {
  it("normalizes an already-completed MCP task from resultData", async () => {
    const result = await refreshMcpMediaTaskStatus({
      id: "mcp_completed_task",
      taskId: "provider_completed_task",
      userId: "1",
      mediaType: "image",
      status: "completed",
      model: "kie/gpt-image-2",
      prompt: "prompt",
      resultData: {
        imageUrl: "https://cdn.example.com/generated/image.png",
      },
      createdAt: new Date().toISOString(),
    });

    expect(result.resultUrl).toBe(
      "https://cdn.example.com/generated/image.png"
    );
  });

  it("normalizes Magnific image resolution values to provider-native lowercase", () => {
    expect(
      buildMcpToolArguments(
        "image",
        "A clean product photo",
        {
          aspectRatio: "9:16",
          numImages: 1,
          resolution: "1K",
        },
        "magnific"
      )
    ).toEqual({
      prompt: "A clean product photo",
      aspectRatio: "9:16",
      count: 1,
      resolution: "1k",
    });
  });

  it("builds Higgsfield image generation arguments with params wrapper", () => {
    expect(
      buildMcpToolArguments(
        "image",
        "A clean product photo",
        {
          aspectRatio: "1:1",
          numImages: 1,
          providerModelId: "z_image",
        },
        "higgsfield"
      )
    ).toEqual({
      params: {
        model: "z_image",
        prompt: "A clean product photo",
        count: 1,
        aspect_ratio: "1:1",
      },
    });
  });

  it("normalizes Higgsfield image resolution values to provider-native lowercase", () => {
    expect(
      buildMcpToolArguments(
        "image",
        "A clean product photo",
        {
          aspectRatio: "9:16",
          numImages: 1,
          providerModelId: "nano_banana_2",
          resolution: "2K",
        },
        "higgsfield"
      )
    ).toMatchObject({
      params: {
        model: "nano_banana_2",
        prompt: "A clean product photo",
        count: 1,
        aspect_ratio: "9:16",
        resolution: "2k",
      },
    });
  });

  it("does not pass raw reference image URLs through Higgsfield MCP params", () => {
    expect(
      buildMcpToolArguments(
        "image",
        "Use the reference character",
        {
          aspectRatio: "9:16",
          providerModelId: "nano_banana_2",
          referenceImageUrls: [
            "https://cdn.example.com/ref-1.png",
            "https://cdn.example.com/ref-2.png",
          ],
        },
        "higgsfield"
      )
    ).toEqual({
      params: {
        model: "nano_banana_2",
        prompt: "Use the reference character",
        count: 1,
        aspect_ratio: "9:16",
      },
    });
  });

  it("passes imported Higgsfield media ids as medias", () => {
    expect(
      buildMcpToolArguments(
        "image",
        "Use the reference character",
        {
          aspectRatio: "9:16",
          providerModelId: "nano_banana_2",
          medias: [
            { value: "media_1", role: "image" },
            { value: "media_2", role: "character" },
          ],
        },
        "higgsfield"
      )
    ).toEqual({
      params: {
        model: "nano_banana_2",
        prompt: "Use the reference character",
        count: 1,
        aspect_ratio: "9:16",
        medias: [
          { value: "media_1", role: "image" },
          { value: "media_2", role: "character" },
        ],
      },
    });
  });

  it("maps Higgsfield imported reference roles from the image manifest", () => {
    const productUrl = "https://smartaihub.app/api/storage/files/product.webp";
    const characterUrl =
      "https://smartaihub.app/api/storage/files/character.png";

    expect(
      higgsfieldMediaRolesForReferenceImagesForTest(
        [productUrl, characterUrl],
        {
          referenceImageManifest: [
            { placeholder: "@Image1", role: "product", url: productUrl },
            { placeholder: "@Image2", role: "character", url: characterUrl },
          ],
        }
      )
    ).toEqual(["image", "character"]);
  });

  it("builds Magnific MCP image arguments using mode and references schema", () => {
    expect(
      buildMcpToolArguments(
        "image",
        "Use the reference product",
        {
          aspectRatio: "1:1",
          providerModelId: "gpt-2",
          references: [{ type: "image", identifier: "creation_123" }],
        },
        "magnific"
      )
    ).toMatchObject({
      mode: "gpt-2",
      prompt: "Use the reference product",
      references: [{ type: "image", identifier: "creation_123" }],
    });
  });

  it("builds Higgsfield video generation arguments without image count", () => {
    expect(
      buildMcpToolArguments(
        "video",
        "A cinematic product clip",
        {
          aspectRatio: "9:16",
          duration: 6,
          providerModelId: "seedance_2_0",
        },
        "higgsfield",
        "higgsfield.generate_video"
      )
    ).toEqual({
      params: {
        model: "seedance_2_0",
        prompt: "A cinematic product clip",
        duration: 6,
        aspect_ratio: "9:16",
      },
    });
  });

  it("passes Higgsfield upstream video model ids through unchanged", () => {
    for (const providerModelId of [
      "seedance_2_0_fast",
      "kling3_0",
      "kling-3-motion-control",
      "happy-horse",
      "grok_video",
    ]) {
      expect(
        buildMcpToolArguments(
          "video",
          "A cinematic product clip",
          {
            providerModelId,
          },
          "higgsfield",
          "higgsfield.generate_video"
        )
      ).toEqual({
        params: {
          model: providerModelId,
          prompt: "A cinematic product clip",
        },
      });
    }
  });

  it("does not silently route Higgsfield Unlimited aliases to Seedance Fast", () => {
    for (const providerModelId of [
      "seedance_unlimited",
      "enhanced-seedance-2-fast-unlimited",
      "higgsfield/seedance_unlimited",
    ]) {
      expect(
        buildMcpToolArguments(
          "video",
          "A cinematic product clip",
          {
            providerModelId,
          },
          "higgsfield",
          "higgsfield.generate_video"
        )
      ).toEqual({
        params: {
          model: providerModelId,
          prompt: "A cinematic product clip",
        },
      });
    }
  });

  it("imports the start-frame + reference images as Higgsfield `medias` for a video generation request (regression: previously image-only, dropping every image from video submissions)", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            result: { mediaId: "media_abc123" },
          }),
          { status: 200 }
        )
    );
    vi.stubGlobal("fetch", fetchMock);

    try {
      const toolArguments = buildMcpToolArguments(
        "video",
        "A cinematic clip",
        {
          providerModelId: "grok_video",
        },
        "higgsfield",
        "higgsfield.generate_video"
      );

      const prepared = await prepareMcpToolArgumentsForTest({
        runtime: {
          mcpUrl: "https://mcp.example/higgsfield",
          accessToken: "token",
          tokenType: "bearer",
        },
        metadata: {
          transport: "mcp",
          originSurface: "media_studio",
          assetType: "video",
          providerKey: "higgsfield",
          toolName: "generate_video",
          creditPolicy: "provider_credits_tracked",
        },
        toolArguments,
        parameters: {
          providerModelId: "grok_video",
          referenceImageUrls: [
            "https://smartaihub.app/api/storage/files/start-frame.png",
          ],
        },
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(prepared).toMatchObject({
        params: {
          model: "grok_video",
          prompt: "A cinematic clip",
          medias: [{ value: "media_abc123", role: "image" }],
        },
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("leaves Higgsfield video arguments unchanged when there are no reference images to import", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    try {
      const toolArguments = buildMcpToolArguments(
        "video",
        "A cinematic clip",
        {
          providerModelId: "grok_video",
        },
        "higgsfield",
        "higgsfield.generate_video"
      );

      const prepared = await prepareMcpToolArgumentsForTest({
        runtime: {
          mcpUrl: "https://mcp.example/higgsfield",
          accessToken: "token",
          tokenType: "bearer",
        },
        metadata: {
          transport: "mcp",
          originSurface: "media_studio",
          assetType: "video",
          providerKey: "higgsfield",
          toolName: "generate_video",
          creditPolicy: "provider_credits_tracked",
        },
        toolArguments,
        parameters: { providerModelId: "grok_video" },
      });

      expect(fetchMock).not.toHaveBeenCalled();
      expect(prepared).toEqual(toolArguments);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("classifies provider auth failures without hiding validation errors", () => {
    expect(
      isMcpProviderAuthErrorForTest(
        new Error(
          "MCP provider tool error: Error starting generation: Invalid or expired token Request ID: req_123"
        )
      )
    ).toBe(true);
    expect(
      isMcpProviderAuthErrorForTest(
        new Error("MCP provider request failed: 401")
      )
    ).toBe(true);
    expect(
      isMcpProviderAuthErrorForTest(
        new Error("MCP provider request failed: 403")
      )
    ).toBe(false);
    expect(
      isMcpProviderAuthErrorForTest(
        new Error(
          "MCP provider tool error: seedream_v5_pro backend request failed (403): grace_daily_limit_reached"
        )
      )
    ).toBe(false);
    expect(
      isMcpProviderAuthErrorForTest(
        new Error("MCP provider request failed: 403 Invalid or expired token")
      )
    ).toBe(true);
    expect(
      isMcpProviderAuthErrorForTest(
        new Error(
          'MCP provider tool error: Invalid request: resolution: value "2K" not in allowed options [1k, 2k, 4k]'
        )
      )
    ).toBe(false);
    expect(
      isMcpProviderAuthErrorForTest(
        new Error("MCP error -32602: Tool images_generate not found")
      )
    ).toBe(false);
  });

  it("stores a short redacted MCP connection auth error", () => {
    const sanitized = sanitizeMcpConnectionErrorMessageForTest(
      new Error(
        "MCP provider request failed: 401 Bearer abc.def.ghi access_token=secret-value-that-should-not-leak"
      )
    );

    expect(sanitized).toContain("401");
    expect(sanitized).toContain("Bearer [redacted]");
    expect(sanitized).toContain("accessToken [redacted]");
    expect(sanitized).not.toContain("abc.def.ghi");
    expect(sanitized.length).toBeLessThanOrEqual(128);
  });

  it("parses JSON and SSE JSON-RPC responses", () => {
    expect(
      parseMcpJsonResponse('{"jsonrpc":"2.0","result":{"ok":true}}')
    ).toEqual({
      jsonrpc: "2.0",
      result: { ok: true },
    });
    expect(
      parseMcpJsonResponse(`event: message
data: {"jsonrpc":"2.0","result":{"ok":true}}
`)
    ).toEqual({
      jsonrpc: "2.0",
      result: { ok: true },
    });
  });

  it("downloads provider output URLs into managed storage", async () => {
    const providerUrl =
      "https://provider.example/generated/output.png?token=temporary";
    const uploaded: Array<{ key: string; bytes: Buffer; contentType: string }> =
      [];
    const task: MediaTask = {
      id: "mcp_task_1",
      taskId: "provider_task_1",
      userId: "42",
      mediaType: "image",
      status: "processing",
      model: "magnific-mcp/gpt-2",
      prompt: "A clean product photo",
      parameters: {},
      creditsUsed: 0,
      createdAt: new Date("2026-06-19T00:00:00.000Z").toISOString(),
    };

    const result = await internalizeMcpProviderUrlsForTest({
      urls: [providerUrl],
      task,
      metadata: {
        tenantId: "tenant_1",
        actorUserId: 42,
        ownerUserId: 7,
        providerKey: "magnific",
        assetType: "image",
      },
      deps: {
        fetchImpl: (async () =>
          new Response(Buffer.from([1, 2, 3]), {
            headers: { "content-type": "image/png" },
          })) as typeof fetch,
        putObject: async (key, data, contentType) => {
          uploaded.push({ key, bytes: Buffer.from(data), contentType });
          return { key, url: `/api/storage/files/${encodeURIComponent(key)}` };
        },
      },
    });

    expect(result.urls).toEqual([
      expect.stringContaining(
        "/api/storage/files/mcp-media%2Ftenant_1%2F42%2Fmcp_task_1%2Foutput-0-"
      ),
    ]);
    expect(result.urls[0]).not.toBe(providerUrl);
    expect(uploaded).toHaveLength(1);
    expect(uploaded[0].key).toMatch(
      /^mcp-media\/tenant_1\/42\/mcp_task_1\/output-0-[a-f0-9]{12}\.png$/
    );
    expect(uploaded[0].bytes).toEqual(Buffer.from([1, 2, 3]));
    expect(uploaded[0].contentType).toBe("image/png");
    expect(result.artifacts[0]).toMatchObject({
      sourceHost: "provider.example",
      storageKey: uploaded[0].key,
      url: result.urls[0],
      contentType: "image/png",
      byteSize: 3,
    });
  });

  /**
   * Regression test for the character-portrait / start-frame / angle-variation
   * / repair-image pollers all showing "generation succeeded but no result
   * URL found" even though the exact same completed task renders fine in the
   * Media History tab (`media.listTasks` -> `listMcpMediaTasks` ->
   * `rowToMediaTask`, which derives the top-level `resultUrl` fresh from
   * `resultData` on every DB read). Root cause: `withCompletedProviderResult`
   * (called by `refreshMcpMediaTaskStatus`) only set `resultUrl` inside the
   * nested `resultData` object, never at the top level of the returned
   * `MediaTask`. `getMcpMediaTask`'s in-memory fast path returns that object
   * directly once `status` is no longer "processing"/"pending" — bypassing
   * `rowToMediaTask` entirely — so every poller reading `task.resultUrl`
   * (the same top-level field the client always reads) saw `undefined` on a
   * `status: "completed"` task, while a fresh `listTasks` DB read of the
   * identical row showed the image correctly.
   */
  it("normalizes a completed MCP task's top-level resultUrl to match rowToMediaTask's derivation", async () => {
    // Inject the storage writer so this contract test does not depend on a
    // local-disk fallback; production always uses the R2-backed default.
    const providerOutputUrl =
      "https://d8j0ntlcm91z4.cloudfront.net/generated/output-0.png";
    const fetchMock = vi.fn(
      async () =>
        new Response(Buffer.from([1, 2, 3]), {
          headers: { "content-type": "image/png" },
        })
    );
    vi.stubGlobal("fetch", fetchMock);

    const task: MediaTask = {
      id: "mcp_test_task_regression_resulturl",
      taskId: "provider_job_1",
      userId: "1",
      mediaType: "image",
      status: "processing",
      model: "higgsfield/nano_banana_pro",
      prompt: "A character portrait",
      parameters: {
        transportMetadata: {
          tenantId: "tenant-ZCSKEM9s",
          actorUserId: 1,
          providerKey: "higgsfield",
        },
      },
      resultData: {},
      creditsUsed: 0,
      createdAt: new Date("2026-07-06T09:28:34.596Z").toISOString(),
      startedAt: new Date("2026-07-06T09:28:34.596Z").toISOString(),
    };

    // Real completed Higgsfield `job_status` responses report status +
    // output URLs together in one nested object — the exact shape
    // `collectProviderUrls`/`normalizeProviderStatus` scan.
    const providerStatusResult = {
      status: "completed",
      output: { imageUrl: providerOutputUrl },
    };

    try {
      const result = await withCompletedProviderResultForTest(
        task,
        providerStatusResult,
        {
          putObject: vi.fn(async (key) => ({
            key,
            url: `/api/storage/files/${key}`,
          })),
        },
      );

      expect(result.status).toBe("completed");
      expect(typeof result.resultData?.resultUrl).toBe("string");
      expect(result.resultData?.resultUrl).toBeTruthy();
      // The bug: `result.resultUrl` (top-level) used to be `undefined` even
      // though `result.resultData.resultUrl` (nested) was set correctly —
      // the History tab (which always re-derives resultUrl from resultData
      // via rowToMediaTask on every DB read) showed the image fine, while
      // every poller reading task.resultUrl directly did not. The two must
      // now match.
      expect(result.resultUrl).toBe(result.resultData?.resultUrl);
      expect(result.resultData?.imageUrl).toBe(result.resultData?.resultUrl);
    } finally {
      vi.unstubAllGlobals();
      // No local artifact is created because the storage writer is injected.
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });
});
