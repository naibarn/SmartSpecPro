import { describe, it, expect } from "vitest";
import { applyRoutingPolicies } from "../routingPolicyEngine";
import { parseTaskProfile } from "../taskProfileParser";
import type { RoomIntentRouterInput } from "../roomIntentRouter";

function makeInput(message: string, opts: Partial<RoomIntentRouterInput> = {}): RoomIntentRouterInput {
  return {
    message,
    origin: "assistant",
    context: "run_turn",
    userId: 1,
    tenantId: "t-1",
    ...opts,
  };
}

function applyPolicy(message: string, opts: Partial<RoomIntentRouterInput> = {}) {
  const input = makeInput(message, opts);
  const profile = parseTaskProfile(message, { origin: input.origin, hasImages: input.hasImages });
  return applyRoutingPolicies(profile, input);
}

describe("routingPolicyEngine", () => {
  describe("forced routes", () => {
    it("forces agency route for explicit agency signals", () => {
      const d = applyPolicy("orchestrate a multi-step workflow");
      expect(d.forcedRoute).toBe("agency");
      expect(d.policyReasons).toContain("explicit_agency_signal");
    });

    it("forces agency for Thai agency signals", () => {
      const d = applyPolicy("ทำงานหลายขั้นตอน coordinate กัน");
      expect(d.forcedRoute).toBe("agency");
    });

    it("forces chat route for simple greetings", () => {
      expect(applyPolicy("hi").forcedRoute).toBe("chat");
      expect(applyPolicy("สวัสดี").forcedRoute).toBe("chat");
      expect(applyPolicy("hello!").forcedRoute).toBe("chat");
    });

    it("does not force route for task-like messages", () => {
      const d = applyPolicy("เขียนบทความเกี่ยวกับการเลี้ยงลูก");
      expect(d.forcedRoute).toBeUndefined();
    });
  });

  describe("freshness & web search", () => {
    it("requires web search when freshness is required", () => {
      const d = applyPolicy("รีวิวมือถือรุ่นใหม่ล่าสุด");
      expect(d.forceWebSearch).toBe(true);
      expect(d.requiredCapabilities).toContain("web_search");
    });

    it("does not force web search for generic articles", () => {
      const d = applyPolicy("เขียนบทความเกี่ยวกับแมว");
      expect(d.forceWebSearch).toBe(false);
    });
  });

  describe("review detection", () => {
    it("prefers product_review family for review requests", () => {
      const d = applyPolicy("รีวิวครีมกันแดด");
      expect(d.preferredFamilies).toContain("product_review");
    });

    it("forces web search for review with images", () => {
      const d = applyPolicy("รีวิวสินค้าตัวนี้", { hasImages: true });
      expect(d.forceWebSearch).toBe(true);
      expect(d.preferredFamilies).toContain("product_review");
    });
  });

  describe("modality-based preferences", () => {
    it("prefers media_prompts for image prompt requests", () => {
      const d = applyPolicy("สร้าง image prompt สำหรับ midjourney");
      expect(d.preferredFamilies).toContain("media_prompts");
    });

    it("prefers media_audio for audio requests", () => {
      const d = applyPolicy("สร้างเอฟเฟกต์เสียงฝนตก");
      expect(d.preferredFamilies).toContain("media_audio");
    });

    it("prefers media_video for video requests", () => {
      const d = applyPolicy("สร้างวิดีโอสั้นโปรโมท");
      expect(d.preferredFamilies).toContain("media_video");
    });
  });

  describe("complexity", () => {
    it("forces multi-skill for multi-deliverable tasks", () => {
      const d = applyPolicy("เขียนบทความพร้อมทั้งสร้างรูปภาพประกอบ");
      expect(d.forceMultiSkill).toBe(true);
      expect(d.policyReasons).toContain("multi_deliverable_detected");
    });

    it("does not force multi-skill for single tasks", () => {
      const d = applyPolicy("เขียนบทความเกี่ยวกับแมว");
      expect(d.forceMultiSkill).toBe(false);
    });
  });

  describe("capability needs", () => {
    it("requires vision when images are present", () => {
      const d = applyPolicy("Analyze this product", { hasImages: true });
      expect(d.requiredCapabilities).toContain("vision");
    });

    it("requires code execution for coding tasks", () => {
      const d = applyPolicy("เขียนโค้ด Python สำหรับ API");
      expect(d.requiredCapabilities).toContain("code_execution");
    });
  });

  describe("policy reasons audit trail", () => {
    it("includes all applied rule reasons", () => {
      const d = applyPolicy("รีวิวมือถือรุ่นใหม่ล่าสุด", { hasImages: true });
      expect(d.policyReasons.length).toBeGreaterThanOrEqual(2);
      // Should have freshness + review + vision reasons
      expect(d.policyReasons.some(r => r.includes("web"))).toBe(true);
      expect(d.policyReasons.some(r => r.includes("review"))).toBe(true);
    });
  });
});
