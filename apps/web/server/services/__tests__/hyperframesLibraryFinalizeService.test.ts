import { beforeEach, describe, expect, it, vi } from "vitest";

import { HyperframesArtifactRefSchema } from "@shared/hyperframes/contracts";
import {
  HYPERFRAMES_LIBRARY_SOURCE,
  buildHyperframesLibrarySurfaceProjection,
  buildHyperframesLibraryFinalizeMetadata,
  finalizeHyperframesRenderToLibrary,
  hyperframesLibraryItemMatchesDiscovery,
} from "../hyperframesLibraryFinalizeService";

const createLibraryItemMock = vi.hoisted(() => vi.fn());

vi.mock("../libraryService", () => ({
  createLibraryItem: createLibraryItemMock,
}));

const payload = {
  productId: "product_1",
  compositionInputHash: "hf_input",
  compositionHtmlHash: "hf_html",
  templateId: "marketplace_storyboard_motion_9x9_v1",
  templateVersion: "1.0.0",
  templateContentHash: "hf_template",
  platformPresetId: "generic_vertical_9_16",
  platformPresetVersion: "1.0.0",
  renderIntent: "final",
  compositionMode: "captioned_final_composite",
  runtimeProfileHash: "hf_runtime",
  creativePlanHash: "hf_creative_plan",
  presetManifestHash: "hf_preset_manifest",
  audioEventMapHash: "hf_audio_event_map",
  fallbackQuality: "partial" as const,
  overlayPresetId: "electronics_spec_stack",
  subtitlePresetId: "karaoke_word",
  audioPackPresetId: "thai_marketplace_pack",
  musicPresetId: "premium_warm_bed",
  sfxPresetIds: ["whoosh_soft", "price_impact"],
  presetVersions: {
    electronics_spec_stack: "1.0.0",
    karaoke_word: "1.0.0",
    premium_warm_bed: "1.0.0",
  },
  playableProbe: {
    passed: true,
    durationSec: 72,
    hasVideo: true,
    hasAudio: true,
  },
  audioMixReport: {
    preserveNativeAudio: true,
    nativeInputWithAudioCount: 7,
    outputAudioPolicy: "preserve_native_or_silence",
  },
  launchMode: "auto_storyboard_review" as const,
  traceId: "trace_1",
  correlationId: "corr_1",
};

