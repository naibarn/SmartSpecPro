import { describe, expect, it } from "vitest";
import {
  buildFrameRoleContext,
  buildFrameSourceRevision,
  createFrameSemanticHandoff,
  normalizeRoleAwareFramePromptOutput,
  sha256Prompt,
} from "../verticalDramaFrameRoles";

describe("vertical drama frame roles", () => {
  it("keeps the Thanwa opening beat out of the start prompt and puts the terminal action in stop context", () => {
    const synopsis =
      "ธันวาในเสื้อเชิ้ตยับเปียกฝนรีบเดินฝ่าตลาดปลารุ่งอรุณ หลบสายตาคนตามหาและกดปิดโทรศัพท์ก่อนซุกมันลงถังลังน้ำแข็งว่าง เขาตัดสินใจทิ้งตัวตนซีอีโอชั่วคราวเพื่อเอาตัวรอดในตลาด";
    const start = buildFrameRoleContext({
      role: "start",
      canonicalSynopsis: synopsis,
    });
    const stop = buildFrameRoleContext({
      role: "stop",
      canonicalSynopsis: synopsis,
      currentStartPrompt: "Thanwa moves through the dawn fish market, rain-soaked and wary.",
    });

    expect(start).toContain("earliest useful frozen opening beat");
    expect(start).toContain("Do not depict the later phone disposal");
    expect(stop).toContain("terminal frozen beat");
    expect(stop).toContain("current_start_prompt");
    expect(stop).toContain("Thanwa moves through the dawn fish market");
  });

  it("accepts legacy v1 only for start and requires v2 stop role", () => {
    expect(
      normalizeRoleAwareFramePromptOutput(
        { prompt: "opening", negative_prompt: "" },
        "start",
      ).frame_role,
    ).toBe("start");
    expect(() =>
      normalizeRoleAwareFramePromptOutput(
        { prompt: "terminal", negative_prompt: "" },
        "stop",
      ),
    ).toThrow(/version 2|frame_role/i);
    expect(() =>
      normalizeRoleAwareFramePromptOutput(
        { contract_version: 2, frame_role: "start", prompt: "wrong" },
        "stop",
      ),
    ).toThrow(/role/i);
  });

  it("preserves a 6,000-character start prompt when preparing stop input", () => {
    const startPrompt = "x".repeat(6_000);
    const context = buildFrameRoleContext({
      role: "stop",
      canonicalSynopsis: "A terminal beat.",
      currentStartPrompt: startPrompt,
    });
    expect(context).toContain(`current_start_prompt: ${startPrompt}`);
    expect(context.indexOf(startPrompt)).toBeGreaterThanOrEqual(0);
  });

  it("creates stable hashes and a bounded semantic handoff", () => {
    const hash = sha256Prompt("ธันวา");
    expect(hash).toMatch(/^sha256:[0-9a-f]{64}$/);
    const a = buildFrameSourceRevision({ b: 2, a: 1 });
    const b = buildFrameSourceRevision({ a: 1, b: 2 });
    expect(a).toBe(b);
    const handoff = createFrameSemanticHandoff({
      role: "start",
      openingMoment: "walks through market",
      terminalMoment: "hides phone",
      storyMeaning: "survival",
      continuityLocks: ["rain-soaked shirt"],
      sourceRevision: a,
    });
    expect(handoff.continuity_locks).toEqual(["rain-soaked shirt"]);
    expect(JSON.stringify(handoff).length).toBeLessThanOrEqual(4_000);
  });
});
