import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("fs", () => ({
  default: {
    existsSync: vi.fn(() => true),
    readFileSync: vi.fn(() => "---\nname: vertical-drama-preset-synthesizer\n---\nSystem prompt body"),
  },
}));

vi.mock("@smartspec/skills", () => ({
  parseSkillFile: vi.fn(() => ({ content: "System prompt body" })),
}));

vi.mock("../skillFiles", () => ({
  resolveSkillDirCandidates: vi.fn(() => ["/fake/skills/vertical-drama-preset-synthesizer"]),
  resolveSkillManifestPath: vi.fn(() => "/fake/skills/vertical-drama-preset-synthesizer/skill.md"),
}));

const { mockHasEnoughCredits, mockDeductCredits, mockCalculateCreditsForLLM } = vi.hoisted(() => ({
  mockHasEnoughCredits: vi.fn(),
  mockDeductCredits: vi.fn(),
  mockCalculateCreditsForLLM: vi.fn(() => 2),
}));

vi.mock("../creditService", () => ({
  hasEnoughCredits: mockHasEnoughCredits,
  deductCredits: mockDeductCredits,
  calculateCreditsForLLM: mockCalculateCreditsForLLM,
}));

const { mockExecuteWithFallback } = vi.hoisted(() => ({
  mockExecuteWithFallback: vi.fn(),
}));

vi.mock("../llmRouter", () => ({
  executeWithFallback: mockExecuteWithFallback,
}));

vi.mock("../verticalDramaStoryBible", async () => {
  const actual = await vi.importActual<typeof import("../verticalDramaStoryBible")>(
    "../verticalDramaStoryBible",
  );
  return {
    ...actual,
    resolveStoryBibleModel: vi.fn(async () => "gpt-x"),
  };
});

vi.mock("../../_core/logger", () => ({
  debugError: vi.fn(),
  debugLog: vi.fn(),
}));

import {
  PresetSynthesisInputError,
  synthesizeVerticalDramaPreset,
  validatePresetSynthesisSelection,
} from "../verticalDramaPresetSynthesis";
import { VdSchemaValidationError } from "../verticalDramaStoryBible";

const VALID_DRAFT = {
  contract_version: 1,
  title: "ชามนี้มีเรื่อง",
  category: "thai-local-service-comedy-drama",
  logline: "ร้านก๋วยเตี๋ยวชุมชนที่เปลี่ยนทุกออเดอร์ผิดเป็นเรื่องอบอุ่น",
  mainPlot: "ป้าจอยและทีมร้านต้องรับมือลูกค้าสารพัดแบบในตลาดเช้า",
  seasonArc: "ร้านเริ่มจากปัญหารีวิวหนึ่งดาว ก่อนรวมใจสู้ค่าเช่าตลาด",
  tone: "คอมเมดี้บริการแบบไทย อบอุ่น จังหวะไว",
  cliffhangerStyle: "จบตอนด้วยออเดอร์หรือรีวิวที่หักมุม",
  characters: [
    { name: "ป้าจอย", role: "เจ้าของร้าน", description: "ปากไว ใจดี จำลูกค้าได้ทุกคน" },
    { name: "ต้น", role: "พนักงานใหม่", description: "จริงใจเกินพอดีและทำพลาดบ่อย" },
    { name: "มิว", role: "ลูกค้าประจำ", description: "ครีเอเตอร์สายกินที่ทำให้ร้านไวรัล" },
  ],
  visualBible: "ร้านก๋วยเตี๋ยวตลาดเช้า แสงอุ่น ไอน้ำ และป้ายเมนูเขียนมือ",
  mixRecipe: {
    primaryFlavor: "restaurant_service_skit",
    supportingFlavors: ["customer_staff_situation_comedy"],
    rationale: "ร้านอาหารเป็นแกน ลูกค้ากับพนักงานเป็นสถานการณ์ประจำตอน",
  },
  warnings: [],
};

function baseParams() {
  return {
    userId: 7,
    tenantId: "tenant-1",
    locale: "th" as const,
    selectedPresets: [
      {
        id: "101",
        title: "โต๊ะสามมีเรื่อง",
        category: "restaurant_service_skit",
        logline: "ร้านอาหารครอบครัวเจอออเดอร์ป่วน",
        mainPlot: "ร้านอาหารต้องรับมือลูกค้าหลากหลาย",
        seasonArc: "ร้านปรับตัวจากระบบเก่าสู่ระบบใหม่",
        tone: "ตลกอบอุ่น",
        cliffhangerStyle: "จบด้วยรีวิวใหม่",
        characters: [{ name: "แพรว", role: "ผู้จัดการ", description: "ตั้งใจเปลี่ยนร้าน" }],
        visualBible: "ร้านอาหารแสงอุ่น",
      },
    ],
    selectedCategories: ["customer_staff_situation_comedy"],
  };
}

describe("validatePresetSynthesisSelection", () => {
  it("requires at least two selected flavors", () => {
    expect(() =>
      validatePresetSynthesisSelection({ selectedPresets: [], selectedCategories: ["restaurant_service_skit"] }),
    ).toThrow(PresetSynthesisInputError);
  });

  it("caps selected flavors at five", () => {
    expect(() =>
      validatePresetSynthesisSelection({
        selectedPresets: [{}, {}, {}],
        selectedCategories: ["a", "b", "c"],
      }),
    ).toThrow(PresetSynthesisInputError);
  });
});

describe("synthesizeVerticalDramaPreset", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHasEnoughCredits.mockResolvedValue(true);
    mockExecuteWithFallback.mockResolvedValue({
      type: "success",
      response: {
        choices: [{ message: { content: JSON.stringify(VALID_DRAFT) } }],
        usage: { prompt_tokens: 100, completion_tokens: 50 },
      },
    });
  });

  it("returns a validated draft and deducts credits only after success", async () => {
    const result = await synthesizeVerticalDramaPreset(baseParams());

    expect(result.draft.title).toBe("ชามนี้มีเรื่อง");
    expect(mockHasEnoughCredits).toHaveBeenCalledWith(7, 1);
    expect(mockDeductCredits).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 7,
        tenantId: "tenant-1",
        amount: 2,
        sourceType: "skill",
      }),
    );
  });

  it("does not deduct credits when the LLM output fails schema validation", async () => {
    mockExecuteWithFallback.mockResolvedValue({
      type: "success",
      response: {
        choices: [{ message: { content: JSON.stringify({ title: "bad" }) } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      },
    });

    await expect(synthesizeVerticalDramaPreset(baseParams())).rejects.toBeInstanceOf(
      VdSchemaValidationError,
    );
    expect(mockDeductCredits).not.toHaveBeenCalled();
  });
});
