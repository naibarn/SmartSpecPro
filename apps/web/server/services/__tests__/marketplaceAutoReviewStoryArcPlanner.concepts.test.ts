import { beforeEach, describe, expect, it, vi } from "vitest";
import { callLLMStructured } from "../callLLMStructured";
import { generateStagedStoryArcPlanWithLLM } from "../marketplaceAutoReviewStoryArcPlanner";

vi.mock("../callLLMStructured", () => ({
  callLLMStructured: vi.fn(),
}));
vi.mock("../skillRegistry", () => ({
  syncSingleSkillIfChanged: vi.fn().mockResolvedValue({ synced: false }),
  getSkillByIdAsync: vi.fn().mockResolvedValue({
    systemPrompt: "Use skill authored natural dialogue and concepts-first flow.",
  }),
}));

const concepts = [
  {
    conceptId: "idea-1",
    title: "Problem first",
    angle: "Start with the buyer's pain point",
    storySummary: "Show a problem, then demonstrate product evidence.",
    dialoguePreview: "พิมพ์ชนก: ขวดนี้พกไปทำงานสะดวกดีนะ\nธีร์: ฝาเปิดปิดยังไง?\nพิมพ์ชนก: หมุนตรงนี้ แล้วดูข้อมูลบนฉลากได้เลย",
  },
  {
    conceptId: "idea-2",
    title: "Daily use",
    angle: "Follow a real use case",
    storySummary: "Show the product in an everyday routine.",
    dialoguePreview: "พิมพ์ชนก: เช้านี้ฉันพกขวดมาเอง\nธีร์: น้ำหนักเป็นยังไงตอนใส่กระเป๋า?\nพิมพ์ชนก: เบาดี แล้วความจุก็ตรงตามที่ระบุไว้",
  },
  {
    conceptId: "idea-3",
    title: "Fact check",
    angle: "Review only supported product details",
    storySummary: "Compare visible details with the product specifications.",
    dialoguePreview: "ธีร์: บนรายละเอียดเขียนว่า 500 มิลลิลิตร\nพิมพ์ชนก: ใช่ วัสดุเป็นสเตนเลสตามข้อมูลสินค้า\nธีร์: งั้นรีวิวตามข้อมูลนี้ได้เลย",
  },
];

const planData = {
  storySummary: "A complete nine-shot marketplace review.",
  conceptOptions: concepts,
  selectedConceptId: "idea-1",
  shots: Array.from({ length: 9 }, (_, index) => ({
    shotId: index + 1,
    title: `Shot ${index + 1}`,
    storySummary: `Beat ${index + 1}`,
    visualSummary: `Visual ${index + 1}`,
    dialogue: `Line ${index + 1}`,
  })),
};

