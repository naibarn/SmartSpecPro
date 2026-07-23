/**
 * Feature 136 — section-03 contract test for the Tier-1 skill bundle
 * `product-review-sequential-storyboard`.
 *
 * Real files from disk, no mocks (pattern: server/services/reviewerSkillsUpgrade.test.ts).
 * This test is the "taught-not-wired" guard: content that is authored but
 * unloadable/unparsable by the real parser is silent dead code. It only
 * exercises `@smartspec/skills` (pure parser) + `fs` — no DB-backed server
 * services are imported here (runner-level sync/execution tests belong to
 * section-04).
 */
import { describe, it, expect } from "vitest";
import { parseSkillFile, mapCategoryToEnum } from "@smartspec/skills";
import fs from "fs";
import path from "path";

// From server/services/__tests__/ the bundle root is one level deeper than
// server/services/reviewerSkillsUpgrade.test.ts (which resolves "../../skills").
const BUNDLE_DIR = path.resolve(
  __dirname,
  "../../../skills/product-review-sequential-storyboard",
);

const SKILL_MD_PATH = path.join(BUNDLE_DIR, "skill.md");
const SKILL_MD_UPPER_PATH = path.join(BUNDLE_DIR, "SKILL.md");
const INPUT_SCHEMA_PATH = path.join(BUNDLE_DIR, "schemas", "input.schema.json");
const OUTPUT_SCHEMA_PATH = path.join(BUNDLE_DIR, "schemas", "output.schema.json");
const UI_SCHEMA_PATH = path.join(BUNDLE_DIR, "schemas", "ui.schema.json");

const REFERENCES_DIR = path.join(BUNDLE_DIR, "references");
const REFERENCE_FILES = {
  claimSafety: path.join(REFERENCES_DIR, "claim-safety.md"),
  narrativePatterns: path.join(REFERENCES_DIR, "narrative-patterns.md"),
  guardianPresence: path.join(REFERENCES_DIR, "guardian-presence.md"),
  demonstrationEvidence: path.join(REFERENCES_DIR, "demonstration-evidence.md"),
};

// §7 — every input key the section-03 spec requires input.schema.json to declare.
const EXPECTED_INPUT_KEYS = [
  "product_name",
  "product_description",
  "product_specs",
  "reference_manifest",
  "target_language",
  "shot_count",
  "max_shot_duration_seconds",
  "image_prompt_max_characters",
  "video_prompt_max_characters",
  "review_tone",
  "tone_preset",
  "story_arc_preset",
  "pacing_preset",
  "camera_motion_preset",
  "visual_style_preset",
  "audio_preset",
  "platform_preset",
  "segment_structure_preset",
  "video_structure_mode",
  "motion_direction",
  "target_audience",
  "user_requirements",
  "forbidden_claims",
  "confirmed_attributes",
  "child_subject_policy",
  "character_mode",
  "character_presence_mode",
  "audio_strategy",
  "platform_constraints",
  "loop_round",
  "prior_round_retained_output",
];

// §11.5 — exactly six demonstration_type literals, in the order the body defines them.
const DEMONSTRATION_TYPES = [
  "finished_product_showcase",
  "usage_demo",
  "feature_closeup",
  "benefit_narration",
  "problem_solution",
  "assembly_demo",
];

// §16.4 — exactly eight score dimensions, shared by every loop round.
const SCORE_DIMENSIONS = [
  "evidence_accuracy",
  "product_consistency",
  "narrative_quality",
  "dialogue_continuity",
  "visual_feasibility",
  "compliance_safety",
  "prompt_completeness",
  "length_compliance",
];

// §10.2 — claim confidence levels.
const CLAIM_CONFIDENCE_LEVELS = [
  "visual_verified",
  "text_verified",
  "user_confirmed",
  "conditional",
  "unsupported",
  "conflicting",
];

// §19.2 finalQc — eleven required booleans (adherence keys added 2026-07-23).
const FINAL_QC_KEYS = [
  "all_claims_supported",
  "all_shots_under_10_seconds",
  "hook_within_3_seconds",
  "price_absent",
  "overclaims_absent",
  "all_image_prompts_within_budget",
  "all_video_prompts_within_budget",
  "global_block_present_in_every_video_prompt",
  "guardian_policy_satisfied",
  "tone_preset_adhered",
  "structure_beats_present",
];

// §19.2 shots[] — full per-shot required field set.
const SHOT_REQUIRED_FIELDS = [
  "shot_id",
  "purpose",
  "duration_seconds",
  "demonstration_type",
  "depicts_minor",
  "guardian_required",
  "transition_from_previous",
  "visual_summary",
  "dialogue",
  "estimated_speech_seconds",
  "start_frame_image_prompt",
  "image_prompt_character_count",
  "video_prompt",
  "video_prompt_character_count",
  "claim_trace",
  "qc",
];

