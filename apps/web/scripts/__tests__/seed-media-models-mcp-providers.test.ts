import { describe, expect, it } from "vitest";

import { buildHiggsfieldCatalogMediaModels } from "../seed-media-models-mcp-providers";

describe("seed-media-models-mcp-providers", () => {
  it("includes Seedream 5.0 Pro as a Higgsfield MCP image model", () => {
    expect(buildHiggsfieldCatalogMediaModels()).toContainEqual(
      expect.objectContaining({
        modelId: "higgsfield/seedream_v5_pro",
        name: "Seedream 5.0 Pro (Higgsfield MCP)",
        modelType: "image",
        provider: "higgsfield",
        providerModelId: "seedream_v5_pro",
        toolName: "generate_image",
        argumentShape: "higgsfield.generate_image",
      })
    );
  });
});