describe("generateStagedStoryArcPlanWithLLM concepts", () => {
  const mockCallLLMStructured = vi.mocked(callLLMStructured);

  beforeEach(() => {
    mockCallLLMStructured.mockReset();
    mockCallLLMStructured.mockResolvedValue({
      data: planData,
      modelId: "planning-test-model",
      providerName: "test-provider",
    } as never);
  });

  it("returns three review concepts and includes the product brief and specs in the LLM input", async () => {
    const plan = await generateStagedStoryArcPlanWithLLM({
      runId: "run-ideas",
      userId: 7,
      tenantId: "tenant-1",
      model: "planning-test-model",
      referenceManifestHash: "refs-ideas",
      product: {
        productId: "product-1",
        productName: "Travel bottle",
        description: "A leak-resistant bottle for commuting.",
        specs: { volume: "500 ml", material: "stainless steel" },
        imageUrls: [],
      },
      conceptsOnly: true,
    });

    expect(plan.source).toBe("llm_story_arc");
    expect(plan.conceptOptions).toEqual(concepts);
    expect(plan.selectedConceptId).toBeUndefined();
    expect(plan.shots).toEqual([]);
    const call = mockCallLLMStructured.mock.calls[0]?.[0] as {
      userMessage: string;
      systemPrompt: string;
    };
    expect(call.systemPrompt).toContain("skill authored natural dialogue");
    expect(JSON.parse(call.userMessage)).toMatchObject({
      productDescription: "A leak-resistant bottle for commuting.",
      productSpecs: { volume: "500 ml", material: "stainless steel" },
    });
    expect(call).toMatchObject({
      maxRetries: 0,
      disableProviderFallbacks: true,
    });
  });

  it("does not require a full-story summary in concepts-only output", async () => {
    await generateStagedStoryArcPlanWithLLM({
      runId: "run-concepts-schema",
      userId: 7,
      tenantId: "tenant-1",
      model: "planning-test-model",
      referenceManifestHash: "refs-concepts-schema",
      product: {
        productId: "product-1",
        productName: "Travel bottle",
        imageUrls: [],
      },
      conceptsOnly: true,
    });

    const call = mockCallLLMStructured.mock.calls.at(-1)?.[0] as {
      zodSchema: { safeParse: (value: unknown) => { success: boolean } };
    };
    expect(call.zodSchema.safeParse({ conceptOptions: concepts }).success).toBe(
      true
    );
  });

  it("bounds long marketplace descriptions to the planner's 500-character contract", async () => {
    const longDescription = "รายละเอียดสินค้า ".repeat(100);
    await generateStagedStoryArcPlanWithLLM({
      runId: "run-long-description",
      userId: 7,
      tenantId: "tenant-1",
      model: "planning-test-model",
      referenceManifestHash: "refs-long-description",
      product: {
        productId: "product-1",
        productName: "Travel bottle",
        description: longDescription,
        specs: { volume: "500 ml" },
        imageUrls: [],
      },
      conceptsOnly: true,
    });

    const call = mockCallLLMStructured.mock.calls[0]?.[0] as {
      userMessage: string;
    };
    expect(JSON.parse(call.userMessage).productDescription).toHaveLength(500);
  });

  it("rejects missing model provenance instead of labeling the response with the requested model", async () => {
    mockCallLLMStructured.mockResolvedValueOnce({
      data: planData,
      providerName: "test-provider",
    } as never);

    await expect(
      generateStagedStoryArcPlanWithLLM({
        runId: "run-missing-model-provenance",
        userId: 7,
        tenantId: "tenant-1",
        model: "planning-test-model",
        referenceManifestHash: "refs-missing-model-provenance",
        product: {
          productId: "product-1",
          productName: "Travel bottle",
          description: "A leak-resistant bottle for commuting.",
          imageUrls: [],
        },
      })
    ).rejects.toThrow("STAGED_STORY_PLAN_PROVIDER_PROVENANCE_MISSING");
  });

  it("keeps the user's selected idea when drafting the full story", async () => {
    const selectedConcept = {
      conceptId: "idea-2",
      title: "Daily use",
      angle: "Follow a real use case",
      storySummary: "Show the product in an everyday routine.",
      dialoguePreview: "พิมพ์ชนก: เช้านี้ฉันพกขวดมาเอง\nธีร์: น้ำหนักเป็นยังไงตอนใส่กระเป๋า?\nพิมพ์ชนก: เบาดี แล้วความจุก็ตรงตามที่ระบุไว้",
    };
    const plan = await generateStagedStoryArcPlanWithLLM({
      runId: "run-ideas-selected",
      userId: 7,
      tenantId: "tenant-1",
      model: "planning-test-model",
      referenceManifestHash: "refs-selected",
      selectedConcept,
      product: {
        productId: "product-1",
        productName: "Travel bottle",
        description: "A leak-resistant bottle for commuting.",
        imageUrls: [],
      },
    });

    expect(plan.selectedConceptId).toBe("idea-2");
    expect(
      plan.conceptOptions?.find(option => option.conceptId === "idea-2")
    ).toEqual(selectedConcept);
  });

  it("surfaces the skill error without returning a deterministic plan", async () => {
    mockCallLLMStructured.mockRejectedValueOnce(
      new Error("provider unavailable")
    );

    await expect(
      generateStagedStoryArcPlanWithLLM({
        runId: "run-ideas-error",
        userId: 7,
        tenantId: "tenant-1",
        model: "planning-test-model",
        referenceManifestHash: "refs-error",
        product: {
          productId: "product-1",
          productName: "Travel bottle",
          description: "A leak-resistant bottle for commuting.",
          imageUrls: [],
        },
      })
    ).rejects.toThrow("STAGED_STORY_PLAN_SKILL_FAILED:provider unavailable");
  });
});
