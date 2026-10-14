import { describe, expect, it } from "vitest";

import {
  analyzeMiniAppVisualReferences,
  MiniAppGatewayVisionAdapterUnavailableError,
} from "../miniAppVisualBlueprint";

describe("analyzeMiniAppVisualReferences", () => {
  it("fails closed until visual input is supported by the Skill Gateway runtime", async () => {
    await expect(analyzeMiniAppVisualReferences({
      userId: 42,
      tenantId: "tenant-a",
      runId: "run-a",
      references: [{
        id: "shot-1",
        fileName: "dashboard.png",
        mimeType: "image/png",
        contentBase64: Buffer.from("fixture").toString("base64"),
      }],
    })).rejects.toBeInstanceOf(MiniAppGatewayVisionAdapterUnavailableError);
  });

  it("validates owner identity before reporting the missing Gateway capability", async () => {
    await expect(analyzeMiniAppVisualReferences({
      userId: 0,
      tenantId: "tenant-a",
      runId: "run-a",
      references: [{
        id: "shot-1",
        fileName: "dashboard.png",
        mimeType: "image/png",
        contentBase64: Buffer.from("fixture").toString("base64"),
      }],
    })).rejects.toThrow("MINI_APP_VISION_OWNER_REQUIRED");
  });
});
