import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";

import {
  extractStructuredPromptBundleTextOutput,
  inferMediaStudioPromptSkillCapabilities,
  loadMediaStudioPromptSkillCapabilities,
  normalizeReferenceImageUrls,
  prepareMediaStudioPythonPromptSkillExecution,
} from "../mediaStudioPromptSkillExecution";

const promptBundleInputSchema = {
  properties: {
    response_mode: {
      enum: ["text_prompt", "json_bundle"],
    },
    text_prompt_field: {
      enum: ["detailed", "short", "structured", "edit", "variants"],
    },
    source_image_path: {},
    verified_reference_facts: {},
    reference_sources: {},
  },
};

describe("mediaStudioPromptSkillExecution", () => {
  it("infers prompt-bundle capabilities from schema contract for future similar skills", () => {
    expect(inferMediaStudioPromptSkillCapabilities({
      skillSlug: "future-image-prompt-skill",
      inputSchema: promptBundleInputSchema,
    })).toMatchObject({
      structuredPromptReview: true,
      sourceImagePath: true,
      factualReferenceInputs: true,
    });
  });

  it("also infers prompt-bundle capabilities from UI-only option contracts", () => {
    expect(inferMediaStudioPromptSkillCapabilities({
      skillSlug: "future-ui-only-prompt-skill",
      uiSchema: {
        sections: [
          {
            fields: [
              {
                id: "response_mode",
                options: [
                  { value: "text_prompt" },
                  { value: "json_bundle" },
                ],
              },
              { id: "text_prompt_field" },
              { id: "source_image_path" },
            ],
          },
        ],
      },
    })).toMatchObject({
      structuredPromptReview: true,
      sourceImagePath: true,
    });
  });

  it("infers prompt-bundle capabilities from skill metadata for future native skills", () => {
    const capabilities = inferMediaStudioPromptSkillCapabilities({
      skillSlug: "future-metadata-prompt-skill",
      metadata: {
        config: {
          media_studio: {
            prompt_bundle_review: true,
            accepts_reference_images: true,
            supports_factual_grounding: true,
          },
        },
      },
    });

    expect(capabilities).toMatchObject({
      structuredPromptReview: true,
      sourceImagePath: true,
      factualReferenceInputs: true,
    });
    expect(capabilities.reasons).toEqual(expect.arrayContaining([
      "skill metadata opts into Media Studio prompt-bundle review",
      "skill metadata opts into Media Studio reference image handoff",
      "skill metadata opts into factual reference grounding",
    ]));
  });

  it("loads Media Studio capabilities from skill frontmatter metadata", () => {
    const skillDir = fs.mkdtempSync(path.join(os.tmpdir(), "media-studio-prompt-skill-"));
    fs.writeFileSync(path.join(skillDir, "SKILL.md"), [
      "---",
      "name: metadata-only-prompt-skill",
      "config:",
      "  media_studio:",
      "    prompt_bundle_review: true",
      "    accepts_reference_images: true",
      "    supports_factual_grounding: true",
      "---",
      "",
      "# Metadata-only prompt skill",
    ].join("\n"), "utf-8");

    expect(loadMediaStudioPromptSkillCapabilities({
      skillSlug: "metadata-only-prompt-skill",
      folderPath: skillDir,
    })).toMatchObject({
      structuredPromptReview: true,
      sourceImagePath: true,
      factualReferenceInputs: true,
    });
  });

  it("does not opt unrelated response_mode skills into prompt-bundle handling", () => {
    expect(inferMediaStudioPromptSkillCapabilities({
      skillSlug: "article-writer",
      inputSchema: {
        properties: {
          response_mode: { enum: ["markdown", "cms_json"] },
        },
      },
    })).toMatchObject({
      structuredPromptReview: false,
      sourceImagePath: false,
    });
  });

  it("deduplicates and caps reference image URLs", () => {
    expect(normalizeReferenceImageUrls([
      " https://cdn.example.com/a.png ",
      "",
      "https://cdn.example.com/a.png",
      "https://cdn.example.com/b.png",
      "https://cdn.example.com/c.png",
      "https://cdn.example.com/d.png",
      "https://cdn.example.com/e.png",
      "https://cdn.example.com/f.png",
    ])).toEqual([
      "https://cdn.example.com/a.png",
      "https://cdn.example.com/b.png",
      "https://cdn.example.com/c.png",
      "https://cdn.example.com/d.png",
      "https://cdn.example.com/e.png",
    ]);
  });

  it("prepares Media Studio prompt-bundle skills for internal structured review", () => {
    const prepared = prepareMediaStudioPythonPromptSkillExecution({
      skillSlug: "gpt-image-prompt-engineer",
      folderPath: "apps/web/skills/image-prompt-engineer-agents",
      originSurface: "media_studio",
      userInputs: {
        topic: "Lay product mockup",
        response_mode: "text_prompt",
        text_prompt_field: "detailed",
      },
      referenceImages: ["https://cdn.example.com/lay.png"],
    });

    expect(prepared.extractStructuredPrompt).toBe(true);
    expect(prepared.userInputs.response_mode).toBe("json_bundle");
    expect(prepared.userInputs.source_image_path).toEqual(["https://cdn.example.com/lay.png"]);
    expect(prepared.context.referenceImages).toEqual(["https://cdn.example.com/lay.png"]);
  });

  it("preserves an explicit source_image_path instead of replacing it with page references", () => {
    const prepared = prepareMediaStudioPythonPromptSkillExecution({
      skillSlug: "gpt-image-prompt-engineer",
      folderPath: "apps/web/skills/image-prompt-engineer-agents",
      originSurface: "media_studio",
      userInputs: {
        topic: "product mockup",
        source_image_path: ["user-selected.png"],
      },
      referenceImages: ["https://cdn.example.com/page-ref.png"],
    });

    expect(prepared.userInputs.source_image_path).toEqual(["user-selected.png"]);
  });

  it("leaves unrelated Python skills unchanged", () => {
    const prepared = prepareMediaStudioPythonPromptSkillExecution({
      skillSlug: "plain-python-tool",
      originSurface: "media_studio",
      userInputs: {
        topic: "hello",
        response_mode: "text_prompt",
      },
      referenceImages: ["https://cdn.example.com/ref.png"],
    });

    expect(prepared.extractStructuredPrompt).toBe(false);
    expect(prepared.userInputs).toEqual({
      topic: "hello",
      response_mode: "text_prompt",
    });
    expect(prepared.context).toEqual({});
  });

  it("extracts final prompt text and review summary from structured bundle output", () => {
    const extracted = extractStructuredPromptBundleTextOutput(JSON.stringify({
      prompts: {
        detailed: "Detailed final prompt",
        short: "Short prompt",
      },
      final_review: {
        status: "needs_input",
        approved: false,
        requires_revision: true,
        missing_inputs: ["reference_sources"],
        clarifying_questions: ["Which product angle?"],
        reference_preflight: {
          required: true,
          status: "visual_reference_only",
          next_action: "collect_official_or_reputable_sources",
          search_queries: ["Lay seaweed chips official product page visual details"],
        },
        checks: [
          { name: "quality_gate", passed: true },
          { name: "factual_reference_grounding", passed: false },
        ],
      },
      locked_user_params: {
        field_names: ["aspect_ratio", "topic"],
        fields: {
          aspect_ratio: { requested: "16:9", normalized: "16:9", source: "user" },
          topic: { requested: "Lay chips", normalized: "Lay chips", source: "user" },
        },
      },
      reference_research: {
        status: "visual_reference_only",
      },
      orchestration: {
        selected_subagents: ["reference_fidelity"],
      },
      prompt_quality: {
        score: 96,
      },
    }), "detailed");

    expect(extracted.promptText).toBe("Detailed final prompt");
    expect(extracted.reviewSummary).toMatchObject({
      status: "needs_input",
      approved: false,
      missingInputs: ["reference_sources"],
      referenceResearchStatus: "visual_reference_only",
      selectedSubagents: ["reference_fidelity"],
      qualityScore: 96,
      failedChecks: ["factual_reference_grounding"],
      referenceNextAction: "collect_official_or_reputable_sources",
      referenceSearchQueries: ["Lay seaweed chips official product page visual details"],
    });
    expect(extracted.reviewSummary?.lockedUserParams).toMatchObject({
      field_names: ["aspect_ratio", "topic"],
    });
  });
});
