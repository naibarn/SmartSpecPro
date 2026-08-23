import { describe, expect, it } from "vitest";
import {
  buildDeterministicPromptExpansionPreview,
} from "../verticalDramaPromptExpansionService";
import {
  buildSlotPrompt,
  hashPrompt,
  inferPromptExpansionProfile,
  isSpecificResearchCandidate,
} from "@shared/verticalDramaSeries/promptExpansion";

describe("vertical drama prompt expansion", () => {
  it("keeps original prompt hash and classifies identifiable locations", () => {
    const prompt = "แนวสารคดี พาท่องเที่ยวหอไอเฟล";
    const preview = buildDeterministicPromptExpansionPreview({ prompt });
    expect(preview.originalPromptHash).toBe(hashPrompt(prompt));
    expect(preview.brief.profile).toBe("documentary");
    expect(preview.sources).toEqual([]);
    expect(isSpecificResearchCandidate(prompt)).toBe(true);
    expect(preview.slots.some(slot => slot.semanticRole === "scene_anchor")).toBe(true);
  });

  it("does not treat a broad topic as verified evidence", () => {
    const preview = buildDeterministicPromptExpansionPreview({ prompt: "แนวสารคดี ปะการังน้ำตื้นและการอนุรักษ์" });
    expect(preview.brief.factualClaims).toEqual([]);
    expect(preview.slots.every(slot => slot.evidenceStatus !== "verified")).toBe(true);
    expect(preview.warnings.length).toBeGreaterThan(0);
  });

  it("separates software subject reference from scene context", () => {
    const preview = buildDeterministicPromptExpansionPreview({ prompt: "รีวิวการใช้งานระบบ smartaihub.app เกี่ยวกับการสร้างซีรีย์แนวตั้ง" });
    expect(preview.brief.profile).toBe("software_review");
    expect(preview.slots.find(slot => slot.slotKey === "subject_detail")?.semanticRole).toBe("reference");
    expect(preview.slots.find(slot => slot.slotKey === "subject_detail")?.description).toContain("ไม่เลื่อนความหมาย");
  });

  it("builds a prompt that preserves the slot semantic role", () => {
    const preview = buildDeterministicPromptExpansionPreview({ prompt: "รีวิวร้านกาแฟหรูหราอยู่ริมอ่างเก็บน้ำ" });
    const slot = preview.slots[0]!;
    expect(buildSlotPrompt(slot, preview.brief)).toContain(slot.semanticRole);
    expect(buildSlotPrompt(slot, preview.brief)).toContain("Vertical 9:16");
  });
});
