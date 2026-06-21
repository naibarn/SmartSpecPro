import { describe, expect, it } from "vitest";

import { defaultMcpToolNameForProvider } from "../mediaTransportResolver";

describe("mediaTransportResolver", () => {
  it("defaults Higgsfield MCP tools to provider-native tool names", () => {
    expect(
      defaultMcpToolNameForProvider({
        providerKey: "higgsfield",
        assetType: "image",
      })
    ).toBe("generate_image");
    expect(
      defaultMcpToolNameForProvider({
        providerKey: "higgsfield",
        assetType: "video",
      })
    ).toBe("generate_video");
  });

  it("keeps Magnific MCP default tool names provider-native", () => {
    expect(
      defaultMcpToolNameForProvider({
        providerKey: "magnific",
        assetType: "image",
      })
    ).toBe("images_generate");
    expect(
      defaultMcpToolNameForProvider({
        providerKey: "magnific",
        assetType: "video",
      })
    ).toBe("video_generate");
  });
});
