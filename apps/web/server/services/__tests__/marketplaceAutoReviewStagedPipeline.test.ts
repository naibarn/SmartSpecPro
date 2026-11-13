import { describe, expect, it, vi } from "vitest";
import { callLLMStructured } from "../callLLMStructured";

import {
  buildStagedCheckpoint,
  generateStagedStoryArcPlanWithLLM,
  resolveStagedConversationMode,
} from "../marketplaceAutoReviewStoryArcPlanner";
import {
  buildStagedPlanAndMetadataForInit,
  deriveStagedCastFromManifestForTest as deriveCastFromManifest,
  planAndMetadataFromRun,
  resolveStagedVideoDurationForTest,
  stagedCheckpointExpectationForTest,
  hasExplicitStagedMediaDispatchIntentForTest,
} from "../marketplaceAutoReviewStagedPipelineService";

vi.mock("../callLLMStructured", () => ({
  callLLMStructured: vi.fn(),
}));
vi.mock("../skillRegistry", () => ({
  syncSingleSkillIfChanged: vi.fn().mockResolvedValue({ synced: false }),
  getSkillByIdAsync: vi.fn().mockResolvedValue({
    systemPrompt: "Use skill authored natural dialogue and concepts-first flow.",
  }),
}));

function deriveStagedCastFromManifestForTest(
  manifest: Array<Record<string, unknown>> | undefined
) {
  if (!Array.isArray(manifest)) return deriveCastFromManifest(manifest);
  const hasProductReference = manifest.some(
    item => item.role !== "character" && item.active !== false
  );
  const entries = hasProductReference
    ? manifest
    : [
        {
          url: "https://example.test/product.png",
          role: "product",
          active: true,
        },
        ...manifest,
      ];
  return deriveCastFromManifest(
    entries.map((item, index) => ({
      ...item,
      index: index + 1,
      role: item.role ?? "character",
      active: item.active ?? true,
    }))
  );
}

// Test fixture for contract-only tests. Runtime planning is LLM-authored; the
// deterministic planner was removed from production and should not be imported
// just to manufacture test data.
function makeStagedPlanFixture(input: any) {
  const shotCount = typeof input.shotCount === "number" ? input.shotCount : 9;
  const english = input.languagePlan?.summaryLanguage === "en";
  const beats = english
    ? ["Opening", "Problem", "Insight", "Proof", "Review", "Usage", "Detail", "Verdict", "CTA"]
    : [
        "Hook (เปิดประเด็น)",
        "Problem (สะท้อนปัญหา)",
        "Insight",
        "Proof",
        "Review",
        "Usage",
        "Detail",
        "Verdict",
        "CTA",
      ];
  return {
    planRevision: 1,
    title: "Test story plan",
    storySummary: english
      ? "A continuous nine-shot review. Opening"
      : "Hook → Problem → Insight → Proof → CTA: เปิดเรื่องด้วย Hook; หงุดหงิดกับปัญหา",
    conceptOptions: [],
    selectedConceptId: undefined,
    product: input.product,
    shots: Array.from({ length: shotCount }, (_, index) => ({
      shotId: index + 1,
      title: beats[index] ?? `ช็อตที่ ${index + 1}`,
      storySummary: `${index + 1}. ${beats[index] ?? "Beat"}`,
      visualSummary: `Visual ${index + 1}`,
      dialogue: `ช็อตที่ ${index + 1}: ตรวจสอบรายละเอียดสินค้า`,
      durationSeconds: input.shotDurationSeconds ?? 10,
    })),
    referenceManifestHash: input.referenceManifestHash ?? "fixture-refs",
    storyPlanHash: "fixture-story-hash",
    source: "llm_story_arc" as const,
    languagePlan: input.languagePlan,
  };
}

