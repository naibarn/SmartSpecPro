import { describe, expect, it } from "vitest";
import { listSpecialTieInModels } from "../verticalDramaSpecialModelCatalog";

describe("special model catalog", () => {
  it("returns separate image and video catalog arrays", async () => {
    const result = await listSpecialTieInModels({
      durationSeconds: 12,
      dialogueMode: "none",
      connectedMcpProviderKeys: new Set(["higgsfield", "magnific"]),
    });
    expect(Array.isArray(result.imageModels)).toBe(true);
    expect(Array.isArray(result.videoModels)).toBe(true);
    expect(result.imageModels.every(model => model.modelId && model.supportedAspectRatios)).toBe(true);
  });

  it("requires an active MCP provider key for MCP models while keeping gateway models", async () => {
    const result = await listSpecialTieInModels({
      durationSeconds: 12,
      dialogueMode: "none",
      connectedMcpProviderKeys: new Set(),
    });

    expect(result.imageModels.every(model => !/^(higgsfield|higgsfield-mcp|magnific-mcp)\//i.test(model.modelId))).toBe(true);
    expect(result.videoModels.every(model => !/^(higgsfield|higgsfield-mcp|magnific-mcp)\//i.test(model.modelId))).toBe(true);
  });
});
