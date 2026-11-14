import { beforeEach, describe, expect, it, vi } from "vitest";
import { callLLMStructured } from "../callLLMStructured";
import { generateStagedStoryArcPlanWithLLM } from "../marketplaceAutoReviewStoryArcPlanner";

vi.mock("../callLLMStructured", () => ({
  callLLMStructured: vi.fn(),
}));

const concepts = [
  {
    conceptId: "idea-1",
    title: "Product-led story",
    angle: "Use the product as part of the relationship story",
    storySummary:
      "A couple teases each other while demonstrating verified product facts.",
  },
  {
    conceptId: "idea-2",
    title: "Daily routine",
    angle: "Show a relatable use case",
    storySummary: "The leads discover how the product fits their routine.",
  },
  {
    conceptId: "idea-3",
    title: "Proof first",
    angle: "Demonstrate supported product details",
    storySummary: "The leads test and discuss observable product features.",
  },
];

const twoLeadPlan = {
  storySummary: "Two adult leads tease each other while reviewing the product.",
  conceptOptions: concepts,
  selectedConceptId: "idea-1",
  shots: Array.from({ length: 9 }, (_, index) => ({
    shotId: index + 1,
    title: `Shot ${index + 1}`,
    storySummary: `Beat ${index + 1}`,
    visualSummary: `Visual ${index + 1}`,
    dialogueTurns: [
      { castId: "cast-1", line: "ลองชิ้นนี้ดูไหม" },
      { castId: "cast-2", line: "ถามเพราะสินค้า หรือเพราะอยากคุยกับผม" },
    ],
    castInShot: ["cast-1", "cast-2"],
  })),
};

describe("Marketplace Auto Review drama tie-in format", () => {
  const mockCallLLMStructured = vi.mocked(callLLMStructured);

  beforeEach(() => {
    mockCallLLMStructured.mockReset();
    mockCallLLMStructured.mockResolvedValue({
      data: twoLeadPlan,
      modelId: "planning-test-model",
      providerName: "test-provider",
    } as never);
  });

  it("requires two lead cast members before calling the planner", async () => {
    await expect(
      generateStagedStoryArcPlanWithLLM({
        runId: "run-tie-in-no-cast",
        userId: 7,
        tenantId: "tenant-1",
        model: "planning-test-model",
        referenceManifestHash: "refs-tie-in-no-cast",
        reviewFormat: "drama_tie_in",
        product: {
          productId: "product-1",
          productName: "Travel bottle",
          imageUrls: [],
        },
      })
    ).rejects.toThrow("STAGED_TIE_IN_TWO_LEADS_REQUIRED");
    expect(mockCallLLMStructured).not.toHaveBeenCalled();
  });

  it("plans romantic product banter with exact speaker IDs and verified product details", async () => {
    await generateStagedStoryArcPlanWithLLM({
      runId: "run-romantic-tie-in",
      userId: 7,
      tenantId: "tenant-1",
      model: "planning-test-model",
      referenceManifestHash: "refs-romantic-tie-in",
      reviewFormat: "drama_tie_in",
      product: {
        productId: "product-1",
        productName: "เครื่องชงกาแฟ",
        description: "เครื่องชงกาแฟพร้อมตั้งเวลาและก้านชง 58 มิล",
        specs: { portafilter: "58 mm", timer: "programmable" },
        imageUrls: [],
      },
      cast: [
        {
          castId: "cast-1",
          name: "พิมพ์ชนก",
          source: "uploaded",
          role: "host",
          descriptor: "adult woman, cream blouse, foreground left",
          ageRange: "young_adult_20_29",
          depictsMinor: false,
          imageIndex: 1,
        },
        {
          castId: "cast-2",
          name: "ธีร์",
          source: "uploaded",
          role: "guest",
          descriptor: "adult man, dark jacket, foreground right",
          ageRange: "adult_30_39",
          depictsMinor: false,
          imageIndex: 2,
        },
      ],
    });

    const call = mockCallLLMStructured.mock.calls[0]?.[0] as {
      systemPrompt: string;
      userMessage: string;
    };
    expect(call.systemPrompt).toContain("## Drama Tie-in Format");
    expect(call.systemPrompt).toContain(
      'Keep the opening focused on the couple\'s interaction before the story turns'
    );
    expect(call.systemPrompt).not.toContain("ROMANTIC PRODUCT TIE-IN LOCK");
    expect(call.systemPrompt).toContain("ผู้พูดต้องตรงกับ castId");
    expect(call.systemPrompt).toContain(
      "ห้ามแต่งคุณสมบัติหรือผลลัพธ์ของสินค้า"
    );
    expect(call.systemPrompt).toContain("ageRange: young_adult_20_29");
    expect(call.systemPrompt).toContain("depictsMinor: no");
    expect(JSON.parse(call.userMessage)).toMatchObject({
      reviewFormat: "drama_tie_in",
      productName: "เครื่องชงกาแฟ",
      cast: [
        {
          castId: "cast-1",
          ageRange: "young_adult_20_29",
          depictsMinor: false,
        },
        { castId: "cast-2", ageRange: "adult_30_39", depictsMinor: false },
      ],
    });
  });
});
