import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildSceneVisualStatePlannerUserPrompt,
  VD_SCENE_VISUAL_STATE_CONTRACT_FIELDS,
  VD_SCENE_VISUAL_STATE_OUTPUT_KEY,
  VD_SCENE_VISUAL_STATE_REQUIRED_SECTION_HEADERS,
  VD_SCENE_VISUAL_STATE_SKILL_FOLDER,
} from "../verticalDramaSceneVisualState";
import { VD_COMPACT_JSON_INSTRUCTION } from "../verticalDramaStoryBible";

const SKILL_DIR = resolve(__dirname, "../../../skills", VD_SCENE_VISUAL_STATE_SKILL_FOLDER);
const lowerPath = resolve(SKILL_DIR, "skill.md");
const upperPath = resolve(SKILL_DIR, "SKILL.md");

describe("real scene visual state skill file", () => {
  const lower = readFileSync(lowerPath, "utf8");

  it("exists at the lowercase-first loader path with safe direct-invocation metadata", () => {
    expect(existsSync(lowerPath)).toBe(true);
    expect(lower.startsWith("---\n")).toBe(true);
    expect(lower).toContain("auto_trigger: false");
    expect(lower).toContain("trigger_patterns: []");
    expect(lower.split("---").at(-1)?.trim().length).toBeGreaterThan(0);
  });

  it("keeps lowercase and uppercase twins byte-identical", () => {
    expect(readFileSync(upperPath, "utf8")).toBe(lower);
  });

  it("declares every code-read field and every required section", () => {
    expect(lower).toContain(`"${VD_SCENE_VISUAL_STATE_OUTPUT_KEY}"`);
    expect(lower).toContain('"contract_version": 1');
    for (const field of VD_SCENE_VISUAL_STATE_CONTRACT_FIELDS) {
      expect(lower).toContain(`"${field}"`);
    }
    for (const header of VD_SCENE_VISUAL_STATE_REQUIRED_SECTION_HEADERS) {
      expect(lower).toContain(`## ${header}`);
    }
  });

  it("keeps ownership fields outside the JSON contract and teaches lock-not-describe", () => {
    const contractFence = lower.match(/Return exactly this shape:\n\n```json\n([\s\S]*?)\n```/)?.[1] ?? "";
    for (const field of [
      "location_key", "membership_hash", "revision", "planned_at",
      "skill_version", "manual_edit", "stale",
    ]) {
      expect(contractFence).not.toContain(`"${field}"`);
    }
    expect(lower).toContain("## LOCK, DO NOT DESCRIBE");
    expect(lower).toContain("Never write lyrical set");
    expect(lower).toContain("it is not a story prop ledger");
  });

  it("requests the real output key and ends with the shared compact instruction", () => {
    const prompt = buildSceneVisualStatePlannerUserPrompt({
      userId: 1,
      seriesId: 2,
      locationKey: "office",
      shots: [{ shotNumber: 1 }],
      membershipHash: "hash",
      revision: 1,
    });
    expect(prompt).toContain(`requested_output: ${VD_SCENE_VISUAL_STATE_OUTPUT_KEY}`);
    expect(prompt.endsWith(VD_COMPACT_JSON_INSTRUCTION)).toBe(true);
  });
});
