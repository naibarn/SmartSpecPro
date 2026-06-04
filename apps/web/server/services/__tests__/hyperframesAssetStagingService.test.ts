import { describe, expect, it } from "vitest";

import { buildHyperframesCompositionInput } from "../hyperframesCompositionService";
import {
  buildHyperframesTenantRunStoragePrefix,
  stageHyperframesAssets,
} from "../hyperframesAssetStagingService";

describe("hyperframesAssetStagingService", () => {
  it("stages owned assets into a tenant/run scoped manifest", () => {
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

    expect(manifest.artifactRef.kind).toBe("hyperframes_manifest");
    expect(manifest.assets[0]?.stagedRef).toContain(
      "marketplace-auto-review/tenant_1/mar_1/hyperframes/hf_render_1"
    );
    expect(manifest.cleanupPolicy.cleanupOnFailure).toBe(true);
  });

  it("rejects unsafe broad storage path identities", () => {
    expect(() =>
      buildHyperframesTenantRunStoragePrefix({
        tenantId: "../tenant",
        runId: "mar_1",
        renderJobId: "hf_render_1",
      })
    ).toThrow(/storage path/);
  });
});
