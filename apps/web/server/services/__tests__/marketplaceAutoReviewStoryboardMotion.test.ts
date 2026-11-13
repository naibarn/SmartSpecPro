import { beforeEach, describe, expect, it, vi } from "vitest";
import { callLLMStructured } from "../callLLMStructured";
import {
  buildStagedImagePrompt,
  buildStagedVideoPrompt,
  generateStagedStoryArcPlanWithLLM,
} from "../marketplaceAutoReviewStoryArcPlanner";
import { buildMarketplaceVerticalDramaVideoPromptInput } from "../marketplaceAutoReviewVideoPromptSkillRunner";

vi.mock("../callLLMStructured", () => ({ callLLMStructured: vi.fn() }));
vi.mock("../skillRegistry", () => ({
  syncSingleSkillIfChanged: vi.fn().mockResolvedValue({ synced: false }),
  getSkillByIdAsync: vi.fn().mockResolvedValue({
    systemPrompt: "Use the story skill to author a vivid, natural product story.",
  }),
}));

describe("staged auto review visual motion planning", () => {
  beforeEach(() => {
    vi.mocked(callLLMStructured).mockReset();
    vi.mocked(callLLMStructured).mockResolvedValue({
      data: {
        storySummary: "A lively product review told through a real demonstration.",
        conceptOptions: ["1", "2", "3"].map(id => ({
          conceptId: id,
          title: `Idea ${id}`,
          angle: "A visual product demonstration",
          storySummary: "A real use case becomes a playful product test.",
          dialoguePreview:
            "Host: ลองดูตรงนี้สิ\nGuest: อ๋อ พอขยับแบบนี้ก็เห็นจุดเด่นชัดเลย",
        })),
        selectedConceptId: "1",
        shots: Array.from({ length: 9 }, (_, index) => ({
          shotId: index + 1,
          title: `Beat ${index + 1}`,
          storySummary: `The story advances at beat ${index + 1}.`,
          visualSummary: `The host moves the product into the test area at beat ${index + 1}.`,
          cameraDirection: index % 2 ? "handheld close-up tracking right" : "wide shot, then a quick push-in",
          movementDirection: `The host picks up and operates the product for beat ${index + 1}.`,
          transition: "Cut on the movement to the next demonstration.",
          dialogue: `Host: ดูจังหวะนี้นะ ${index + 1}`,
        })),
      },
      modelId: "motion-test-model",
      providerName: "test-provider",
    } as never);
  });

  it("asks the story skill for active, varied visual beats and preserves authored directions", async () => {
    const plan = await generateStagedStoryArcPlanWithLLM({
      runId: "motion-plan-test",
      userId: 7,
      tenantId: "tenant-1",
      model: "motion-test-model",
      referenceManifestHash: "motion-refs",
      product: {
        productId: "product-1",
        productName: "เครื่องให้น้ำสัตว์เลี้ยง",
        imageUrls: ["https://example.test/product.png"],
      },
      shotCount: 9,
    });

    const call = vi.mocked(callLLMStructured).mock.calls[0]?.[0] as {
      systemPrompt: string;
    };
    expect(call.systemPrompt).toContain("ทุกช็อตต้องมีภาพที่กำลังเกิดการกระทำ");
    expect(call.systemPrompt).toContain("อย่าใช้มุมเดิมและการนั่งสนทนาคู่แบบเดิมซ้ำ");
    expect(call.systemPrompt).toContain("บทพูดต้องเป็นประโยคที่คนพูดกันจริง");
    expect(plan.shots[0]).toMatchObject({
      cameraDirection: "wide shot, then a quick push-in",
      movementDirection: "The host picks up and operates the product for beat 1.",
      transition: "Cut on the movement to the next demonstration.",
    });
  });

  it("carries shot-specific action, camera, and transitions into image and video prompts", () => {
    const plan = {
      planRevision: 1,
      title: "Test review",
      storySummary: "A demonstration unfolds.",
      product: { productId: "p1", productName: "Product", imageUrls: [] },
      shots: [],
      referenceManifestHash: "refs",
      storyPlanHash: "story",
      source: "llm_story_arc" as const,
      authoring: { model: "test", provider: "test", creditsUsed: 0 },
      languagePlan: { summaryLanguage: "en" as const, dialogueLanguage: "en" as const, promptLanguage: "en" as const },
    };
    const shot = {
      shotId: 1,
      title: "Demonstration",
      storySummary: "The guest tests the product.",
      visualSummary: "The guest lifts and turns the product toward camera.",
      cameraDirection: "Over-shoulder close-up with a short arc move.",
      movementDirection: "The guest lifts and turns the product to reveal its control.",
      transition: "Match cut on the turning motion.",
      dialogue: "Guest: ดูตรงนี้นะ",
      durationSeconds: 10,
    };

    const imagePrompt = buildStagedImagePrompt({ plan, shot, customManifest: [] });
    const videoPrompt = buildStagedVideoPrompt({ plan, shot });
    for (const prompt of [imagePrompt, videoPrompt]) {
      expect(prompt).toContain(shot.cameraDirection);
      expect(prompt).toContain(shot.movementDirection);
      expect(prompt).toContain(shot.transition);
    }

    const skillInput = buildMarketplaceVerticalDramaVideoPromptInput({
      shotId: shot.shotId,
      shot: { ...shot, dialogue: "" },
      cast: [],
      productName: "Product",
      productFacts: [],
      detectedPeople: [],
      characterPortraits: [],
    });
    expect(skillInput).toContain(shot.cameraDirection);
    expect(skillInput).toContain(shot.movementDirection);
    expect(skillInput).toContain(shot.transition);
  });
});
