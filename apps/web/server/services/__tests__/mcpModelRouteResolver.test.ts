import { describe, expect, it } from "vitest";

import { defaultMcpArgumentShape, resolveMcpRouteFromModelId } from "../mcpModelRouteResolver";

describe("resolveMcpRouteFromModelId", () => {
  it("routes higgsfield ids to the higgsfield MCP provider", () => {
    expect(resolveMcpRouteFromModelId("higgsfield/nano_banana_2")).toEqual({
      providerKey: "higgsfield",
      providerModelId: "nano_banana_2",
    });
    expect(resolveMcpRouteFromModelId("higgsfield-mcp/nano_banana_2")).toEqual({
      providerKey: "higgsfield",
      providerModelId: "nano_banana_2",
    });
  });

  it("routes magnific-mcp ids to the magnific MCP provider", () => {
    expect(resolveMcpRouteFromModelId("magnific-mcp/kling-v3-pro")).toEqual({
      providerKey: "magnific",
      providerModelId: "kling-v3-pro",
    });
  });

  // Regression: the bare `magnific` token used to resolve to the magnific MCP
  // provider, which forced the direct-REST `magnific/*` family (creditCost > 0,
  // `endpoint.submit` REST config, no `configJson.transport`) onto the MCP
  // transport at every id-shape-routing call site. The client never agreed —
  // it reads `configJson.transport` only — so those models rendered no MCP
  // picker, sent no mcpConnectionId, and hard-failed on VD surfaces.
  it("does NOT route the direct-REST magnific/* family to MCP", () => {
    expect(resolveMcpRouteFromModelId("magnific/image-relight")).toEqual({});
    expect(resolveMcpRouteFromModelId("magnific/upscaler")).toEqual({});
    expect(resolveMcpRouteFromModelId("MAGNIFIC/Image-Relight")).toEqual({});
  });

  it("ignores unknown providers and blank ids", () => {
    expect(resolveMcpRouteFromModelId("kie/veo3")).toEqual({});
    expect(resolveMcpRouteFromModelId("")).toEqual({});
    expect(resolveMcpRouteFromModelId(undefined)).toEqual({});
    expect(resolveMcpRouteFromModelId(null)).toEqual({});
  });

  it("keeps the provider-native model id intact when it contains slashes", () => {
    expect(resolveMcpRouteFromModelId("higgsfield/family/model")).toEqual({
      providerKey: "higgsfield",
      providerModelId: "family/model",
    });
  });
});

describe("defaultMcpArgumentShape", () => {
  it("still resolves shapes for the magnific MCP provider key", () => {
    // `magnific-mcp/*` resolves to providerKey "magnific", so the magnific
    // argument shapes must survive the bare-token removal above.
    expect(defaultMcpArgumentShape("magnific", "image")).toBe("magnific.images_generate");
    expect(defaultMcpArgumentShape("magnific", "video")).toBe("magnific.video_generate");
    expect(defaultMcpArgumentShape("higgsfield", "image")).toBe("higgsfield.generate_image");
    expect(defaultMcpArgumentShape("higgsfield", "video")).toBe("higgsfield.generate_video");
    expect(defaultMcpArgumentShape(undefined, "image")).toBeUndefined();
  });
});