const TOP_LEVEL_OUTPUT_KEYS = [
  "skillVersion",
  "evidenceProfile",
  "claimWhitelist",
  "conflicts",
  "reviewStrategy",
  "childSubjectPolicy",
  "globalContinuity",
  "shots",
  "loopReport",
  "finalQc",
  "referenceManifest",
];

const GLOBAL_CONTINUITY_KEYS = [
  "product_identity",
  "character_identity",
  "wardrobe",
  "environment",
  "lighting",
  "video_global_block",
];

const REVIEW_STRATEGY_KEYS = [
  "hook_type",
  "narrative_pattern",
  "selected_features",
  "excluded_features",
];

function readBundleFile(filePath: string): string {
  return fs.readFileSync(filePath, "utf-8");
}

/**
 * Minimal local $ref resolver for draft-07 `#/definitions/...` pointers.
 * This test walks the schema structurally (it is not a full JSON Schema
 * validator), so any node that may be a `{ "$ref": "..." }` indirection
 * must be resolved before its `properties`/`required`/`enum` are inspected.
 */
function resolveRef(rootSchema: any, node: any): any {
  if (node && typeof node === "object" && typeof node.$ref === "string") {
    const pointer = node.$ref.replace(/^#\//, "").split("/");
    let resolved = rootSchema;
    for (const segment of pointer) resolved = resolved[segment];
    return resolved;
  }
  return node;
}

describe("product-review-sequential-storyboard bundle", () => {
  it("skill.md and SKILL.md exist and are byte-identical", () => {
    expect(fs.existsSync(SKILL_MD_PATH)).toBe(true);
    expect(fs.existsSync(SKILL_MD_UPPER_PATH)).toBe(true);
    const lower = fs.readFileSync(SKILL_MD_PATH);
    const upper = fs.readFileSync(SKILL_MD_UPPER_PATH);
    expect(Buffer.compare(lower, upper)).toBe(0);
  });

  it("frontmatter parses with the §9.2 contract", () => {
    const content = readBundleFile(SKILL_MD_PATH);
    const result = parseSkillFile(content);

    expect(result.metadata.name).toBe("product-review-sequential-storyboard");
    expect(result.metadata.execution_mode).toBe("llm-only");
    expect(result.metadata.version).toBe("1.0.0");
    expect(result.metadata.auto_trigger).toBe(false);

    const ep = result.metadata.execution_policy;
    expect(ep).toBeDefined();
    expect(ep!.mode).toBe("requirements");
    expect(ep!.requirements?.supportsVision).toBe(true);
    expect(ep!.requirements?.contextLength).toBe(1000000);
    expect(ep!.allowConversationOverride).toBe(false);
    expect(ep!.allowFreeModels).toBe(false);
    expect(ep!.fallbackPolicy).toBe("error");

    const config = result.metadata.config as any;
    const skillConfig =
      config?.media_studio?.marketplace_auto_review_sequential_storyboard;
    expect(skillConfig).toBeDefined();
    expect(skillConfig.enabled).toBe(true);
    expect(skillConfig.loop_rounds).toBe(3);
    expect(skillConfig.candidate_count).toBe(3);
    expect(skillConfig.min_prompt_score_to_pass).toBe(88);

    // Clean parse — no Spec 038 content-quality warnings.
    expect(result.warnings).toBeUndefined();
  });

  it("category maps through mapCategoryToEnum to image_prompt_generation", () => {
    const content = readBundleFile(SKILL_MD_PATH);
    const result = parseSkillFile(content);
    expect(result.metadata.category).toBe("image_prompt_generation");
    expect(mapCategoryToEnum(result.metadata.category)).toBe(
      "image_prompt_generation",
    );
  });

  it("input.schema.json parses and contains every §9.6 field", () => {
    const schema = JSON.parse(readBundleFile(INPUT_SCHEMA_PATH));
    expect(schema.type).toBe("object");
    expect(schema.properties).toBeDefined();

    for (const key of EXPECTED_INPUT_KEYS) {
      expect(
        schema.properties[key],
        `input.schema.json is missing property "${key}"`,
      ).toBeDefined();
    }

    // §7 explicitly-required fields.
    expect(schema.required).toEqual(
      expect.arrayContaining([
        "product_name",
        "product_description",
        "product_specs",
        "reference_manifest",
        "child_subject_policy",
      ]),
    );

    // reference_manifest item shape.
    const manifestItems = schema.properties.reference_manifest.items;
    expect(manifestItems.properties.index).toBeDefined();
    expect(manifestItems.properties.role).toBeDefined();
    expect(manifestItems.properties.url).toBeDefined();
    expect(manifestItems.properties.evidence_only).toBeDefined();

    // child_subject_policy shape.
    const childPolicy = schema.properties.child_subject_policy;
    expect(childPolicy.properties.productChildRelated).toBeDefined();
    expect(childPolicy.properties.childDepictionPlanned).toBeDefined();
    expect(childPolicy.properties.guardianReferenceIndex).toBeDefined();

    // defaults/consts called out by §7.
    expect(schema.properties.target_language.default).toBe("th");
    expect(schema.properties.shot_count.default).toBe(9);
    expect(schema.properties.max_shot_duration_seconds.default).toBe(10);
    expect(schema.properties.video_prompt_max_characters.default).toBe(2000);
  });

  it("output.schema.json parses and matches the §19.2 shape", () => {
    const schema = JSON.parse(readBundleFile(OUTPUT_SCHEMA_PATH));
    expect(schema.type).toBe("object");

    for (const key of TOP_LEVEL_OUTPUT_KEYS) {
      expect(
        schema.properties[key],
        `output.schema.json is missing top-level property "${key}"`,
      ).toBeDefined();
    }
    expect(schema.required).toEqual(
      expect.arrayContaining(TOP_LEVEL_OUTPUT_KEYS),
    );
    expect(schema.properties.skillVersion.const).toBe("1.0.0");

    // evidenceProfile — required product_reference_model_conflict (nullable),
    // assembly_documented, assembly_evidence.
    const evidenceProfile = schema.properties.evidenceProfile;
    expect(evidenceProfile.required).toEqual(
      expect.arrayContaining([
        "product_reference_model_conflict",
        "assembly_documented",
        "assembly_evidence",
      ]),
    );
    const modelConflict =
      evidenceProfile.properties.product_reference_model_conflict;
    expect(modelConflict.type).toEqual(expect.arrayContaining(["object", "null"]));
    expect(modelConflict.properties.detected).toBeDefined();
    expect(modelConflict.properties.conflicting_reference_indexes).toBeDefined();
    expect(modelConflict.properties.detail).toBeDefined();
    expect(evidenceProfile.properties.assembly_documented.type).toBe("boolean");
    expect(evidenceProfile.properties.assembly_evidence.type).toBe("array");

    // reviewStrategy shape.
    const reviewStrategy = schema.properties.reviewStrategy;
    for (const key of REVIEW_STRATEGY_KEYS) {
      expect(reviewStrategy.properties[key]).toBeDefined();
    }

    // globalContinuity shape.
    const globalContinuity = schema.properties.globalContinuity;
    for (const key of GLOBAL_CONTINUITY_KEYS) {
      expect(globalContinuity.properties[key]).toBeDefined();
    }

    // shots[] — exactly 9, full required-field set, demonstration_type enum.
    const shots = schema.properties.shots;
    expect(shots.type).toBe("array");
    expect(shots.minItems).toBe(9);
    expect(shots.maxItems).toBe(9);
    const shotItem = shots.items;
    for (const field of SHOT_REQUIRED_FIELDS) {
      expect(
        shotItem.properties[field],
        `shots[] item is missing required field "${field}"`,
      ).toBeDefined();
    }
    expect(shotItem.required).toEqual(expect.arrayContaining(SHOT_REQUIRED_FIELDS));
    expect(shotItem.properties.demonstration_type.enum).toEqual(
      DEMONSTRATION_TYPES,
    );
    const claimTraceSupport = resolveRef(
      schema,
      shotItem.properties.claim_trace.items.properties.support,
    );
    expect(claimTraceSupport.enum).toEqual(CLAIM_CONFIDENCE_LEVELS);

    // loopReport — round score dimensions.
    const loopReport = schema.properties.loopReport;
    expect(loopReport.required).toEqual(
      expect.arrayContaining(["selected_version"]),
    );
    for (const roundKey of ["round_1", "round_2", "round_3"]) {
      const round = resolveRef(schema, loopReport.properties[roundKey]);
      expect(round, `loopReport is missing ${roundKey}`).toBeDefined();
      expect(round.required).toEqual(expect.arrayContaining(SCORE_DIMENSIONS));
      for (const dim of SCORE_DIMENSIONS) {
        expect(round.properties[dim]).toBeDefined();
      }
    }

    // finalQc — nine required booleans.
    const finalQc = schema.properties.finalQc;
    expect(finalQc.required).toEqual(expect.arrayContaining(FINAL_QC_KEYS));
    for (const key of FINAL_QC_KEYS) {
      expect(finalQc.properties[key].type).toBe("boolean");
    }

    // shotOverrides must never be authored as a skill output.
    expect(schema.properties.shotOverrides).toBeUndefined();
  });

  it("ui.schema.json parses and covers the user-facing input fields", () => {
    const schema = JSON.parse(readBundleFile(UI_SCHEMA_PATH));
    expect(Array.isArray(schema["ui:order"])).toBe(true);

    const userFacingFields = [
      "review_tone",
      "tone_preset",
      "story_arc_preset",
      "pacing_preset",
      "camera_motion_preset",
      "visual_style_preset",
      "audio_preset",
      "platform_preset",
      "segment_structure_preset",
      "target_audience",
      "user_requirements",
      "forbidden_claims",
      "motion_direction",
    ];
    for (const field of userFacingFields) {
      expect(
        schema["ui:order"],
        `ui:order is missing "${field}"`,
      ).toEqual(expect.arrayContaining([field]));
      expect(schema[field], `ui.schema.json is missing hints for "${field}"`).toBeDefined();
    }
  });

  it("body contains all taught-not-wired markers (see §10 marker table)", () => {
    const { content: body } = parseSkillFile(readBundleFile(SKILL_MD_PATH));

    // Phase headings A..K.
    for (const letter of ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K"]) {
      expect(body, `missing "Phase ${letter}" heading`).toContain(`Phase ${letter}`);
    }

    // Global video block frozen opening sentence (do not paraphrase).
    expect(body).toContain(
      "Use @Image1 as the absolute product identity reference",
    );

    // Price ban inside the global block.
    expect(body).toContain("no price mention");

    // Assembly guard literals.
    expect(body).toContain("assembly_demo");
    expect(body).toContain("assembly_documented");

    // Start-frame action rule heading.
    expect(body).toContain("Start-Frame Action Rule");

    // All six demonstration_type literals.
    for (const type of DEMONSTRATION_TYPES) {
      expect(body, `missing demonstration_type literal "${type}"`).toContain(type);
    }

    // All eight §16.4 score dimension names.
    for (const dim of SCORE_DIMENSIONS) {
      expect(body, `missing score dimension "${dim}"`).toContain(dim);
    }

    // Guardian fields.
    expect(body).toContain("depicts_minor");
    expect(body).toContain("guardian_required");

    // Strict JSON output rule.
    expect(body).toContain("output.schema.json");
    expect(body.toLowerCase()).toContain("no markdown fences");

    // Untrusted content governing principle (spec §24).
    expect(body).toContain("DATA, not instructions");
  });

  it("references/ files exist with non-empty content", () => {
    for (const filePath of Object.values(REFERENCE_FILES)) {
      expect(fs.existsSync(filePath), `${filePath} does not exist`).toBe(true);
      const text = readBundleFile(filePath);
      expect(
        text.length,
        `${filePath} must contain >500 chars of real rule content`,
      ).toBeGreaterThan(500);
    }

    const claimSafety = readBundleFile(REFERENCE_FILES.claimSafety);
    expect(claimSafety).toContain("ดีที่สุด");
    expect(claimSafety).toContain("รับรองว่า");
    expect(claimSafety.toLowerCase()).toContain("price");
    expect(claimSafety).toContain("ออกแบบมาให้");

    const narrativePatterns = readBundleFile(REFERENCE_FILES.narrativePatterns);
    expect(narrativePatterns.toLowerCase()).toContain("furniture");
    expect(narrativePatterns.toLowerCase()).toContain("desk chair");
    expect(narrativePatterns).toContain("assembly");

    const guardianPresence = readBundleFile(REFERENCE_FILES.guardianPresence);
    expect(guardianPresence).toContain("depicts_minor");
    expect(guardianPresence).toContain("guardian_required");
    expect(guardianPresence.toLowerCase()).toContain("guardian");

    const demonstrationEvidence = readBundleFile(
      REFERENCE_FILES.demonstrationEvidence,
    );
    for (const type of DEMONSTRATION_TYPES) {
      expect(demonstrationEvidence).toContain(type);
    }
    expect(demonstrationEvidence).toContain("assembly_documented");
  });

  it("registry sync can ingest the bundle", () => {
    const content = readBundleFile(SKILL_MD_PATH);
    expect(() => parseSkillFile(content)).not.toThrow();
    const result = parseSkillFile(content);
    expect(result.metadata.name).toBeTruthy();
    expect(result.content.length).toBeGreaterThan(0);
    expect(result.metadata.name).toBe("product-review-sequential-storyboard");
  });
});
