import { beforeEach, describe, expect, it, vi } from "vitest";
import { TEAM_DISCUSSION_SKILL_ID } from "../internalSkills";

vi.mock("../skillDetector", () => ({
  detectSkill: vi.fn(),
}));

vi.mock("../skillIntentClassifier", () => ({
  classifyIntent: vi.fn(),
}));

import { detectSkill } from "../skillDetector";
import { classifyIntent } from "../skillIntentClassifier";
import { routeRoomIntent } from "../roomIntentRouter";

const mockDetectSkill = vi.mocked(detectSkill);
const mockClassifyIntent = vi.mocked(classifyIntent);

describe("roomIntentRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("defaults assistant-origin turns to the internal team discussion skill", async () => {
    const decision = await routeRoomIntent({
      message: "Continue the handoff.",
      origin: "assistant",
      context: "run_turn",
      userId: 1,
      tenantId: "tenant-1",
      roomId: "room-1",
    });

    expect(decision).toMatchObject({
      route: "skill",
      selectedSkillId: TEAM_DISCUSSION_SKILL_ID,
      reason: "assistant_discussion_default",
      source: "fallback",
    });
    expect(mockDetectSkill).not.toHaveBeenCalled();
    expect(mockClassifyIntent).not.toHaveBeenCalled();
  });

  it("keeps short human greetings on the chat path", async () => {
    mockDetectSkill.mockResolvedValue({
      detected: false,
      skill: null,
      confidence: 0,
      matchedTrigger: null,
      suggestedPrompt: null,
      patternChainTo: null,
    });

    const decision = await routeRoomIntent({
      message: "สวัสดี",
      origin: "human_user",
      context: "room_message",
      userId: 1,
      tenantId: "tenant-1",
      roomId: "room-1",
    });

    expect(decision.route).toBe("chat");
    expect(mockDetectSkill).toHaveBeenCalledTimes(1);
    expect(mockClassifyIntent).not.toHaveBeenCalled();
  });

  it("escalates complex human tasks to agency", async () => {
    mockDetectSkill.mockResolvedValue({
      detected: false,
      skill: null,
      confidence: 0,
      matchedTrigger: null,
      suggestedPrompt: null,
      patternChainTo: null,
    });
    mockClassifyIntent.mockResolvedValue({
      level: "complex",
      strategy: "agent",
      skills: [
        {
          skillId: "content-strategy",
          confidence: 0.92,
          reason: "multi-step planning needed",
          extractedParams: {},
          missingRequiredParams: [],
        },
      ],
      reasoning: "Requires multi-step orchestration",
    } as any);

    const decision = await routeRoomIntent({
      message: "ช่วยวางแผนแคมเปญ 3 ขั้นตอนพร้อมตรวจทาน",
      origin: "human_user",
      context: "room_message",
      userId: 1,
      tenantId: "tenant-1",
      roomId: "room-1",
    });

    expect(decision.route).toBe("agency");
    expect(decision.agencyEscalation).toBe(true);
    expect(mockDetectSkill).toHaveBeenCalledTimes(1);
    expect(mockClassifyIntent).toHaveBeenCalledTimes(1);
  });
});
