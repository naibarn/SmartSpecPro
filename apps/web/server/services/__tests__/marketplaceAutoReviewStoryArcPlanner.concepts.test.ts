import { beforeEach, describe, expect, it, vi } from "vitest";
import { callLLMStructured } from "../callLLMStructured";
import { generateStagedStoryArcPlanWithLLM } from "../marketplaceAutoReviewStoryArcPlanner";

vi.mock("../callLLMStructured", () => ({
  callLLMStructured: vi.fn(),
}));

const concepts = [
  {
    conceptId: "idea-1",
    title: "Problem first",
    angle: "Start with the buyer's pain point",
    storySummary: "Show a problem, then demonstrate product evidence.",
  },
  {
    conceptId: "idea-2",
    title: "Daily use",
    angle: "Follow a real use case",
    storySummary: "Show the product in an everyday routine.",
  },
  {
    conceptId: "idea-3",
    title: "Fact check",
    angle: "Review only supported product details",
    storySummary: "Compare visible details with the product specifications.",
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
    mockCallLLMStructured.mockResolvedValue({ data: planData } as never);
  });

  it("returns three review concepts and includes the product brief and specs in the LLM input", async () => {
    const plan = await generateStagedStoryArcPlanWithLLM({
      runId: "run-ideas",
      userId: 7,
      tenantId: "tenant-1",
      model: "planning-test-model",
      product: {
        productId: "product-1",
        productName: "Travel bottle",
        description: "A leak-resistant bottle for commuting.",
        specs: { volume: "500 ml", material: "stainless steel" },
        imageUrls: [],
      },
    });

    expect(plan.source).toBe("llm_story_arc");
    expect(plan.conceptOptions).toEqual(concepts);
    expect(plan.selectedConceptId).toBe("idea-1");
    const call = mockCallLLMStructured.mock.calls[0]?.[0] as {
      userMessage: string;
    };
    expect(JSON.parse(call.userMessage)).toMatchObject({
      productDescription: "A leak-resistant bottle for commuting.",
      productSpecs: { volume: "500 ml", material: "stainless steel" },
    });
  });

  it("keeps the user's selected idea when drafting the full story", async () => {
    const selectedConcept = {
      conceptId: "idea-2",
      title: "Daily use",
      angle: "Follow a real use case",
      storySummary: "Show the product in an everyday routine.",
    };
    const plan = await generateStagedStoryArcPlanWithLLM({
      runId: "run-ideas-selected",
      model: "planning-test-model",
      selectedConcept,
      product: {
        productId: "product-1",
        productName: "Travel bottle",
        description: "A leak-resistant bottle for commuting.",
        imageUrls: [],
      },
    });

    expect(plan.selectedConceptId).toBe("idea-2");
    expect(plan.conceptOptions?.[0]).toEqual(selectedConcept);
  });
});
