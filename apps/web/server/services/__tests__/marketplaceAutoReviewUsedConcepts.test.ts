import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { callLLMStructured } from "../callLLMStructured";
import {
  generateStagedStoryArcPlanWithLLM,
  type StagedStoryConceptOption,
} from "../marketplaceAutoReviewStoryArcPlanner";
import {
  collectUsedReviewConcepts,
  findConfirmedStagedReviewConcept,
  isRepeatedReviewConcept,
  loadUsedReviewConcepts,
  rememberUsedReviewConcept,
} from "../marketplaceAutoReviewUsedConcepts";

vi.mock("../callLLMStructured", () => ({ callLLMStructured: vi.fn() }));
vi.mock("../skillRegistry", () => ({
  syncSingleSkillIfChanged: vi.fn().mockResolvedValue({}),
  getSkillByIdAsync: vi.fn().mockResolvedValue({ systemPrompt: "Write review concepts." }),
}));

function option(conceptId: string, title: string, angle: string): StagedStoryConceptOption {
  return {
    conceptId,
    title,
    angle,
    storySummary: `เรื่องราวการใช้งานจริง ${title}`,
    dialoguePreview: `ผู้พูด: มาลองดูสถานการณ์นี้กัน ${angle}`,
  };
}

const used = option("concept-1", "เช็ดคราบหลังมื้อเย็น",
  "ทดสอบคราบน้ำมันที่ติดโต๊ะหลังทำอาหารเย็นสำหรับครอบครัว");
const offeredOnly = option("concept-2", "เตรียมโต๊ะรับแขก",
  "เตรียมโต๊ะก่อนแขกมาและจับเวลาสำหรับการทำความสะอาด");
const newOptions = [
  offeredOnly,
  option("concept-3", "เก็บของเข้าตู้", "ทดสอบวิธีเก็บอุปกรณ์หลังล้างให้ประหยัดพื้นที่"),
  option("concept-4", "เลือกผ้าให้เหมาะ", "ทดลองพื้นผิวต่างชนิดเพื่อเลือกผ้าที่ใช้งานเหมาะสม"),
];
const stagedRow = {
  staged: true,
  hasStoryboard: true,
  selectedConceptId: "default-scaffold",
  stagedSelection: used,
  previousSelections: [],
  legacyConceptSet: null,
};

function summary({ title, angle, storySummary }: StagedStoryConceptOption) {
  return { title, angle, storySummary };
}

describe("Marketplace review concept history", () => {
  beforeEach(() => vi.clearAllMocks());

  it("ignores unconfirmed options and only retains the chosen legacy option", () => {
    const result = collectUsedReviewConcepts([
      { ...stagedRow, hasStoryboard: false, stagedSelection: offeredOnly },
      stagedRow,
      { ...stagedRow, staged: false, selectedConceptId: "concept-1", legacyConceptSet: {
        alternatives: [used, offeredOnly],
      } },
      { ...stagedRow, staged: false, hasStoryboard: false, selectedConceptId: "concept-2",
        legacyConceptSet: { alternatives: [offeredOnly] },
      },
    ]);
    expect(result).toEqual([summary(used)]);
  });

  it("retains a previously confirmed choice through story redrafts", () => {
    const plan = { selectedConceptId: used.conceptId, conceptOptions: [offeredOnly, used] };
    expect(findConfirmedStagedReviewConcept({ ...plan, shots: [] })).toBeUndefined();
    const confirmed = findConfirmedStagedReviewConcept({
      ...plan,
      shots: [{} as Parameters<typeof findConfirmedStagedReviewConcept>[0]["shots"][number]],
    });
    const previousSelections = rememberUsedReviewConcept([], confirmed);
    expect(rememberUsedReviewConcept(previousSelections, confirmed)).toEqual([summary(used)]);
    expect(collectUsedReviewConcepts([
      { ...stagedRow, previousSelections, stagedSelection: offeredOnly },
    ])).toEqual([summary(used), summary(offeredOnly)]);
  });

  it("uses the authored storyboard as history when an older redraft lost its selection", () => {
    expect(collectUsedReviewConcepts([{
      ...stagedRow,
      stagedSelection: null,
      stagedStoryboardSummary: used.storySummary,
    }])).toEqual([{ title: "", angle: used.storySummary, storySummary: "" }]);
  });

  it("loads history for the same tenant, owner and product and excludes the current job", async () => {
    const orderBy = vi.fn().mockResolvedValue([stagedRow]);
    const where = vi.fn().mockReturnValue({ orderBy });
    const db = { select: () => ({ from: () => ({ where }) }) };
    await expect(loadUsedReviewConcepts(db as never, {
      id: "current-run", userId: 12, tenantId: "tenant-1", productId: "product-42",
    })).resolves.toEqual([summary(used)]);
    const query = new PgDialect().sqlToQuery(where.mock.calls[0][0]);
    expect(query.sql).toContain('"marketplace_auto_review_runs"."id" <>');
    expect(query.params).toEqual(["tenant-1", 12, "product-42", "current-run"]);
  });

  it("rejects renamed copies of a Thai premise with minor edits", () => {
    expect(isRepeatedReviewConcept(used, {
      title: "ชื่อใหม่",
      angle: `${used.angle}วันนี้`,
      storySummary: "เรื่องย่อใหม่",
    })).toBe(true);
    expect(isRepeatedReviewConcept(used, offeredOnly)).toBe(false);
  });

  it("passes selected history to the skill and rejects repeated options before publishing", async () => {
    vi.mocked(callLLMStructured).mockImplementation(async request => {
      expect(JSON.parse(request.userMessage as string).usedReviewConcepts).toEqual([summary(used)]);
      expect(request.systemPrompt).toContain("substantially the same story");
      const repeated = {
        ...used, conceptId: "different-id", title: "เปลี่ยนชื่อแต่เล่าเรื่องเดิม",
      };
      expect(request.zodSchema.safeParse({
        conceptOptions: [repeated, ...newOptions.slice(1)],
      }).success).toBe(false);
      expect(request.zodSchema.safeParse({
        conceptOptions: [newOptions[0], { ...newOptions[0], conceptId: "another-id" }, newOptions[2]],
      }).success).toBe(false);
      return {
        data: request.zodSchema.parse({ conceptOptions: newOptions }),
        modelId: "test-model",
        providerName: "test-provider",
        creditsUsed: 1,
        tokensUsed: 100,
      };
    });
    const plan = await generateStagedStoryArcPlanWithLLM({
      runId: "new-run",
      userId: 12,
      tenantId: "tenant-1",
      model: "test-model",
      product: { productId: "product-42", productName: "ชุดทำความสะอาด", imageUrls: [] },
      referenceManifestHash: "refs",
      conceptsOnly: true,
      usedReviewConcepts: [summary(used)],
    });
    expect(plan.conceptOptions).toEqual(newOptions);
    expect(plan.shots).toEqual([]);
  });
});