describe("marketplace staged storyboard pipeline contracts", () => {
  const plan = makeStagedPlanFixture({
    runId: "run-141",
    product: {
      productId: "product-1",
      productName: "แก้วน้ำตัวอย่าง",
      description: "สินค้าสำหรับทดสอบ",
      imageUrls: ["https://example.test/product.png"],
    },
    referenceManifestHash: "refs-1",
  });


  it("does not treat an approved prompt as media-render authorization", () => {
    expect(
      hasExplicitStagedMediaDispatchIntentForTest({ state: "approved" })
    ).toBe(false);
    expect(
      hasExplicitStagedMediaDispatchIntentForTest({
        state: "approved",
        mediaDispatchIntent: { requestedByUserId: 42 },
      })
    ).toBe(true);
    expect(
      hasExplicitStagedMediaDispatchIntentForTest({
        state: "approved",
        mediaDispatchIntent: { requestedByUserId: 0 },
      })
    ).toBe(false);
  });

  it("creates exactly nine ten-second reviewable shots", () => {
    expect(plan.shots).toHaveLength(9);
    expect(plan.shots.map(shot => shot.shotId)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9,
    ]);
    expect(plan.shots.every(shot => shot.durationSeconds === 10)).toBe(true);
  });

  it("keeps summary, dialogue, and prompt languages independent", () => {
    const localizedPlan = makeStagedPlanFixture({
      runId: "run-language",
      product: {
        productId: "product-1",
        productName: "Demo chair",
        description: "Evidence-grounded product description",
        imageUrls: ["https://example.test/product.png"],
      },
      languagePlan: {
        summaryLanguage: "en",
        dialogueLanguage: "th",
        promptLanguage: "en",
      },
    });
    expect(localizedPlan.storySummary).toContain(
      "A continuous nine-shot review"
    );
    expect(localizedPlan.shots[0].storySummary).toContain("Opening");
    expect(localizedPlan.shots[0].dialogue).toContain("ช็อตที่ 1");
  });

  it("builds a spend expectation from immutable checkpoint evidence", () => {
    const checkpoint = buildStagedCheckpoint({
      checkpointId: "image-prompt:run-141:shot-1:r1",
      kind: "image_prompt",
      shotId: 1,
      revision: 1,
      contentHash: "hash-1",
      model: "image-model",
      provider: "image-provider",
      estimatedCredits: 12,
      referenceManifestHash: "refs-1",
    });
    expect(stagedCheckpointExpectationForTest(checkpoint)).toMatchObject({
      revision: 1,
      contentHash: "hash-1",
      model: "image-model",
      provider: "image-provider",
      estimatedCredits: 12,
    });
  });

  it("requires a persisted story plan before reading staged metadata", () => {
    const rawRun = {
      id: "run-raw-1",
      productId: "product-demo",
      metadataJson: {
        productImageUrls: ["https://example.test/img.jpg"],
      },
    };
    expect(() => planAndMetadataFromRun(rawRun as any)).toThrow(
      "STAGED_PERSISTED_STORY_PLAN_REQUIRED"
    );
  });

  /**
   * `planning/marketplace-flexible-shots-and-creation-casting/plan.md` W1 —
   * `referenceAnchors.shotCount` threads into the deterministic fresh-plan
   * build the same way `shotDurationSeconds` already does. Absent -> 9
   * (byte-compatible with every existing persisted run).
   */
  it("does not synthesize a story plan while reading an uninitialized run", () => {
    const rawRunDefault = {
      id: "run-shotcount-default",
      productId: "product-demo",
      metadataJson: {
        productImageUrls: ["https://example.test/img.jpg"],
      },
    };
    expect(() => planAndMetadataFromRun(rawRunDefault as any)).toThrow(
      "STAGED_PERSISTED_STORY_PLAN_REQUIRED"
    );

    const rawRunTwelve = {
      id: "run-shotcount-12",
      productId: "product-demo",
      metadataJson: {
        productImageUrls: ["https://example.test/img.jpg"],
        referenceAnchors: { shotCount: 12 },
      },
    };
    expect(() => planAndMetadataFromRun(rawRunTwelve as any)).toThrow(
      "STAGED_PERSISTED_STORY_PLAN_REQUIRED"
    );
  });

  it("keeps newly generated prompt checkpoints non-dispatchable until the media button is used", () => {
    const promptOnlyCheckpoint = buildStagedCheckpoint({
      checkpointId: "video-prompt:run-141:shot-1:r1",
      kind: "video_prompt",
      shotId: 1,
      revision: 1,
      contentHash: "video-prompt-hash",
      model: "prompt-model",
      provider: "prompt-provider",
      estimatedCredits: 0,
      referenceManifestHash: "refs-1",
      autoApprove: { userId: 42 },
    });
    expect(promptOnlyCheckpoint.state).toBe("approved");
    expect(promptOnlyCheckpoint.mediaDispatchIntent).toBeUndefined();
    expect(
      hasExplicitStagedMediaDispatchIntentForTest(promptOnlyCheckpoint)
    ).toBe(false);

    const explicitVideoRequest = buildStagedCheckpoint({
      checkpointId: "video-prompt:run-141:shot-1:r2",
      kind: "video_prompt",
      shotId: 1,
      revision: 2,
      contentHash: "video-prompt-hash-2",
      model: "video-model",
      provider: "video-provider",
      estimatedCredits: 125,
      referenceManifestHash: "refs-1",
      autoApprove: { userId: 42 },
      mediaDispatchIntent: { requestedByUserId: 42 },
    });
    expect(
      hasExplicitStagedMediaDispatchIntentForTest(explicitVideoRequest)
    ).toBe(true);
  });

  it("buildStagedPlanAndMetadataForInit drafts three review ideas from the product brief", async () => {
    const concepts = [
      {
        conceptId: "idea-1",
        title: "ปัญหาก่อนเลือกซื้อ",
        angle: "เริ่มจากปัญหาที่สินค้าแก้ได้",
        storySummary: "เล่าปัญหาและสาธิตหลักฐานจากสินค้า",
        dialoguePreview: "ผู้รีวิว: พกขวดนี้ไปทำงานแล้วสะดวกดีนะ\nเพื่อน: ความจุเท่าไร?\nผู้รีวิว: ตามข้อมูลสินค้าระบุไว้ 500 มิลลิลิตร",
      },
      {
        conceptId: "idea-2",
        title: "ลองใช้ในชีวิตประจำวัน",
        angle: "ติดตามการใช้งานจริง",
        storySummary: "พาเห็นการใช้งานและสรุปความเหมาะสม",
        dialoguePreview: "ผู้รีวิว: เช้านี้ลองพกขวดมาเอง\nเพื่อน: ใส่กระเป๋าแล้วหนักไหม?\nผู้รีวิว: ตัวเลขความจุตรงกับที่ระบุไว้เลย",
      },
      {
        conceptId: "idea-3",
        title: "ตรวจจุดเด่นตามข้อมูล",
        angle: "รีวิวตรงไปตรงมาตาม Product brief",
        storySummary: "ตรวจจุดเด่นที่ยืนยันได้ก่อนแนะนำ",
        dialoguePreview: "เพื่อน: วัสดุที่แจ้งไว้คืออะไรนะ?\nผู้รีวิว: ข้อมูลสินค้าระบุว่าสเตนเลส\nเพื่อน: งั้นเล่าตามข้อมูลนี้ได้ชัดเจนดี",
      },
    ];
    const mockCallLLMStructured = vi.mocked(callLLMStructured);
    mockCallLLMStructured.mockResolvedValueOnce({
      data: {
        storySummary: "ร่างรีวิวสินค้าจากข้อมูล brief",
        conceptOptions: concepts,
        selectedConceptId: "idea-1",
        shots: Array.from({ length: 7 }, (_, index) => ({
          shotId: index + 1,
          title: `Shot ${index + 1}`,
          storySummary: `Beat ${index + 1}`,
          visualSummary: `Visual ${index + 1}`,
          dialogue: `Line ${index + 1}`,
        })),
      },
      modelId: "planning-test-model",
      providerName: "test-provider",
    } as never);
    const rawRun = {
      id: "run-init-deterministic",
      userId: 42,
      tenantId: "tenant-1",
      productId: "product-demo",
      metadataJson: {
        productTruth: {
          productName: "สินค้าเดโม",
          description: "Product brief ที่ใช้อธิบายสินค้า",
          specs: { material: "stainless steel" },
        },
        productImageUrls: ["https://example.test/img.jpg"],
        referenceAnchors: { shotCount: 7, storyPlanningModel: "gpt-4o" },
        sequentialStoryboard: {
          languagePlan: {
            summaryLanguage: "th",
            dialogueLanguage: "th",
            promptLanguage: "th",
          },
        },
        customReferenceManifest: [
          {
            index: 1,
            url: "https://example.test/img.jpg",
            role: "product",
            active: true,
          },
        ],
      },
    };
    const { plan } = await buildStagedPlanAndMetadataForInit(rawRun as any);
    mockCallLLMStructured.mockReset();
    expect(plan.shots).toHaveLength(0);
    expect(plan.source).toBe("llm_story_arc");
    expect(plan.conceptOptions).toEqual(concepts);
    expect(plan.product.description).toBe("Product brief ที่ใช้อธิบายสินค้า");
    expect(plan.product.specs).toEqual({ material: "stainless steel" });
  });

  it("uses a review plan fixture for contract-level story summary assertions", () => {
    const plan = makeStagedPlanFixture({
      runId: "run-narrative-1",
      product: {
        productId: "p1",
        productName: "ของเล่นเด็ก",
        description: "ของเล่นปลอดภัย",
        imageUrls: [],
      },
      storytellingStructure: "hook_problem_insight_proof_cta",
      reviewTone: "irritated_problem",
    });

    expect(plan.storySummary).toContain("Hook → Problem → Insight → Proof → CTA");
    expect(plan.shots).toHaveLength(9);
    expect(plan.shots[0].dialogue).toContain("ตรวจสอบรายละเอียดสินค้า");
  });

  it("calls generateStagedStoryArcPlanWithLLM and produces 9-shot plan with selected model", async () => {
    vi.mocked(callLLMStructured).mockResolvedValueOnce({
      data: {
        storySummary: "A complete review.",
        conceptOptions: [
          { conceptId: "a", title: "A", angle: "A", storySummary: "A", dialoguePreview: "A natural conversation preview about the product, using only confirmed facts." },
          { conceptId: "b", title: "B", angle: "B", storySummary: "B", dialoguePreview: "A natural conversation preview about a different product use case." },
          { conceptId: "c", title: "C", angle: "C", storySummary: "C", dialoguePreview: "A natural conversation preview focused on verified product details." },
        ],
        selectedConceptId: "a",
        shots: Array.from({ length: 9 }, (_, index) => ({
          shotId: index + 1,
          title: `Shot ${index + 1}`,
          storySummary: `Beat ${index + 1}`,
          visualSummary: `Visual ${index + 1}`,
          dialogue: `Line ${index + 1}`,
        })),
      },
      modelId: "planning-test-model",
      providerName: "test-provider",
    } as never);
    const plan = await generateStagedStoryArcPlanWithLLM({
      runId: "run-llm-1",
      userId: 1,
      tenantId: "t1",
      referenceManifestHash: "refs-llm-1",
      product: {
        productId: "p1",
        productName: "ของเล่นเด็ก",
        description: "ของเล่นพลาสติก ABS พัฒนาทักษะ",
        imageUrls: [],
      },
      storytellingStructure: "hook_problem_insight_proof_cta",
      reviewTone: "irritated_problem",
      model: "gpt-4o",
    });

    expect(plan.shots).toHaveLength(9);
    expect(plan.planRevision).toBe(1);
    expect(plan.storySummary).toBeDefined();
  });
});

