import { describe, expect, it } from "vitest";

import {
  buildStagedCheckpoint,
  buildStagedImagePrompt,
  buildStagedStoryArcPlan,
  buildStagedVideoPrompt,
  generateStagedStoryArcPlanWithLLM,
  resolveStagedConversationMode,
} from "../marketplaceAutoReviewStoryArcPlanner";
import {
  buildStagedPlanAndMetadataForInit,
  deriveStagedCastFromManifestForTest,
  planAndMetadataFromRun,
  resolveStagedVideoDurationForTest,
  stagedCheckpointExpectationForTest,
} from "../marketplaceAutoReviewStagedPipelineService";
import { StagedSequentialStoryboardMetadataV1Schema } from "../../../shared/marketplaceAutoReview/stagedContracts";

describe("marketplace staged storyboard pipeline contracts", () => {
  const plan = buildStagedStoryArcPlan({
    runId: "run-141",
    product: {
      productId: "product-1",
      productName: "แก้วน้ำตัวอย่าง",
      description: "สินค้าสำหรับทดสอบ",
      imageUrls: ["https://example.test/product.png"],
    },
    referenceManifestHash: "refs-1",
  });

  it("creates exactly nine ten-second reviewable shots", () => {
    expect(plan.shots).toHaveLength(9);
    expect(plan.shots.map(shot => shot.shotId)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(plan.shots.every(shot => shot.durationSeconds === 10)).toBe(true);
  });

  it("keeps approved story/dialogue exact in downstream prompts", () => {
    const imagePrompt = buildStagedImagePrompt({ plan, shot: plan.shots[0] });
    const videoPrompt = buildStagedVideoPrompt({ plan, shot: plan.shots[0] });
    expect(imagePrompt).toContain(plan.storySummary);
    expect(videoPrompt).toContain(plan.shots[0].dialogue);
    expect(videoPrompt).toContain("10-second");
    expect(imagePrompt).toContain("@Image1");
  });

  it("includes the shot's dialogue (fact) in the auto-compiled Thai image prompt", () => {
    // Fix A regression: buildStagedImagePrompt (the DEFAULT auto-compile
    // path used whenever the story plan is approved) previously never read
    // shot.dialogue at all. It must still carry the dialogue fact so a
    // downstream skill call (or a human reviewer) can see the situation the
    // shot is meant to depict — but per the P3 skill-first restore
    // (`planning/marketplace-staged-skill-first-restore/plan.md`), judging
    // HOW that dialogue should shape the image's sentiment/composition is no
    // longer this TS fallback's job; that creative call now belongs
    // exclusively to the `product-review-sequential-storyboard` skill
    // (see its Phase F "Emotional and Narrative Sentiment Rule").
    const thaiPromptPlan = buildStagedStoryArcPlan({
      runId: "run-141-th-prompt",
      product: {
        productId: "product-1",
        productName: "แก้วน้ำตัวอย่าง",
        description: "สินค้าสำหรับทดสอบ",
        imageUrls: ["https://example.test/product.png"],
      },
      languagePlan: {
        summaryLanguage: "th",
        dialogueLanguage: "th",
        promptLanguage: "th",
      },
    });
    const imagePrompt = buildStagedImagePrompt({
      plan: thaiPromptPlan,
      shot: thaiPromptPlan.shots[0],
    });
    expect(imagePrompt).toContain(thaiPromptPlan.shots[0].dialogue);
    expect(imagePrompt).toContain("บทพูดของช็อตนี้");
    // The creative sentiment-mirroring paragraph itself is gone — that
    // judgment now lives only in the skill.
    expect(imagePrompt).not.toContain("สะท้อนอารมณ์และสถานการณ์ที่เรื่องย่อ");
  });

  it("includes the shot's dialogue (fact) in the English image prompt too", () => {
    const englishPlan = buildStagedStoryArcPlan({
      runId: "run-english",
      product: {
        productId: "product-1",
        productName: "Demo chair",
        description: "Evidence-grounded product description",
        imageUrls: ["https://example.test/product.png"],
      },
      languagePlan: {
        summaryLanguage: "en",
        dialogueLanguage: "en",
        promptLanguage: "en",
      },
    });
    const imagePrompt = buildStagedImagePrompt({
      plan: englishPlan,
      shot: englishPlan.shots[0],
    });
    expect(imagePrompt).toContain(englishPlan.shots[0].dialogue);
    expect(imagePrompt).toContain(
      "This shot's dialogue (the image MUST reflect this emotion/situation)"
    );
    // The creative sentiment-mirroring paragraph itself is gone — that
    // judgment now lives only in the skill.
    expect(imagePrompt).not.toContain("visual composition must reflect");
  });

  it("keeps summary, dialogue, and prompt languages independent", () => {
    const localizedPlan = buildStagedStoryArcPlan({
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
    const imagePrompt = buildStagedImagePrompt({
      plan: localizedPlan,
      shot: localizedPlan.shots[0],
    });
    const videoPrompt = buildStagedVideoPrompt({
      plan: localizedPlan,
      shot: localizedPlan.shots[0],
    });

    expect(localizedPlan.storySummary).toContain("A continuous nine-shot review");
    expect(localizedPlan.shots[0].storySummary).toContain("Opening");
    expect(localizedPlan.shots[0].dialogue).toContain("ช็อตที่ 1");
    expect(imagePrompt).toContain("Create one vertical 9:16");
    // Camera choreography is now the skill's job (P3 skill-first restore) —
    // the bounded TS fallback only needs to carry the duration fact.
    expect(videoPrompt).toContain("Create a 10-second vertical 9:16");
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

  it("synthesizes valid staged metadata for runs without pre-initialized staged metadata", () => {
    const rawRun = {
      id: "run-raw-1",
      productId: "product-demo",
      metadataJson: {
        productImageUrls: ["https://example.test/img.jpg"],
      },
    };
    const { metadata } = planAndMetadataFromRun(rawRun as any);
    const parsed = StagedSequentialStoryboardMetadataV1Schema.safeParse(metadata);
    expect(parsed.success).toBe(true);
    expect(metadata.stagedSequentialStoryboard.shots).toHaveLength(9);
    expect(metadata.stagedPipeline.audioPlan).toBeNull();
    expect(metadata.stagedPipeline.finalAssembly).toBeNull();
  });

  /**
   * `planning/marketplace-flexible-shots-and-creation-casting/plan.md` W1 —
   * `referenceAnchors.shotCount` threads into the deterministic fresh-plan
   * build the same way `shotDurationSeconds` already does. Absent -> 9
   * (byte-compatible with every existing persisted run).
   */
  it("planAndMetadataFromRun threads referenceAnchors.shotCount (fixed N) into a fresh plan", () => {
    const rawRunDefault = {
      id: "run-shotcount-default",
      productId: "product-demo",
      metadataJson: {
        productImageUrls: ["https://example.test/img.jpg"],
      },
    };
    const { plan: defaultPlan } = planAndMetadataFromRun(rawRunDefault as any);
    expect(defaultPlan.shots).toHaveLength(9);

    const rawRunTwelve = {
      id: "run-shotcount-12",
      productId: "product-demo",
      metadataJson: {
        productImageUrls: ["https://example.test/img.jpg"],
        referenceAnchors: { shotCount: 12 },
      },
    };
    const { plan: twelveShotPlan } = planAndMetadataFromRun(
      rawRunTwelve as any
    );
    expect(twelveShotPlan.shots).toHaveLength(12);
    expect(twelveShotPlan.shots.map(s => s.shotId)).toEqual(
      Array.from({ length: 12 }, (_, i) => i + 1)
    );
  });

  /**
   * `buildStagedPlanAndMetadataForInit` is the async LLM-first path used by
   * `initializeStagedMarketplaceAutoReviewRun`/`redraftStagedMarketplaceAutoReviewRun`.
   * With no cast and no shotCount="auto" it must stay deterministic
   * (`usedSkillFallback: false`, `source: "bounded_story_arc_fallback"`) —
   * there's no LLM-judgment reason to call the LLM at all in that case.
   */
  it("buildStagedPlanAndMetadataForInit stays deterministic (no LLM call) when there is no cast and shotCount is not 'auto'", async () => {
    const rawRun = {
      id: "run-init-deterministic",
      productId: "product-demo",
      metadataJson: {
        productImageUrls: ["https://example.test/img.jpg"],
        referenceAnchors: { shotCount: 7 },
      },
    };
    const { plan, usedSkillFallback } = await buildStagedPlanAndMetadataForInit(
      rawRun as any
    );
    expect(plan.shots).toHaveLength(7);
    expect(plan.source).toBe("bounded_story_arc_fallback");
    expect(usedSkillFallback).toBe(false);
  });

  it("synthesizes narrative story summary reflecting selected structure beats and tone", () => {
    const plan = buildStagedStoryArcPlan({
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
    expect(plan.storySummary).toContain("หงุดหงิดกับปัญหา");
    expect(plan.storySummary).toContain("เปิดเรื่องด้วย Hook");
    expect(plan.shots[0].title).toBe("Hook (เปิดประเด็น)");
    expect(plan.shots[1].title).toBe("Problem (สะท้อนปัญหา)");
    expect(plan.shots[0].dialogue).toContain("ปัญหาเดิมๆ");
  });

  it("calls generateStagedStoryArcPlanWithLLM and produces 9-shot plan with selected model", async () => {
    const plan = await generateStagedStoryArcPlanWithLLM({
      runId: "run-llm-1",
      userId: 1,
      tenantId: "t1",
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
      { url: "https://example.test/product-1.png", role: "product", active: true },
      { url: "https://example.test/product-2.png", active: true },
    ]);
    expect(cast).toEqual([]);
  });

  it("returns an empty cast when the manifest is undefined", () => {
    expect(deriveStagedCastFromManifestForTest(undefined)).toEqual([]);
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
      { url: "https://example.test/product.png", role: "product", active: true },
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

  it("falls back to 'uploaded' source and a generic Person-N name when no vdCharacterId/characterName/label is supplied", () => {
    const cast = deriveStagedCastFromManifestForTest([
      { url: "https://example.test/host.png", role: "character", active: true },
      { url: "https://example.test/guest.png", role: "character", active: true },
    ]);
    expect(cast).toHaveLength(2);
    expect(cast[0]).toMatchObject({ name: "Person 1", source: "uploaded", role: "host" });
    expect(cast[1]).toMatchObject({ name: "Person 2", source: "uploaded", role: "guest" });
  });

  /* Roster widened 2 -> 4 by `planning/marketplace-four-character-cast/plan.md`
     P1. Two speaking leads plus up to two supporting characters; the cap now
     lives in the shared `MARKETPLACE_CHARACTER_CAST_MAX`. */
  it("ignores inactive items and admits up to 4 character items, roling them host/guest/support", () => {
    const cast = deriveStagedCastFromManifestForTest([
      { url: "https://example.test/a.png", role: "character", characterName: "A", active: false },
      { url: "https://example.test/b.png", role: "character", characterName: "B", active: true },
      { url: "https://example.test/c.png", role: "character", characterName: "C", active: true },
      { url: "https://example.test/d.png", role: "character", characterName: "D", active: true },
      { url: "https://example.test/e.png", role: "character", characterName: "E", active: true },
    ]);
    expect(cast.map(member => member.name)).toEqual(["B", "C", "D", "E"]);
    expect(cast.map(member => member.role)).toEqual([
      "host",
      "guest",
      "support",
      "support",
    ]);
  });

  it("caps the cast at 4 members even when more character items are supplied", () => {
    const cast = deriveStagedCastFromManifestForTest([
      { url: "https://example.test/b.png", role: "character", characterName: "B", active: true },
      { url: "https://example.test/c.png", role: "character", characterName: "C", active: true },
      { url: "https://example.test/d.png", role: "character", characterName: "D", active: true },
      { url: "https://example.test/e.png", role: "character", characterName: "E", active: true },
      { url: "https://example.test/f.png", role: "character", characterName: "F", active: true },
    ]);
    expect(cast.map(member => member.name)).toEqual(["B", "C", "D", "E"]);
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
      { url: "https://example.test/b.png", role: "character", characterName: "B", active: true },
      { url: "https://example.test/c.png", role: "character", characterName: "C", active: true },
    ]);
    expect(resolveStagedConversationMode(cast)).toBe("two_person_conversation");
  });

  it("carries explicit minor grounding through to the cast member", () => {
    const cast = deriveStagedCastFromManifestForTest([
      { url: "https://example.test/b.png", role: "character", characterName: "B", active: true },
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
  it("snaps the requested duration to the closest model-supported value when the model only supports a restrictive duration list", () => {
    // veo3/generate-veo-3-video-lite (the staged pipeline's default video
    // model) only supports an 8-second duration in the model registry.
    const result = resolveStagedVideoDurationForTest(
      "veo3/generate-veo-3-video-lite",
      10
    );
    expect(result).toEqual({ duration: 8, fitted: true });
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

  it("keeps the requested duration unchanged for a model with no duration config at all (unknown model id)", () => {
    const result = resolveStagedVideoDurationForTest(
      "no-such-model-in-registry",
      12
    );
    expect(result).toEqual({ duration: 12, fitted: false });
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

  it("produces a plan with NO cast/conversationMode fields for a manifest with 0 character items", () => {
    const { plan } = planAndMetadataFromRun(
      rawRunWithManifest([
        { url: "https://example.test/product.png", role: "product", active: true },
      ]) as any
    );
    expect(plan.cast).toBeUndefined();
    expect(plan.conversationMode).toBeUndefined();
  });

  it("produces a plan with a 1-member cast and conversationMode='solo' for a manifest with exactly 1 character item", () => {
    const { plan } = planAndMetadataFromRun(
      rawRunWithManifest([
        {
          url: "https://example.test/host.png",
          role: "character",
          characterName: "Ann",
          characterRole: "host",
          active: true,
        },
      ]) as any
    );
    expect(plan.cast).toHaveLength(1);
    expect(plan.conversationMode).toBe("solo");
  });

  it("produces a plan with conversationMode='two_person_conversation' and both cast members' real names for a manifest with 2 character items", () => {
    const { plan } = planAndMetadataFromRun(
      rawRunWithManifest([
        { url: "https://example.test/product.png", role: "product", active: true },
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
    );
    expect(plan.conversationMode).toBe("two_person_conversation");
    expect(plan.cast).toHaveLength(2);
    expect(plan.cast?.[0].name).toBe("Ann");
    expect(plan.cast?.[1].name).toBe("Somchai");
    expect(plan.shots.every(shot => Array.isArray(shot.castInShot) && shot.castInShot?.length === 2)).toBe(true);
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
