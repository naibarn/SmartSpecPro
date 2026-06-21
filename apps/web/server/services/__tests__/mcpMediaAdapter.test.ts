import { describe, expect, it } from "vitest";
import type { MediaTask } from "../mediaGenerationService";
import {
  buildMcpToolArguments,
  higgsfieldMediaRolesForReferenceImagesForTest,
  internalizeMcpProviderUrlsForTest,
  isMcpProviderAuthErrorForTest,
  parseMcpJsonResponse,
  sanitizeMcpConnectionErrorMessageForTest,
} from "../mcpMediaAdapter";

describe("mcpMediaAdapter", () => {
  it("normalizes Magnific image resolution values to provider-native lowercase", () => {
    expect(buildMcpToolArguments("image", "A clean product photo", {
      aspectRatio: "9:16",
      numImages: 1,
      resolution: "1K",
    }, "magnific")).toEqual({
      prompt: "A clean product photo",
      aspectRatio: "9:16",
      count: 1,
      resolution: "1k",
    });
  });

  it("builds Higgsfield image generation arguments with params wrapper", () => {
    expect(buildMcpToolArguments("image", "A clean product photo", {
      aspectRatio: "1:1",
      numImages: 1,
      providerModelId: "z_image",
    }, "higgsfield")).toEqual({
      params: {
        model: "z_image",
        prompt: "A clean product photo",
        count: 1,
        aspect_ratio: "1:1",
      },
    });
  });

  it("normalizes Higgsfield image resolution values to provider-native lowercase", () => {
    expect(buildMcpToolArguments("image", "A clean product photo", {
      aspectRatio: "9:16",
      numImages: 1,
      providerModelId: "nano_banana_2",
      resolution: "2K",
    }, "higgsfield")).toMatchObject({
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
    expect(buildMcpToolArguments("image", "Use the reference character", {
      aspectRatio: "9:16",
      providerModelId: "nano_banana_2",
      referenceImageUrls: [
        "https://cdn.example.com/ref-1.png",
        "https://cdn.example.com/ref-2.png",
      ],
    }, "higgsfield")).toEqual({
      params: {
        model: "nano_banana_2",
        prompt: "Use the reference character",
        count: 1,
        aspect_ratio: "9:16",
      },
    });
  });

  it("passes imported Higgsfield media ids as medias", () => {
    expect(buildMcpToolArguments("image", "Use the reference character", {
      aspectRatio: "9:16",
      providerModelId: "nano_banana_2",
      medias: [
        { value: "media_1", role: "image" },
        { value: "media_2", role: "character" },
      ],
    }, "higgsfield")).toEqual({
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
    const characterUrl = "https://smartaihub.app/api/storage/files/character.png";

    expect(higgsfieldMediaRolesForReferenceImagesForTest(
      [productUrl, characterUrl],
      {
        referenceImageManifest: [
          { placeholder: "@Image1", role: "product", url: productUrl },
          { placeholder: "@Image2", role: "character", url: characterUrl },
        ],
      },
    )).toEqual(["image", "character"]);
  });

  it("builds Magnific MCP image arguments using mode and references schema", () => {
    expect(buildMcpToolArguments("image", "Use the reference product", {
      aspectRatio: "1:1",
      providerModelId: "gpt-2",
      references: [{ type: "image", identifier: "creation_123" }],
    }, "magnific")).toMatchObject({
      mode: "gpt-2",
      prompt: "Use the reference product",
      references: [{ type: "image", identifier: "creation_123" }],
    });
  });

  it("builds Higgsfield video generation arguments without image count", () => {
    expect(buildMcpToolArguments("video", "A cinematic product clip", {
      aspectRatio: "9:16",
      duration: 6,
      providerModelId: "seedance_2_0",
    }, "higgsfield", "higgsfield.generate_video")).toEqual({
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
      expect(buildMcpToolArguments("video", "A cinematic product clip", {
        providerModelId,
      }, "higgsfield", "higgsfield.generate_video")).toEqual({
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
      expect(buildMcpToolArguments("video", "A cinematic product clip", {
        providerModelId,
      }, "higgsfield", "higgsfield.generate_video")).toEqual({
        params: {
          model: providerModelId,
          prompt: "A cinematic product clip",
        },
      });
    }
  });

  it("classifies provider auth failures without hiding validation errors", () => {
    expect(isMcpProviderAuthErrorForTest(new Error(
      "MCP provider tool error: Error starting generation: Invalid or expired token Request ID: req_123",
    ))).toBe(true);
    expect(isMcpProviderAuthErrorForTest(new Error("MCP provider request failed: 401"))).toBe(true);
    expect(isMcpProviderAuthErrorForTest(new Error("MCP provider request failed: 403"))).toBe(true);
    expect(isMcpProviderAuthErrorForTest(new Error(
      'MCP provider tool error: Invalid request: resolution: value "2K" not in allowed options [1k, 2k, 4k]',
    ))).toBe(false);
    expect(isMcpProviderAuthErrorForTest(new Error("MCP error -32602: Tool images_generate not found"))).toBe(false);
  });

  it("stores a short redacted MCP connection auth error", () => {
    const sanitized = sanitizeMcpConnectionErrorMessageForTest(new Error(
      "MCP provider request failed: 401 Bearer abc.def.ghi access_token=secret-value-that-should-not-leak",
    ));

    expect(sanitized).toContain("401");
    expect(sanitized).toContain("Bearer [redacted]");
    expect(sanitized).toContain("accessToken [redacted]");
    expect(sanitized).not.toContain("abc.def.ghi");
    expect(sanitized.length).toBeLessThanOrEqual(128);
  });

  it("parses JSON and SSE JSON-RPC responses", () => {
    expect(parseMcpJsonResponse('{"jsonrpc":"2.0","result":{"ok":true}}')).toEqual({
      jsonrpc: "2.0",
      result: { ok: true },
    });
    expect(parseMcpJsonResponse(`event: message
data: {"jsonrpc":"2.0","result":{"ok":true}}
`)).toEqual({
      jsonrpc: "2.0",
      result: { ok: true },
    });
  });

  it("downloads provider output URLs into managed storage", async () => {
    const providerUrl = "https://provider.example/generated/output.png?token=temporary";
    const uploaded: Array<{ key: string; bytes: Buffer; contentType: string }> = [];
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
        fetchImpl: (async () => new Response(Buffer.from([1, 2, 3]), {
          headers: { "content-type": "image/png" },
        })) as typeof fetch,
        putObject: async (key, data, contentType) => {
          uploaded.push({ key, bytes: Buffer.from(data), contentType });
          return { key, url: `/api/storage/files/${encodeURIComponent(key)}` };
        },
      },
    });

    expect(result.urls).toEqual([expect.stringContaining("/api/storage/files/mcp-media%2Ftenant_1%2F42%2Fmcp_task_1%2Foutput-0-")]);
    expect(result.urls[0]).not.toBe(providerUrl);
    expect(uploaded).toHaveLength(1);
    expect(uploaded[0].key).toMatch(/^mcp-media\/tenant_1\/42\/mcp_task_1\/output-0-[a-f0-9]{12}\.png$/);
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
});