describe("deriveStagedCastFromManifest (via deriveStagedCastFromManifestForTest)", () => {
  it("returns an empty cast when the manifest has zero character-role items", () => {
    const cast = deriveStagedCastFromManifestForTest([
      {
        url: "https://example.test/product-1.png",
        role: "product",
        active: true,
      },
      {
        url: "https://example.test/product-2.png",
        role: "environment",
        active: true,
      },
    ]);
    expect(cast).toEqual([]);
  });

  it("returns an empty cast when the manifest is undefined", () => {
    expect(() => deriveStagedCastFromManifestForTest(undefined)).toThrow(
      "STAGED_REFERENCE_MANIFEST_REQUIRED"
    );
  });

  it("derives exactly one cast member (host, imageIndex after the product count) for a single character item", () => {
    const cast = deriveStagedCastFromManifestForTest([
      {
        url: "https://example.test/host.png",
        role: "character",
        characterName: "Ann",
        characterRole: "host",
        vdCharacterId: "vd-char-1",
        vdSeriesId: "vd-series-1",
        active: true,
      },
    ]);
    expect(cast).toHaveLength(1);
    expect(cast[0]).toMatchObject({
      castId: "cast-1",
      name: "Ann",
      role: "host",
      source: "vd_character",
      vdCharacterId: "vd-char-1",
      vdSeriesId: "vd-series-1",
      imageIndex: 2, // 1 (default product count, none supplied) + 0 + 1
    });
  });

  it("derives two cast members (host + guest) with real names/roles/vdCharacterId from a 2-character manifest, image-indexed after the product items", () => {
    const cast = deriveStagedCastFromManifestForTest([
      {
        url: "https://example.test/product.png",
        role: "product",
        active: true,
      },
      {
        url: "https://example.test/host.png",
        role: "character",
        characterName: "Ann",
        characterRole: "host",
        vdCharacterId: "vd-char-1",
        active: true,
      },
      {
        url: "https://example.test/guest.png",
        role: "character",
        characterName: "Somchai",
        characterRole: "guest",
        vdCharacterId: "vd-char-2",
        active: true,
      },
    ]);
    expect(cast).toHaveLength(2);
    expect(cast[0]).toMatchObject({
      castId: "cast-1",
      name: "Ann",
      role: "host",
      source: "vd_character",
      vdCharacterId: "vd-char-1",
      imageIndex: 2, // productCount(1) + i(0) + 1
    });
    expect(cast[1]).toMatchObject({
      castId: "cast-2",
      name: "Somchai",
      role: "guest",
      source: "vd_character",
      vdCharacterId: "vd-char-2",
      imageIndex: 3, // productCount(1) + i(1) + 1
    });
  });

  it("rejects uploaded cast entries without an explicit character name", () => {
    expect(() => deriveStagedCastFromManifestForTest([
      { url: "https://example.test/host.png", role: "character", active: true },
      { url: "https://example.test/guest.png", role: "character", active: true },
    ])).toThrow("STAGED_CAST_CHARACTER_NAME_REQUIRED");
  });

  /* Roster widened 2 -> 4 by `planning/marketplace-four-character-cast/plan.md`
     P1. Two speaking leads plus up to two supporting characters; the cap now
     lives in the shared `MARKETPLACE_CHARACTER_CAST_MAX`. */
  it("ignores inactive items and admits up to 4 character items, roling them host/guest/support", () => {
    const cast = deriveStagedCastFromManifestForTest([
      {
        url: "https://example.test/a.png",
        role: "character",
        characterName: "A",
        active: false,
      },
      {
        url: "https://example.test/b.png",
        role: "character",
        characterName: "B",
        active: true,
      },
      {
        url: "https://example.test/c.png",
        role: "character",
        characterName: "C",
        active: true,
      },
      {
        url: "https://example.test/d.png",
        role: "character",
        characterName: "D",
        active: true,
      },
      {
        url: "https://example.test/e.png",
        role: "character",
        characterName: "E",
        active: true,
      },
    ]);
    expect(cast.map(member => member.name)).toEqual(["B", "C", "D", "E"]);
    expect(cast.map(member => member.role)).toEqual([
      "host",
      "guest",
      "support",
      "support",
    ]);
  });

  it("rejects manifests that exceed the four-character cast cap", () => {
    expect(() => deriveStagedCastFromManifestForTest([
      {
        url: "https://example.test/b.png",
        role: "character",
        characterName: "B",
        active: true,
      },
      {
        url: "https://example.test/c.png",
        role: "character",
        characterName: "C",
        active: true,
      },
      {
        url: "https://example.test/d.png",
        role: "character",
        characterName: "D",
        active: true,
      },
      {
        url: "https://example.test/e.png",
        role: "character",
        characterName: "E",
        active: true,
      },
      {
        url: "https://example.test/f.png",
        role: "character",
        characterName: "F",
        active: true,
      },
    ])).toThrow("STAGED_CAST_LIMIT_EXCEEDED:5:4");
  });

  /* The single decision that keeps this affordable: mode follows the SPEAKING
     LEADS, not roster size. One host plus supporting characters is still a
     solo narration with several people in frame. */
  it("keeps conversationMode driven by leads, so support members never turn a solo into a conversation", () => {
    const cast = deriveStagedCastFromManifestForTest([
      {
        url: "https://example.test/b.png",
        role: "character",
        characterName: "B",
        characterRole: "host",
        active: true,
      },
      {
        url: "https://example.test/c.png",
        role: "character",
        characterName: "C",
        characterRole: "support",
        active: true,
      },
      {
        url: "https://example.test/d.png",
        role: "character",
        characterName: "D",
        characterRole: "support",
        active: true,
      },
    ]);
    expect(cast.map(member => member.role)).toEqual([
      "host",
      "support",
      "support",
    ]);
    expect(resolveStagedConversationMode(cast)).toBe("solo");
  });

  it("still resolves a legacy 2-entry roster as a two-person conversation", () => {
    const cast = deriveStagedCastFromManifestForTest([
      {
        url: "https://example.test/b.png",
        role: "character",
        characterName: "B",
        active: true,
      },
      {
        url: "https://example.test/c.png",
        role: "character",
        characterName: "C",
        active: true,
      },
    ]);
    expect(resolveStagedConversationMode(cast)).toBe("two_person_conversation");
  });

  it("carries explicit minor grounding through to the cast member", () => {
    const cast = deriveStagedCastFromManifestForTest([
      {
        url: "https://example.test/b.png",
        role: "character",
        characterName: "B",
        active: true,
      },
      {
        url: "https://example.test/kid.png",
        role: "character",
        characterName: "น้องปุย",
        characterRole: "support",
        depictsMinor: true,
        active: true,
      },
    ]);
    expect(cast[1]).toMatchObject({ name: "น้องปุย", depictsMinor: true });
    // Silence stays silence — never coerced to false, which downstream reads
    // as "unknown" and handles conservatively.
    expect(cast[0].depictsMinor).toBeUndefined();
  });
});