describe("hyperframesLibraryFinalizeService", () => {
  beforeEach(() => {
    createLibraryItemMock.mockReset();
  });

  it("builds required Library metadata and idempotency key", () => {
    const metadata = buildHyperframesLibraryFinalizeMetadata({
      auth: { userId: 1, tenantId: "tenant_1" },
      productId: "product_1",
      runId: "mar_1",
      renderJobId: "hf_render_1",
      payload,
      outputArtifactRef: HyperframesArtifactRefSchema.parse({
        artifactId: "output_1",
        kind: "hyperframes_render_mp4",
        storageRef: "marketplace-auto-review/tenant_1/mar_1/hyperframes/hf_render_1/output.mp4",
        contentHash: "hf_output",
        mimeType: "video/mp4",
        retentionClass: "library",
        redacted: true,
      }),
      qaStatus: "passed",
    });

    expect(metadata.source).toBe("marketplace_auto_review_hyperframes_render");
    expect(metadata.idempotencyKey).toBe(
      "hyperframes-library:tenant_1:mar_1:final:hf_input:hf_output"
    );
    expect(metadata).toMatchObject({
      compositionMode: "captioned_final_composite",
      templateContentHash: "hf_template",
      runtimeProfileHash: "hf_runtime",
      creativePlanHash: "hf_creative_plan",
      presetManifestHash: "hf_preset_manifest",
      audioEventMapHash: "hf_audio_event_map",
      fallbackQuality: "partial",
      overlayPresetId: "electronics_spec_stack",
      subtitlePresetId: "karaoke_word",
      audioPackPresetId: "thai_marketplace_pack",
      musicPresetId: "premium_warm_bed",
      sfxPresetIds: ["whoosh_soft", "price_impact"],
      hasAudio: true,
      hasNativeAudio: true,
      outputHash: "hf_output",
    });
    expect(metadata.presetVersions).toMatchObject({
      electronics_spec_stack: "1.0.0",
      karaoke_word: "1.0.0",
    });
    expect(metadata.outputProbe).toMatchObject({
      passed: true,
      hasAudio: true,
    });
    expect(metadata.audioMixReport).toMatchObject({
      preserveNativeAudio: true,
      nativeInputWithAudioCount: 7,
    });
  });

  it("rejects mismatched finalize idempotency", () => {
    expect(() =>
      buildHyperframesLibraryFinalizeMetadata({
        auth: { userId: 1, tenantId: "tenant_1" },
        productId: "product_1",
        runId: "mar_1",
        renderJobId: "hf_render_1",
        payload,
        idempotencyKey: "wrong",
        outputArtifactRef: HyperframesArtifactRefSchema.parse({
          artifactId: "output_1",
          kind: "hyperframes_render_mp4",
          storageRef: "marketplace-auto-review/tenant_1/mar_1/hyperframes/hf_render_1/output.mp4",
          contentHash: "hf_output",
          mimeType: "video/mp4",
          retentionClass: "library",
          redacted: true,
        }),
        qaStatus: "passed",
      })
    ).toThrow(/idempotency/);
  });

  it("returns saved-to-library projection with artifact and content hash refs", async () => {
    createLibraryItemMock.mockResolvedValue({
      idempotent: false,
      item: { id: "library_1" },
    });
    const outputArtifactRef = HyperframesArtifactRefSchema.parse({
      artifactId: "output_1",
      kind: "hyperframes_render_mp4",
      storageRef:
        "marketplace-auto-review/tenant_1/mar_1/hyperframes/hf_render_1/output.mp4",
      contentHash: "hf_output",
      mimeType: "video/mp4",
      retentionClass: "library",
      redacted: true,
    });

    const result = await finalizeHyperframesRenderToLibrary({
      auth: { userId: 1, tenantId: "tenant_1" },
      productId: "product_1",
      runId: "mar_1",
      renderJobId: "hf_render_1",
      payload,
      outputArtifactRef,
      outputUrl: "https://cdn.example.test/output.mp4",
      thumbnailUrl: "https://cdn.example.test/output.jpg",
      qaStatus: "passed",
    });

    expect(result.render.status).toBe("saved_to_library");
    expect(result.render.outputRefs[0]).toMatchObject({
      kind: "library_item",
      contentHash: "hf_output",
      storageRef: outputArtifactRef.storageRef,
      thumbnailUrl: "https://cdn.example.test/output.jpg",
      libraryItemId: "library_1",
    });
    expect(result.render.artifactRefs[0]).toMatchObject({
      artifactId: "output_1",
      contentHash: "hf_output",
    });
  });

  it("projects finalized video into Library, Media History, Product Detail, and Video Editor surfaces", () => {
    const libraryItem = {
      id: "library_1",
      itemType: "video",
      source: HYPERFRAMES_LIBRARY_SOURCE,
      title: "Final marketplace render",
      sourceUrl: "https://cdn.example.com/final.mp4",
      thumbnailUrl: "https://cdn.example.com/final.jpg",
      metadata: {
        source: HYPERFRAMES_LIBRARY_SOURCE,
        productId: "product_1",
        runId: "mar_1",
        renderJobId: "hf_render_1",
        templateId: "marketplace_storyboard_motion_9x9_v1",
        platformPresetId: "generic_vertical_9_16",
      },
    };

    const projection = buildHyperframesLibrarySurfaceProjection({ libraryItem });

    expect(projection.discoverable).toBe(true);
    expect(projection.libraryCard).toMatchObject({
      playable: true,
      sourceBadge: "HyperFrames Marketplace Auto Review",
    });
    expect(projection.mediaHistoryFilter).toEqual({
      source: HYPERFRAMES_LIBRARY_SOURCE,
      productId: "product_1",
      runId: "mar_1",
      mediaKind: "video",
    });
    expect(projection.productDetailMediaPanel).toMatchObject({
      visible: true,
      productId: "product_1",
      runId: "mar_1",
    });
    expect(projection.videoEditorHandoff).toMatchObject({
      routePath: "/video-editor?libraryItemId=library_1",
      mediaKind: "video",
      sourceUrl: "https://cdn.example.com/final.mp4",
    });
    expect(
      hyperframesLibraryItemMatchesDiscovery({
        libraryItem,
        productId: "product_1",
        runId: "mar_1",
      })
    ).toBe(true);
    expect(
      hyperframesLibraryItemMatchesDiscovery({
        libraryItem,
        productId: "other_product",
      })
    ).toBe(false);
  });
});
