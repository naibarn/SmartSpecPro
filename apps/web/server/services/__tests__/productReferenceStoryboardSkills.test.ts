import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

import { appendProductReferenceStoryboardCategoryRules } from "../productReferenceStoryboardCategoryRules";
import {
  ProductReferenceStoryboardSkillIncompleteOutputError,
  PRODUCT_REFERENCE_STORYBOARD_PROMPT_OPTIMIZER_SKILL_ID,
  resolveProductReferenceStoryboardLlmMaxTokensForTest,
  sanitizeProductReferenceStoryboardUserInputsForTest,
  shouldOptimizeProductReferenceStoryboardPromptForTest,
  stripRenderableStoryboardFrameLabelsForTest,
  validateProductReferenceStoryboardOutputCompletenessForTest,
} from "../productReferenceStoryboardSkillRunner";

const skillsRoot = path.resolve(__dirname, "..", "..", "..", "skills");
const unifiedSkillId = "product-reference-storyboard";
const promptOptimizerSkillId = "product-reference-storyboard-prompt-optimizer";

const productCategories = [
  "household_product",
  "computer_laptop",
  "electrical_appliance",
  "food_beverage",
  "electronics",
  "fashion_clothing",
  "shoes",
  "watch_eyewear",
  "mobile_tablet",
  "jewelry",
  "mother_baby",
  "pet_supplies",
  "sports_equipment",
  "camera_photography",
  "gaming_accessories",
  "automotive",
  "stationery",
  "books",
  "furniture",
  "cosmetics",
] as const;

const legacyProductionReferenceStoryboardSkillIds = [
  "household-product-reference-storyboard",
  "computer-laptop-reference-storyboard",
  "electrical-appliance-reference-storyboard",
  "food-beverage-reference-storyboard",
  "electronics-reference-storyboard",
  "fashion-clothing-reference-storyboard",
  "shoes-reference-storyboard",
  "watch-eyewear-reference-storyboard",
  "mobile-tablet-reference-storyboard",
  "jewelry-reference-storyboard",
  "mother-baby-reference-storyboard",
  "pet-supplies-reference-storyboard",
  "sports-equipment-reference-storyboard",
  "camera-photography-reference-storyboard",
  "gaming-accessories-reference-storyboard",
  "automotive-reference-storyboard",
  "stationery-reference-storyboard",
  "books-reference-storyboard",
  "furniture-reference-storyboard",
  "cosmatic-reference-storyboard",
] as const;

function readSkillFile(skillId: string, file: string): string {
  return fs.readFileSync(path.join(skillsRoot, skillId, file), "utf-8");
}

function readJson(skillId: string, file: string): any {
  return JSON.parse(readSkillFile(skillId, file));
}