describe("resolveStagedVideoDuration (via resolveStagedVideoDurationForTest)", () => {
  it("rejects a requested duration outside the model-supported duration list", () => {
    // veo3/generate-veo-3-video-lite (the staged pipeline's default video
    // model) only supports an 8-second duration in the model registry.
    expect(() =>
      resolveStagedVideoDurationForTest(
        "veo3/generate-veo-3-video-lite",
        10
      )
    ).toThrow("STAGED_VIDEO_DURATION_NOT_SUPPORTED");
  });

  it("keeps the requested duration unchanged (fitted:false) when the model's duration list already includes it", () => {
    // happyhorse/image-to-video supports a wide 3-15s duration range,
    // including the requested 10s exactly.
    const result = resolveStagedVideoDurationForTest(
      "happyhorse/image-to-video",
      10
    );
    expect(result).toEqual({ duration: 10, fitted: false });
  });

  it("rejects a model id that is not configured", () => {
    expect(() =>
      resolveStagedVideoDurationForTest("no-such-model-in-registry", 12)
    ).toThrow("STAGED_VIDEO_MODEL_NOT_CONFIGURED");
  });
});

describe("planAndMetadataFromRun — two-character conversation wiring from customReferenceManifest", () => {
  function rawRunWithManifest(manifest: unknown[]) {
    return {
      id: `run-manifest-${manifest.length}`,
      productId: "product-demo",
      metadataJson: {
        productImageUrls: ["https://example.test/img.jpg"],
        customReferenceManifest: manifest,
      },
    };
  }

  it("requires a persisted plan before reading a manifest with no characters", () => {
    expect(() => planAndMetadataFromRun(
      rawRunWithManifest([
        {
          url: "https://example.test/product.png",
          role: "product",
          active: true,
        },
      ]) as any
    )).toThrow("STAGED_PERSISTED_STORY_PLAN_REQUIRED");
  });

  it("requires a persisted plan before reading a single-character manifest", () => {
    expect(() => planAndMetadataFromRun(
      rawRunWithManifest([
        {
          url: "https://example.test/host.png",
          role: "character",
          characterName: "Ann",
          characterRole: "host",
          active: true,
        },
      ]) as any
    )).toThrow("STAGED_PERSISTED_STORY_PLAN_REQUIRED");
  });

  it("requires a persisted plan before reading a two-character manifest", () => {
    expect(() => planAndMetadataFromRun(
      rawRunWithManifest([
        {
          url: "https://example.test/product.png",
          role: "product",
          active: true,
        },
        {
          url: "https://example.test/host.png",
          role: "character",
          characterName: "Ann",
          characterRole: "host",
          vdCharacterId: "vd-char-1",
          active: true,
        },
        {
          url: "https://example.test/guest.png",
          role: "character",
          characterName: "Somchai",
          characterRole: "guest",
          vdCharacterId: "vd-char-2",
          active: true,
        },
      ]) as any
    )).toThrow("STAGED_PERSISTED_STORY_PLAN_REQUIRED");
  });
});

