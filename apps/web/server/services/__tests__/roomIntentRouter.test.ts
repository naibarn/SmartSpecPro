import { beforeEach, describe, expect, it, vi } from "vitest";
import { FALLBACK_CONTENT_SKILL_ID } from "../roomIntentRouter";

vi.mock("../skillDetector", () => ({
  detectSkill: vi.fn(),
}));

vi.mock("../skillIntentClassifier", () => ({
  classifyIntent: vi.fn(),
}));

vi.mock("../featureFlags", () => ({
  getTenantFeatureFlag: vi.fn().mockResolvedValue(false),
}));

vi.mock("../routingTelemetry", () => ({
  recordRoutingDecision: vi.fn(),
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

  it("defaults assistant-origin turns to content fallback after skill detection", async () => {
    mockDetectSkill.mockResolvedValue({
      detected: false,
      skill: null,
      confidence: 0,
      matchedTrigger: null,
      suggestedPrompt: null,
      patternChainTo: null,
    });

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
      reason: "assistant_content_fallback",
      source: "fallback",
      confidence: 0.5,
    });
    // detectSkill IS called for assistant origin (skill detection runs for all origins)
    expect(mockDetectSkill).toHaveBeenCalledTimes(1);
    // selectedSkillId should NOT be team-discussion-assistant
    expect(decision.selectedSkillId).toBe(FALLBACK_CONTENT_SKILL_ID);
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

  it("keeps conversational model-selection questions on the chat path", async () => {
    const decision = await routeRoomIntent({
      message: "ใช้ llm model อะไร",
      origin: "human_user",
      context: "room_message",
      userId: 1,
      tenantId: "tenant-1",
      roomId: "room-1",
    });

    expect(decision).toMatchObject({
      route: "chat",
      reason: "model_selection_query",
      source: "rules",
    });
    expect(mockDetectSkill).not.toHaveBeenCalled();
    expect(mockClassifyIntent).not.toHaveBeenCalled();
  });

  it("keeps model suitability questions on chat even when they mention creating images", async () => {
    const decision = await routeRoomIntent({
      message: "qwen 3.6 llm model เหมาะกับงานสร้างภาพกราฟิกหรือไม่",
      origin: "human_user",
      context: "room_message",
      userId: 1,
      tenantId: "tenant-1",
      roomId: "room-1",
    });

    expect(decision).toMatchObject({
      route: "chat",
      reason: "model_selection_query",
      source: "rules",
    });
    expect(mockDetectSkill).not.toHaveBeenCalled();
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

  it("falls back to chat when classifier throws in legacy routing", async () => {
    mockDetectSkill.mockResolvedValue({
      detected: false,
      skill: null,
      confidence: 0,
      matchedTrigger: null,
      suggestedPrompt: null,
      patternChainTo: null,
    });
    mockClassifyIntent.mockRejectedValue(new Error("LLM request failed"));

    const decision = await routeRoomIntent({
      message: "ช่วยวางแผนคอนเทนต์สินค้าเดือนนี้",
      origin: "human_user",
      context: "room_message",
      userId: 1,
      tenantId: "tenant-1",
      roomId: "room-1",
    });

    expect(decision.route).toBe("chat");
    expect(decision.source).toBe("fallback");
    expect(mockClassifyIntent).toHaveBeenCalledTimes(1);
  });
});
