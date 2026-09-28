import { describe, expect, it } from "vitest";
import {
  inferCreditTransactionSourceType,
  resolveCreditTransactionDescription,
  resolveCreditTransactionSkillLabel,
  resolveCreditTransactionOriginSurface,
} from "./creditTransactionSource";

describe("creditTransactionSource", () => {
  it("uses the authoritative skill name before the slug in credit history", () => {
    expect(resolveCreditTransactionSkillLabel({
      skillName: "Vertical Drama Prompt Expansion",
      skillSlug: "vertical-drama-prompt-expansion",
      metadata: {
        skill: "vertical-drama-prompt-expansion",
        skillName: "Vertical Drama Prompt Expansion",
      },
    })).toBe("Vertical Drama Prompt Expansion");
  });

  it("falls back to the skill slug for legacy rows", () => {
    expect(resolveCreditTransactionSkillLabel({
      skillSlug: "general-article-writer",
      metadata: null,
    })).toBe("general-article-writer");
  });

  it("makes the authoritative skill name the primary credit description", () => {
    expect(resolveCreditTransactionDescription({
      sourceType: "skill",
      skillName: "Vertical Drama Prompt Expansion",
      skillSlug: "vertical-drama-prompt-expansion",
      description: "LLM usage: openai/gpt-5.4-nano",
      metadata: { skill: "vertical-drama-prompt-expansion" },
    })).toEqual({
      primary: "Vertical Drama Prompt Expansion",
      secondary: "LLM usage: openai/gpt-5.4-nano",
    });
  });

  it("uses the canonical Vertical Drama Draft QC skill name", () => {
    expect(resolveCreditTransactionDescription({
      sourceType: "skill",
      skillName: "Vertical Drama Draft Quality Controller",
      skillSlug: "vertical-drama-draft-quality-controller",
      description: "Skill run: Vertical Drama Draft Quality Controller",
      metadata: {
        skill: "vertical-drama-draft-quality-controller",
        skillName: "Vertical Drama Draft Quality Controller",
      },
    })).toEqual({
      primary: "Vertical Drama Draft Quality Controller",
      secondary: "Skill run: Vertical Drama Draft Quality Controller",
    });
  });

  it("prefers declared source types when present", () => {
    expect(
      inferCreditTransactionSourceType({
        sourceType: "api_media",
        description: "Video generation: prompt snippet",
      }),
    ).toBe("api_media");
  });

  it("infers media_video from legacy descriptions without sourceType", () => {
    expect(
      inferCreditTransactionSourceType({
        description: "VIDEO Generation: veo3/generate-veo-3-video-fast",
      }),
    ).toBe("media_video");
  });

  it("infers skill usage from skill execution descriptions", () => {
    expect(
      inferCreditTransactionSourceType({
        description: "Skill execution: Cinematic Video Create Prompt",
      }),
    ).toBe("skill");
  });

  it("extracts the Media Studio origin surface from metadata", () => {
    expect(
      resolveCreditTransactionOriginSurface({
        metadata: { originSurface: "media_studio" },
      }),
    ).toBe("media_studio");
  });

  it("maps admin metadata actions to the admin source", () => {
    expect(
      inferCreditTransactionSourceType({
        description: "Bonus",
        metadata: { action: "admin_add_credits" },
      }),
    ).toBe("admin");
  });

  it("maps presentation orchestration fee rows to other", () => {
    expect(
      inferCreditTransactionSourceType({
        description: "AI Layout from Note (orchestration fee)",
        metadata: { type: "ai_layout_from_note" },
      }),
    ).toBe("other");
  });
});
