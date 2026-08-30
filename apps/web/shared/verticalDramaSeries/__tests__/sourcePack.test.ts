import { describe, expect, it } from "vitest";
import { getSeriesProfile } from "../seriesProfile";
import {
  buildSourcePackDigest,
  buildSourcePackBrollManifest,
  evaluateSourcePackReadiness,
  renderSourcePackDigestPromptBlock,
} from "../sourcePack";

describe("source pack contracts", () => {
  it("requires profile-specific source slots for review drafting", () => {
    const profile = getSeriesProfile("restaurant_review");
    const result = evaluateSourcePackReadiness({
      profile,
      slots: [],
      assets: [],
    });
    expect(result.draftReady).toBe(false);
    expect(result.blockingItems.filter(item => item.slotKey).map(item => item.slotKey)).toEqual([
      "venue_exterior",
      "venue_interior",
      "menu_dish",
    ]);
    expect(result.blockingItems.some(item => item.code === "reference_image_required")).toBe(true);
  });

  it("requires one attached image for visual-first profiles but accepts it when present", () => {
    const profile = getSeriesProfile("location_review");
    const withoutImage = evaluateSourcePackReadiness({
      profile,
      slots: [],
      assets: [],
    });
    expect(withoutImage.blockingItems).toContainEqual(
      expect.objectContaining({ code: "reference_image_required" })
    );

    const withImage = evaluateSourcePackReadiness({
      profile,
      slots: [],
      assets: [
        {
          id: 1,
          sourceKind: "upload_image",
          mediaAssetId: 42,
          rightsStatus: "creator_owned",
          disclosureStatus: "not_required",
          analysisStatus: "completed",
        },
      ],
    });
    expect(withImage.blockingItems).not.toContainEqual(
      expect.objectContaining({ code: "reference_image_required" })
    );
  });

  it("keeps fiction drafting optional", () => {
    const result = evaluateSourcePackReadiness({
      profile: getSeriesProfile("drama_romance"),
      slots: [],
      assets: [],
    });
    expect(result.textDraftAllowed).toBe(true);
    expect(result.productionRenderAllowed).toBe(true);
  });

  it("blocks required source work until prompt expansion is approved", () => {
    const result = evaluateSourcePackReadiness({
      profile: getSeriesProfile("restaurant_review"),
      slots: [],
      assets: [],
      promptExpansion: { approved: false },
    });
    expect(result.textDraftAllowed).toBe(false);
    expect(result.blockingItems).toEqual([
      expect.objectContaining({ code: "prompt_expansion_required" }),
    ]);
  });

  it("uses approved prompt slots instead of generic profile defaults", () => {
    const result = evaluateSourcePackReadiness({
      profile: getSeriesProfile("restaurant_review"),
      slots: [
        {
          slotKey: "venue_exterior",
          required: true,
          narrativeDescription: "หน้าร้านกาแฟและป้ายร้าน",
          sourceAssetId: 1,
          status: "draft",
        },
      ],
      assets: [
        {
          id: 1,
          sourceKind: "upload_image",
          mediaAssetId: 101,
          rightsStatus: "creator_owned",
          disclosureStatus: "not_required",
          analysisStatus: "ready",
        },
      ],
      promptExpansion: { approved: true },
    });
    expect(result.blockingItems).toEqual([]);
    expect(result.repairableItems).toEqual([]);
    expect(result.textDraftAllowed).toBe(true);
  });

  it("separates text readiness from pending production rights", () => {
    const profile = getSeriesProfile("product_review");
    const result = evaluateSourcePackReadiness({
      profile,
      slots: profile.defaultSlots.map(item => ({
        slotKey: item.key,
        required: item.required,
        narrativeDescription: "เล่าให้ผู้ชมเห็นหลักฐานอะไร",
        sourceAssetId: 1,
        status: "draft",
      })),
      assets: [
        {
          id: 1,
          rightsStatus: "pending",
          disclosureStatus: "not_required",
          analysisStatus: "ready",
        },
      ],
    });
    expect(result.textDraftAllowed).toBe(false);
    expect(result.productionRenderAllowed).toBe(false);
    expect(
      result.repairableItems.some(item => item.code === "asset_rights_pending")
    ).toBe(true);
  });

  it("does not block production for an unbound optional asset", () => {
    const profile = getSeriesProfile("location_review");
    const result = evaluateSourcePackReadiness({
      profile,
      slots: profile.defaultSlots.map(item => ({
        slotKey: item.key,
        required: item.required,
        narrativeDescription: "เล่าหลักฐานของช่องนี้",
        sourceAssetId: 10,
        status: "draft",
      })),
      assets: [
        {
          id: 10,
          sourceKind: "upload_image",
          mediaAssetId: 110,
          rightsStatus: "creator_owned",
          disclosureStatus: "not_required",
          analysisStatus: "ready",
        },
        {
          id: 11,
          sourceKind: "upload_image",
          mediaAssetId: 111,
          rightsStatus: "pending",
          disclosureStatus: "not_required",
          analysisStatus: "not_requested",
        },
      ],
    });
    expect(result.productionReady).toBe(true);
    expect(result.productionRenderAllowed).toBe(true);
  });

  it("bounds digest slot descriptions and preserves source provenance", () => {
    const digest = buildSourcePackDigest({
      packId: 4,
      packVersion: 2,
      profile: getSeriesProfile("location_review"),
      slots: [
        {
          slotKey: "location_identity",
          title: "สถานที่",
          narrativeDescription: "x".repeat(3000),
          required: true,
          sourceAssetId: 9,
          sourceKind: "upload_image",
        },
      ],
      assets: [
        {
          id: 9,
          title: "ภาพจริง",
          description: "แหล่งที่มาของภาพ",
          provenance: { source: "user_upload" },
          rightsStatus: "creator_owned",
          disclosureStatus: "not_required",
        },
      ],
    });
    expect(digest.slots[0].narrativeDescription).toHaveLength(1000);
    expect(digest.slots[0].source?.provenance).toEqual({
      source: "user_upload",
    });
  });

  it("renders a bounded evidence block for downstream long-form prompts", () => {
    const block = renderSourcePackDigestPromptBlock({
      profileId: "software_review",
      slots: [{ slotKey: "screen", narrativeDescription: "อธิบายหน้าจอหลัก" }],
    });
    expect(block).toContain("SOURCE PACK GROUNDING");
    expect(block).toContain("อธิบายหน้าจอหลัก");
    expect(block).toContain("B-roll");
    expect(block).toContain("Do not invent claims");
  });

  it("renders bounded Worker media evidence even without source-pack slots", () => {
    const block = renderSourcePackDigestPromptBlock({
      workerMediaEvidence: [{
        mediaAssetId: "media-derived-1",
        score: 0.91,
        searchableText: "คนเดินผ่านหน้าร้านช่วงเย็น",
        tags: ["scene_candidates"],
        subjectLabels: ["person"],
        sourceTimeRanges: [{ startMs: 1200, endMs: 4800, label: "scene-1" }],
        silenceSegments: [],
        transform: { aspectRatio: "9:16", trackingMode: "manual_region" },
      }],
    });
    expect(block).toContain("WORKER MEDIA INTELLIGENCE");
    expect(block).toContain("media-derived-1");
    expect(block).toContain("คนเดินผ่านหน้าร้านช่วงเย็น");
  });

  it("exposes stable B-roll entries without bypassing rights", () => {
    const manifest = buildSourcePackBrollManifest({
      packId: 7,
      packVersion: 3,
      profile: getSeriesProfile("location_review"),
      slots: [
        {
          slotKey: "walkthrough",
          title: "Walkthrough",
          narrativeDescription: "พาชมพื้นที่",
          sourceAssetId: 12,
          usagePolicy: "broll",
          sourceKind: "upload_video",
        },
      ],
      assets: [
        {
          id: 12,
          title: "walkthrough.mp4",
          mediaAssetId: 22,
          provenance: { managed: true, uploadedUrl: "/api/storage/files/x" },
          rightsStatus: "creator_owned",
          disclosureStatus: "not_required",
        },
      ],
    });
    expect(manifest.entries[0]?.productionEligible).toBe(true);
    expect(manifest.entries[0]?.sourceAssetId).toBe(12);
  });
});