/**
 * Field incident 2026-07-29 (run mar_341efe636f0e6d11fc938a37dd4b19a1,
 * shots 8/9 — "กดสร้างภาพแล้วเงียบ"): task records written at DISPATCH time
 * had no `status` field — `status` was only ever written at reconcile
 * success ("completed") or provider failure ("failed"). While a task was
 * actively processing at the provider, `stagedTaskStatus()` therefore
 * returned null, the client's `isTaskInFlight()` read that as "nothing in
 * flight", and the panel showed the amber "ระบบส่งงานสร้างภาพค้างอยู่ —
 * กดสร้างใหม่" banner with an ENABLED generate button mid-generation —
 * users read that as a dead click and re-dispatched, double-charging
 * credits. Grep-guard (same convention as the skill runner's T9
 * ".slice(" guard): every dispatch-time setTaskRecord call site in the
 * pipeline service must stamp `status: "submitted"` — one of the client's
 * recognized in-flight values.
 */
describe("staged dispatch task records carry an in-flight status (grep-guard)", () => {
  it('every dispatch setTaskRecord call site includes status: "submitted"', async () => {
    const fs = await import("fs");
    const path = await import("path");
    const source = fs.readFileSync(
      path.resolve(
        __dirname,
        "../marketplaceAutoReviewStagedPipelineService.ts"
      ),
      "utf-8"
    );
    // Split on call sites; skip chunk 0 (everything before the first call)
    // and the function's own definition chunk.
    const chunks = source.split("setTaskRecord(").slice(1);
    const callSites = chunks.filter(
      chunk => !chunk.startsWith("\n") || !chunk.includes("stagedTaskKey: key")
    );
    // 3 real dispatch call sites today: image, video, audio.
    expect(callSites.length).toBeGreaterThanOrEqual(3);
    for (const [index, chunk] of callSites.entries()) {
      // Only inspect the argument object — up to the matching closing of
      // the call, approximated by the first "})" which every call site's
      // object literal ends with well before any later code.
      const head = chunk.slice(0, chunk.indexOf("})"));
      expect(
        head.includes('status: "submitted"'),
        `setTaskRecord call site #${index + 1} is missing status: "submitted" — a dispatched task with no status renders as "not in flight" client-side, re-enabling the generate button mid-generation (double-charge risk)`
      ).toBe(true);
    }
  });
});

describe("staged provider references use the authenticated media boundary", () => {
  it("does not anonymously fetch tenant-protected references before media submission", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const source = fs.readFileSync(
      path.resolve(
        __dirname,
        "../marketplaceAutoReviewStagedPipelineService.ts"
      ),
      "utf-8"
    );
    const imageProvider = source.slice(
      source.indexOf("async function handleImageProvider"),
      source.indexOf("\nasync function reconcileImageProvider")
    );
    const submitBoundary = source.slice(
      source.indexOf("async function reserveAndSubmit"),
      source.indexOf("\nfunction taskRecord")
    );

    expect(source).not.toContain("sanitizeReferenceUrlsForProvider");
    expect(source).not.toContain("convertReferenceImageForKieAi");
    expect(imageProvider).not.toContain("fetch(");
    expect(imageProvider).toContain("referenceImageUrls,");
    expect(imageProvider).toContain("tenantId: params.auth.tenantId");
    expect(submitBoundary).toContain(
      "mediaGenerationService.generateImageAsync("
    );
  });
});