describe("unified product reference storyboard skill", () => {
  it("exposes one production storyboard skill and disables the legacy category skills", () => {
    const skillContent = readSkillFile(unifiedSkillId, "SKILL.md");
    const mirroredSkillContent = readSkillFile(unifiedSkillId, "skill.md");

    expect(mirroredSkillContent).toBe(skillContent);
    expect(skillContent).toContain(`name: ${unifiedSkillId}`);
    expect(skillContent).toContain("production-reference-storyboard");
    expect(skillContent).toContain("production_reference_storyboard:");
    expect(skillContent).toContain("enabled: true");
    expect(skillContent).toContain("replaces the previous 20 category-specific");
    expect(skillContent).toContain("product_category");
    expect(skillContent).toContain("reference_product_images` are immutable physical evidence");
    expect(skillContent).toContain("use the first attached product reference image");
    expect(skillContent).toContain("@Image1");
    expect(skillContent).toContain("storyboard_guide` + `voiceover_script");
    expect(skillContent).toContain("CINEMATIC REALISM LOCK");
    expect(skillContent).toContain("CHARACTER FACE AND 95 PERCENT IDENTITY LOCK");
    expect(skillContent).toContain("Avoid back-of-head");
    expect(skillContent).toContain("A frame where the person is correct but the product changes is still a fatal failure");
    expect(skillContent).toContain("Post-Introduction Product Visibility Rule");
    expect(skillContent).toContain("Frame 8 / reconfirming-value / value-confirmation frames are product-critical");
    expect(skillContent).toContain("Do not write person-only, bed-only, room-only");
    expect(skillContent).toContain("Use one shared `CAMERA/LIGHT/DEPTH:` block");
    expect(skillContent).toContain("one shared `PRODUCT VERIFY:` block");
    expect(skillContent).toContain("CAMERA/LIGHT/DEPTH");
    expect(skillContent).toContain("Human realism requirements must be described in natural visual prose");
    expect(skillContent).toContain("Rear/Back View Video Safety Rule");
    expect(skillContent).toContain("natural-language rear-only motion lock");
    expect(skillContent).toContain("A visible back-of-head frame that could later turn to camera is a fatal identity-continuity failure");
    expect(skillContent).toContain("VIDEO IDENTITY SAFETY LOCK");
    expect(skillContent).toContain("Wardrobe should come from the current character reference images");
    expect(skillContent).toContain("no beauty-filter smoothing");
    expect(skillContent).toContain("Do not repeat this full verification list inside every frame");
    expect(skillContent).toContain("3 levels; 4 vertical posts; light wood finish");
    expect(skillContent).toContain("Product visual lock from @Image1 / first attached product reference image");
    expect(skillContent).toContain("strict product visual lock");
    expect(skillContent).not.toContain("Recreate exact product from product reference image");
    expect(skillContent).toContain("blank/unreadable book covers and spines");
    expect(skillContent).toContain("Aim to keep the final plain-text prompt under 4300 characters");
    expect(skillContent).toContain("This is a soft budget, not an input field or schema parameter");
    expect(skillContent).toContain("Completeness is mandatory");
    expect(skillContent).toContain("Completeness is mandatory and has higher priority than brevity");
    expect(skillContent).toContain("never stop mid-frame");
    expect(skillContent).toContain("Do not write `VISUAL:`, `STORY MATCH:`, `HUMAN REALISM:`");
    expect(skillContent).toContain("returning only one shot");

    for (const skillId of legacyProductionReferenceStoryboardSkillIds) {
      const legacySkillContent = readSkillFile(skillId, "SKILL.md");
      const legacyMirror = readSkillFile(skillId, "skill.md");

      expect(legacyMirror).toBe(legacySkillContent);
      expect(legacySkillContent).toContain("production_reference_storyboard:");
      expect(legacySkillContent).toContain("enabled: false");
    }
  });

  it("adds product_category as the product rule selector while keeping storyboard/script contracts", () => {
    const inputSchema = readJson(unifiedSkillId, path.join("schemas", "input.schema.json"));
    const uiSchema = readJson(unifiedSkillId, path.join("schemas", "ui.schema.json"));
    const outputSchema = readJson(unifiedSkillId, path.join("schemas", "output.schema.json"));
    const lock = readJson(unifiedSkillId, "skill.lock.json");

    expect(inputSchema.properties.product_category).toMatchObject({
      title: "Product Category",
      type: "string",
      default: "auto",
    });
    expect(inputSchema.properties.product_category.enum).toEqual(["auto", ...productCategories]);
    expect(inputSchema.properties.scene_descriptions).toBeUndefined();
    expect(inputSchema.properties.maxPromptLength).toBeUndefined();
    expect(inputSchema.properties.prompt_budget_chars).toBeUndefined();
    expect(inputSchema.properties.max_output_chars).toBeUndefined();
    expect(inputSchema.properties.voiceover_script.type).toBe("string");
    expect(inputSchema.properties.voiceover_script.description).toContain("spoken dialogue");
    expect(inputSchema.properties.production_concept_details.title).toBe("Product Detail / Product Facts");
    expect(inputSchema.properties.production_concept_details.description).toContain("Product Detail / Product Facts");
    expect(inputSchema.properties.reference_product_images.description).toContain("immutable product evidence");
    expect(inputSchema.properties.reference_character_images.description).toContain("Avoid back-of-head");
    expect(inputSchema.properties.cinematic_style.description).toContain("cinematic photorealistic product-film quality");

    expect(uiSchema["ui:order"]).toContain("product_category");
    expect(uiSchema["ui:order"].indexOf("product_category")).toBeGreaterThan(
      uiSchema["ui:order"].indexOf("generation_mode"),
    );
    expect(uiSchema["ui:order"]).not.toContain("scene_descriptions");
    expect(uiSchema["ui:order"]).toContain("voiceover_script");
    expect(uiSchema.product_category["ui:widget"]).toBe("select");
    expect(uiSchema.product_category["ui:help"]).toContain("เลือกหมวดสินค้า");
    expect(outputSchema.type).toBe("string");
    expect(lock.name).toBe(unifiedSkillId);
    for (const category of productCategories) {
      expect(lock.outputs).toContain(`references/product-categories/${category}.md`);
    }
  });

  it("stores product-specific rules as 20 category reference files", () => {
    const categoryDir = path.join(skillsRoot, unifiedSkillId, "references", "product-categories");
    const files = fs.readdirSync(categoryDir).filter((file) => file.endsWith(".md")).sort();

    expect(files).toEqual(productCategories.map((category) => `${category}.md`).sort());

    for (const category of productCategories) {
      const categoryRules = fs.readFileSync(path.join(categoryDir, `${category}.md`), "utf-8");
      expect(categoryRules).toContain(`Category id: \`${category}\``);
      expect(categoryRules).toContain("## Product Fidelity Lock");
      expect(categoryRules).toContain("## Common Wrong Substitutions To Reject");
      expect(categoryRules).toContain("## Frame-Level Requirements");
      expect(categoryRules).toContain("Put the category-specific lock facts in the shared PRODUCT VERIFY block");
      expect(categoryRules).toContain("clear front-facing or three-quarter face continuity");
    }

    const furnitureRules = fs.readFileSync(path.join(categoryDir, "furniture.md"), "utf-8");
    expect(furnitureRules).toContain("reject any drawer nightstand");
    expect(furnitureRules).toContain("Frame 8 / reconfirming-value / confirmation frames must show the same 3-tier open shelf");
  });

  it("appends the selected category rule file before Marketplace Auto Review skill execution", () => {
    const result = appendProductReferenceStoryboardCategoryRules("BASE PROMPT", {
      skillSlug: unifiedSkillId,
      skillDirectories: [path.join(skillsRoot, unifiedSkillId)],
      userInputs: {
        product_category: "furniture",
      },
    });

    expect(result.audit).toMatchObject({
      status: "appended",
      category: "furniture",
    });
    expect(result.systemPrompt).toContain("Selected product_category: furniture");
    expect(result.systemPrompt).toContain("Category id: `furniture`");
    expect(result.systemPrompt).toContain("## Product Fidelity Lock");
  });

  it("keeps the skill output length rule while avoiding premature LLM completion cutoff", () => {
    const result = resolveProductReferenceStoryboardLlmMaxTokensForTest(4500, "unknown");

    expect(result.promptLengthPlan?.maxPromptLength).toBe(4500);
    expect(result.promptLengthPlan?.targetPromptLength).toBeLessThanOrEqual(4500);
    expect(result.promptLengthPlan?.maxTokens).toBeLessThan(
      result.llmMaxTokens
    );
    expect(result.llmMaxTokens).toBeGreaterThanOrEqual(4000);
  });

  it("keeps the plain-text storyboard output contract strict", () => {
    const outputContract = readSkillFile(unifiedSkillId, path.join("references", "output_contract.md"));
    const inputContract = readSkillFile(unifiedSkillId, path.join("references", "input_contract.md"));
    const skillContent = readSkillFile(unifiedSkillId, "SKILL.md");

    expect(inputContract).toContain("product_category");
    expect(inputContract).toContain("Product Detail / Product Facts");
    expect(inputContract).toContain("reference_product_images");
    expect(outputContract).toContain("plain prompt text only");
    expect(outputContract).toContain("canvas_9_16_grid_3x3_frame_9_16_exact");
    expect(outputContract).toContain("source shot title/timing");
    expect(outputContract).toContain("CINEMATIC REALISM LOCK");
    expect(outputContract).toContain("CHARACTER FACE AND 95 PERCENT IDENTITY LOCK");
    expect(outputContract).toContain("exactly 9 equal vertical frames storyboard panel");
    expect(outputContract).toContain("Completeness is mandatory");
    expect(outputContract).toContain("Never stop mid-frame");
    expect(outputContract).toContain("A single source storyboard bullet");
    expect(outputContract).toContain("Use compact visual-only frame prose");
    expect(outputContract).toContain("Do not write `VISUAL:`, `STORY MATCH:`, `HUMAN REALISM:`");
    expect(outputContract).toContain("The shared `CAMERA/LIGHT/DEPTH:` block must be one compact line");
    expect(outputContract).toContain("Character wardrobe must come from current character reference images");
    expect(outputContract).toContain("Back-facing, rear-only, over-shoulder-with-hair");
    expect(outputContract).toContain("rear-only shot");
    expect(outputContract).toContain("VIDEO IDENTITY SAFETY LOCK");
    expect(outputContract).toContain("PRODUCT REFERENCE LOCK");
    expect(outputContract).toContain("strict product visual lock");
    expect(outputContract).toContain("@Image1 / the first attached product reference image");
    expect(outputContract).toContain("must match that reference exactly");
    expect(outputContract).toContain("A frame where the person is correct but the product changes");
    expect(outputContract).toContain("Frame 8 / reconfirming-value frames are product-critical");
    expect(outputContract).toContain("wrong nightstand/drawer/table substitution");
    expect(outputContract).toContain("Include one shared `PRODUCT VERIFY:` block");
    expect(outputContract).toContain("product visual lock from @Image1 / first attached product reference image");
    expect(outputContract).toContain("suppress readable non-product prop/background text");
    expect(outputContract).toContain("blank or unreadable book covers and spines");
    expect(outputContract).toContain("zero white divider lines");
    expect(outputContract).toContain("A single generic `SCENE DESCRIPTION:` block");
    expect(skillContent).not.toContain("contract anchors needed for runtime validation");
    expect(outputContract).not.toContain("validation anchors in the plain prompt text");
  });

  it("rejects truncated storyboard skill output before returning a partial prompt", () => {
    const truncatedPrompt = [
      "CAMERA/LIGHT/DEPTH: compact cinematic light.",
      "PRODUCT VERIFY: exact product.",
      "SHOT-BY-SHOT STORYBOARD PROMPT:",
      "Frame 1: VISUAL: product intro. STORY MATCH: first beat.",
      "Frame 2: VISUAL: product use. STORY MATCH: second beat.",
      "Frame 3:",
      "VISUAL",
    ].join("\n");

    expect(
      validateProductReferenceStoryboardOutputCompletenessForTest(truncatedPrompt)
    ).toEqual(
      expect.arrayContaining([
        "frame_4_missing",
        "frame_9_missing",
        "frame_3_content_incomplete",
        "renderable_frame_label_leak",
        "product_reference_image_exact_recreation_missing",
        "output_ended_mid_field",
      ])
    );
  });

  it("requires an explicit exact product visual lock from the product reference image", () => {
    const promptWithoutReferenceImageLock = [
      "CAMERA/LIGHT/DEPTH: compact cinematic light.",
      "PRODUCT VERIFY: Greenforst shelf, 3 levels, 4 posts.",
      "SHOT-BY-SHOT STORYBOARD PROMPT:",
      ...Array.from(
        { length: 9 },
        (_, index) => `Frame ${index + 1}: Complete visual-only product storyboard panel with the shelf clearly visible in a cozy bedroom.`
      ),
    ].join("\n");

    const promptWithReferenceImageLock = [
      "CAMERA/LIGHT/DEPTH: compact cinematic light.",
      "PRODUCT VERIFY: Product visual lock from @Image1 / first attached product reference image; generated product must match the exact same product; Greenforst shelf, 3 levels, 4 posts.",
      "SHOT-BY-SHOT STORYBOARD PROMPT:",
      ...Array.from(
        { length: 9 },
        (_, index) => `Frame ${index + 1}: Complete visual-only product storyboard panel with the shelf clearly visible in a cozy bedroom.`
      ),
    ].join("\n");

    expect(
      validateProductReferenceStoryboardOutputCompletenessForTest(promptWithoutReferenceImageLock)
    ).toContain("product_reference_image_exact_recreation_missing");
    expect(
      validateProductReferenceStoryboardOutputCompletenessForTest(promptWithReferenceImageLock)
    ).not.toContain("product_reference_image_exact_recreation_missing");
  });

  it("strips renderable frame labels and quoted story text before image generation", () => {
    const labeledPrompt = [
      "CAMERA/LIGHT/DEPTH: compact cinematic light.",
      "PRODUCT VERIFY: exact product.",
      "SHOT-BY-SHOT STORYBOARD PROMPT:",
      "Frame 1: VISUAL: Close-up clutter beside bed. STORY MATCH: \"ของใช้เล็ก ๆ ไม่มีที่อยู่ประจำ\"",
      "Frame 2: VISUAL: Woman places shelf beside bed. HUMAN REALISM: Natural face and hands.",
    ].join("\n");

    const stripped = stripRenderableStoryboardFrameLabelsForTest(labeledPrompt);

    expect(stripped).toContain("Frame 1: Close-up clutter beside bed.");
    expect(stripped).toContain("Frame 2: Woman places shelf beside bed. Natural face and hands.");
    expect(stripped).not.toContain("STORY MATCH");
    expect(stripped).not.toContain("HUMAN REALISM:");
    expect(stripped).not.toContain("VISUAL:");
    expect(stripped).not.toContain("ของใช้เล็ก ๆ ไม่มีที่อยู่ประจำ");
  });

  it("keeps raw prompt debug when storyboard skill output is incomplete", () => {
    const error = new ProductReferenceStoryboardSkillIncompleteOutputError({
      runId: "run-1",
      unitId: "unit-1",
      attempt: 1,
      promptAttempt: 2,
      maxOutputChars: 4500,
      rawOutput: "Frame 1: partial prompt",
      fullOutputLogPath: "/tmp/full-output.jsonl",
      promptLengthPlan: null,
      modelId: "model-1",
      providerName: "provider-1",
      finishReason: "stop",
      blockers: ["frame_6_missing"],
    });

    expect(error.message).toContain("frame_6_missing");
    expect(error.toPromptSkillDebug()).toMatchObject({
      status: "blocked_before_image_provider_submit",
      reasonCode: "skill_output_incomplete",
      rawOutput: "Frame 1: partial prompt",
      blockers: ["frame_6_missing"],
      fullOutputLogPath: "/tmp/full-output.jsonl",
    });
  });

  it("defines a prompt optimizer skill for compacting product storyboard prompts", () => {
    const skillContent = readSkillFile(promptOptimizerSkillId, "SKILL.md");
    const mirroredSkillContent = readSkillFile(promptOptimizerSkillId, "skill.md");
    const inputSchema = JSON.parse(
      readSkillFile(promptOptimizerSkillId, path.join("schemas", "input.schema.json"))
    );
    const outputSchema = JSON.parse(
      readSkillFile(promptOptimizerSkillId, path.join("schemas", "output.schema.json"))
    );
    const outputContract = readSkillFile(
      promptOptimizerSkillId,
      path.join("references", "output_contract.md")
    );

    expect(mirroredSkillContent).toBe(skillContent);
    expect(skillContent).toContain(`name: ${promptOptimizerSkillId}`);
    expect(skillContent).toContain("Post-processes product-reference-storyboard prompts");
    expect(skillContent).toContain("Perform a hidden rewrite loop");
    expect(skillContent).toContain("Never return:");
    expect(skillContent).toContain("a prompt over `target_max_chars`");
    expect(skillContent).toContain("Frame 1` through `Frame 9");
    expect(skillContent).toContain("one shared `CAMERA/LIGHT/DEPTH:` block");
    expect(skillContent).toContain("one shared `PRODUCT VERIFY:` block");
    expect(skillContent).toContain("strict product visual lock");
    expect(skillContent).toContain("the product must match that reference exactly");
    expect(skillContent).not.toContain("product must be recreated from the product reference image exactly");
    expect(inputSchema.required).toContain("source_prompt");
    expect(inputSchema.properties.target_max_chars.default).toBe(4500);
    expect(inputSchema.properties.target_max_chars.maximum).toBe(4500);
    expect(inputSchema.properties.preferred_target_chars.default).toBe(4300);
    expect(outputSchema.maxLength).toBe(4500);
    expect(outputContract).toContain("Return plain prompt text only");
    expect(outputContract).toContain("must not end mid-frame or at a bare label");
  });

  it("routes over-length storyboard prompts to the optimizer before final use", () => {
    const runnerSource = fs.readFileSync(
      path.join(__dirname, "..", "productReferenceStoryboardSkillRunner.ts"),
      "utf-8"
    );
    const skillsRouterSource = fs.readFileSync(
      path.join(__dirname, "..", "..", "routers", "skills.ts"),
      "utf-8"
    );

    expect(PRODUCT_REFERENCE_STORYBOARD_PROMPT_OPTIMIZER_SKILL_ID).toBe(
      promptOptimizerSkillId
    );
    expect(shouldOptimizeProductReferenceStoryboardPromptForTest("x".repeat(4501), 4500)).toBe(true);
    expect(shouldOptimizeProductReferenceStoryboardPromptForTest("x".repeat(4500), 4500)).toBe(false);
    expect(runnerSource).toContain("optimizeProductReferenceStoryboardPrompt");
    expect(runnerSource).toContain(
      "PRODUCT_REFERENCE_STORYBOARD_PROMPT_OPTIMIZER_SKILL_ID"
    );
    expect(runnerSource).toContain("optimizer_dispatch");
    expect(runnerSource).toContain("promptOptimizer");
    expect(skillsRouterSource).toContain(
      "PRODUCT_REFERENCE_STORYBOARD_PROMPT_MAX_CHARS = 4500"
    );
    expect(skillsRouterSource).toContain(
      "optimizeProductReferenceStoryboardPrompt"
    );
    expect(skillsRouterSource).toContain(
      "runProductReferenceStoryboardPromptSkill"
    );
    expect(skillsRouterSource).toContain(
      "originSurface: input.originSurface ?? \"media_studio\""
    );
    expect(runnerSource).toContain("const requiredRuntimeFields = requiredFields");
    expect(runnerSource).toContain(
      "PRODUCT_REFERENCE_STORYBOARD_SCHEMA_AUDIT_FIELD_NAMES"
    );
    expect(skillsRouterSource).toContain(
      "product-reference-storyboard output exceeded limit; optimizing before use"
    );
  });

  it("keeps empty optional reference arrays for schema validation", () => {
    const sanitized = sanitizeProductReferenceStoryboardUserInputsForTest({
      generation_mode: "multi_frame_storyboard",
      reference_product_images: ["https://example.test/product.png"],
      reference_character_images: [],
      reference_environment_images: [],
      ignored_empty_text: "",
      ignored_empty_array: [],
    });

    expect(sanitized.reference_product_images).toEqual([
      "https://example.test/product.png",
    ]);
    expect(sanitized.reference_character_images).toEqual([]);
    expect(sanitized.reference_environment_images).toEqual([]);
    expect(sanitized).not.toHaveProperty("ignored_empty_text");
    expect(sanitized).not.toHaveProperty("ignored_empty_array");
  });
});
