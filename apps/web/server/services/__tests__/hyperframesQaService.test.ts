import { describe, expect, it } from "vitest";

import { buildHyperframesCompositionInput } from "../hyperframesCompositionService";
import { stageHyperframesAssets } from "../hyperframesAssetStagingService";
import {
  runHyperframesPostRenderQa,
  runHyperframesPreRenderQa,
} from "../hyperframesQaService";

describe("hyperframesQaService", () => {
  it("blocks stale composition hashes before render", () => {
    const composition = buildHyperframesCompositionInput({
      tenantId: "tenant_1",
      userId: 1,
      productId: "product_1",
      runId: "mar_1",
      productState: {
        selectedImageUrls: ["https://cdn.example.com/product.png"],
      },
    });
    const manifest = stageHyperframesAssets({
      composition,
      renderJobId: "hf_render_1",
    });
    const qa = runHyperframesPreRenderQa({
      composition,
      manifest,
      expectedInputHash: "hf_old",
    });

    expect(qa.status).toBe("failed");
    expect(qa.issues.map(issue => issue.code)).toContain("stale_input_hash");
  });

  it("marks QA-passed render output as library ready", () => {
    const qa = runHyperframesPostRenderQa({
      outputHash: "hf_output",
      playable: true,
      blankFrameRatio: 0,
      durationSeconds: 15,
      expectedDurationSeconds: 15,
      width: 1080,
      height: 1920,
      expectedWidth: 1080,
      expectedHeight: 1920,
      audioRequired: false,
    });

    expect(qa.status).toBe("passed");
    expect(qa.libraryReady).toBe(true);
  });
});
