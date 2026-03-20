import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../skillDetector", () => ({
  detectSkill: vi.fn(),
}));

vi.mock("../skillIntentClassifier", () => ({
  classifyIntent: vi.fn(),
}));

import { detectSkill } from "../skillDetector";
import { classifyIntent } from "../skillIntentClassifier";
import { routeRoomIntent, FALLBACK_CONTENT_SKILL_ID } from "../roomIntentRouter";

const mockDetectSkill = vi.mocked(detectSkill);
const mockClassifyIntent = vi.mocked(classifyIntent);

const baseInput = {
  context: "run_turn" as const,
  userId: 1,
  tenantId: "tenant-1",
  roomId: "room-1",
};

const noDetection = {
  detected: false,
  skill: null,
  confidence: 0,
  matchedTrigger: null,
  suggestedPrompt: null,
  patternChainTo: null,
};

describe("routeRoomIntent -- assistant origin skill detection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should call detectSkill for assistant origin messages", async () => {
    mockDetectSkill.mockResolvedValue({
      detected: true,
      skill: { id: "business-article-writer" } as any,
      confidence: 0.75,
      matchedTrigger: null,
      suggestedPrompt: null,
      patternChainTo: null,
    });

    const decision = await routeRoomIntent({
      ...baseInput,
      origin: "assistant",
      message: "เขียนบทความเกี่ยวกับธุรกิจ",
    });

    expect(mockDetectSkill).toHaveBeenCalledTimes(1);
    expect(decision.selectedSkillId).toBe("business-article-writer");
    expect(decision.source).toBe("skill-detect");
  });

  it("should return detected skill when confidence >= 0.6", async () => {
    mockDetectSkill.mockResolvedValue({
      detected: true,
      skill: { id: "creative-story-writer" } as any,
      confidence: 0.6,
      matchedTrigger: null,
      suggestedPrompt: null,
      patternChainTo: null,
    });

    const decision = await routeRoomIntent({
      ...baseInput,
      origin: "assistant",
      message: "Write a story about dragons",
    });

    expect(decision.route).toBe("skill");
    expect(decision.selectedSkillId).toBe("creative-story-writer");
    expect(decision.confidence).toBe(0.6);
  });

  it("should use fallback when confidence < 0.6 and message is Thai", async () => {
    mockDetectSkill.mockResolvedValue({
      detected: true,
      skill: { id: "some-skill" } as any,
      confidence: 0.4,
      matchedTrigger: null,
      suggestedPrompt: null,
      patternChainTo: null,
    });

    const decision = await routeRoomIntent({
      ...baseInput,
      origin: "assistant",
      message: "สร้างเนื้อหาเกี่ยวกับการท่องเที่ยว",
    });

    expect(decision.route).toBe("skill");
    expect(decision.selectedSkillId).toBe(FALLBACK_CONTENT_SKILL_ID);
    expect(decision.source).toBe("fallback");
  });

  it("should use English fallback when confidence < 0.6 and message is English", async () => {
    mockDetectSkill.mockResolvedValue({
      detected: false,
      skill: null,
      confidence: 0.3,
      matchedTrigger: null,
      suggestedPrompt: null,
      patternChainTo: null,
    });

    const decision = await routeRoomIntent({
      ...baseInput,
      origin: "assistant",
      message: "Write an article about technology trends",
    });

    expect(decision.route).toBe("skill");
    expect(decision.selectedSkillId).toBe(FALLBACK_CONTENT_SKILL_ID);
    expect(decision.source).toBe("fallback");
  });

  it("should never return team-discussion-assistant as selectedSkillId", async () => {
    mockDetectSkill.mockResolvedValue(noDetection);

    const decision = await routeRoomIntent({
      ...baseInput,
      origin: "assistant",
      message: "Continue the handoff.",
    });

    expect(decision.selectedSkillId).not.toBe("team-discussion-assistant");
  });

  it("should detect Thai-capable skill for Thai objective", async () => {
    mockDetectSkill.mockResolvedValue({
      detected: true,
      skill: { id: "education-article-writer" } as any,
      confidence: 0.8,
      matchedTrigger: null,
      suggestedPrompt: null,
      patternChainTo: null,
    });

    const decision = await routeRoomIntent({
      ...baseInput,
      origin: "assistant",
      message: "ช่วยเขียนบทความเกี่ยวกับการเลี้ยงลูก",
    });

    expect(decision.selectedSkillId).toBe("education-article-writer");
    expect(decision.source).toBe("skill-detect");
  });

  it("should still handle explicit agency signal for assistant origin", async () => {
    const decision = await routeRoomIntent({
      ...baseInput,
      origin: "assistant",
      message: "escalate this multi-step task",
    });

    expect(decision.route).toBe("agency");
    expect(decision.agencyEscalation).toBe(true);
    expect(mockDetectSkill).not.toHaveBeenCalled();
  });

  it("should handle system origin the same as assistant", async () => {
    mockDetectSkill.mockResolvedValue({
      detected: true,
      skill: { id: "brainstorm" } as any,
      confidence: 0.7,
      matchedTrigger: null,
      suggestedPrompt: null,
      patternChainTo: null,
    });

    const decision = await routeRoomIntent({
      ...baseInput,
      origin: "system",
      message: "Summarize the discussion",
    });

    expect(mockDetectSkill).toHaveBeenCalledTimes(1);
    expect(decision.selectedSkillId).toBe("brainstorm");
    expect(decision.source).toBe("skill-detect");
  });

  it("should use 0.6 threshold for assistant vs 0.7 for human_user", async () => {
    mockDetectSkill.mockResolvedValue({
      detected: true,
      skill: { id: "general-article-writer" } as any,
      confidence: 0.65,
      matchedTrigger: null,
      suggestedPrompt: null,
      patternChainTo: null,
    });

    // assistant origin: 0.65 >= 0.6 -> should return detected skill
    const assistantDecision = await routeRoomIntent({
      ...baseInput,
      origin: "assistant",
      message: "Write about technology",
    });
    expect(assistantDecision.selectedSkillId).toBe("general-article-writer");
    expect(assistantDecision.source).toBe("skill-detect");

    // human_user origin: 0.65 < 0.7 -> should NOT return detected skill
    mockClassifyIntent.mockResolvedValue(null);
    const humanDecision = await routeRoomIntent({
      ...baseInput,
      origin: "human_user",
      message: "Write about technology",
    });
    expect(humanDecision.selectedSkillId).not.toBe("general-article-writer");
  });

  it("should set confidence to 0.5 for fallback decisions", async () => {
    mockDetectSkill.mockResolvedValue(noDetection);

    const decision = await routeRoomIntent({
      ...baseInput,
      origin: "assistant",
      message: "Help with the task",
    });

    expect(decision.confidence).toBe(0.5);
    expect(decision.reason).toBe("assistant_content_fallback");
  });
});
