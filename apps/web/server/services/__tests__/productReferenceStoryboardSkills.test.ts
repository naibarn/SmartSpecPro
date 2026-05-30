import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const skillsRoot = path.resolve(__dirname, "..", "..", "..", "skills");
const unifiedSkillId = "product-reference-storyboard";

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
    expect(skillContent).toContain("storyboard_guide` + `voiceover_script");
    expect(skillContent).toContain("CINEMATIC REALISM LOCK");
    expect(skillContent).toContain("CHARACTER FACE AND IDENTITY LOCK");
    expect(skillContent).toContain("Avoid back-of-head");
    expect(skillContent).toContain("A frame where the person is correct but the product changes is still a fatal failure");
    expect(skillContent).toContain("Post-Introduction Product Visibility Rule");
    expect(skillContent).toContain("Frame 8 / reconfirming-value / value-confirmation frames are product-critical");
    expect(skillContent).toContain("Do not write person-only, bed-only, room-only");
    expect(skillContent).toContain("Every frame must include these labels inside the frame description");
    expect(skillContent).toContain("CAMERA/LIGHT/DEPTH");
    expect(skillContent).toContain("HUMAN REALISM");
    expect(skillContent).toContain("Rear/Back View Video Safety Rule");
    expect(skillContent).toContain("VIDEO MOTION LOCK: rear-only shot");
    expect(skillContent).toContain("A visible back-of-head frame that could later turn to camera is a fatal identity-continuity failure");
    expect(skillContent).toContain("VIDEO IDENTITY SAFETY LOCK");
    expect(skillContent).toContain("Wardrobe should come from the current character reference images");
    expect(skillContent).toContain("no beauty-filter smoothing");
    expect(skillContent).toContain("frame-level PRODUCT VERIFY phrase");
    expect(skillContent).toContain("top surface + middle shelf + bottom shelf visible");
    expect(skillContent).toContain("blank/unreadable book covers and spines");

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
      expect(categoryRules).toContain("Repeat the category-specific lock inside every product-visible frame");
      expect(categoryRules).toContain("clear front-facing or three-quarter face continuity");
    }

    const furnitureRules = fs.readFileSync(path.join(categoryDir, "furniture.md"), "utf-8");
    expect(furnitureRules).toContain("reject any drawer nightstand");
    expect(furnitureRules).toContain("Frame 8 / reconfirming-value / confirmation frames must show the same 3-tier open shelf");
  });

  it("keeps the plain-text storyboard output contract strict", () => {
    const outputContract = readSkillFile(unifiedSkillId, path.join("references", "output_contract.md"));
    const inputContract = readSkillFile(unifiedSkillId, path.join("references", "input_contract.md"));

    expect(inputContract).toContain("product_category");
    expect(inputContract).toContain("Product Detail / Product Facts");
    expect(inputContract).toContain("reference_product_images");
    expect(outputContract).toContain("plain prompt text only");
    expect(outputContract).toContain("canvas_9_16_grid_3x3_frame_9_16_exact");
    expect(outputContract).toContain("source shot title/timing");
    expect(outputContract).toContain("CINEMATIC REALISM LOCK");
    expect(outputContract).toContain("CHARACTER FACE AND IDENTITY LOCK");
    expect(outputContract).toContain("Use structured frame labels");
    expect(outputContract).toContain("Each `CAMERA/LIGHT/DEPTH:` clause must specify");
    expect(outputContract).toContain("Character wardrobe must come from current character reference images");
    expect(outputContract).toContain("Back-facing, rear-only, over-shoulder-with-hair");
    expect(outputContract).toContain("VIDEO MOTION LOCK: rear-only shot");
    expect(outputContract).toContain("VIDEO IDENTITY SAFETY LOCK");
    expect(outputContract).toContain("PRODUCT REFERENCE LOCK");
    expect(outputContract).toContain("A frame where the person is correct but the product changes");
    expect(outputContract).toContain("Frame 8 / reconfirming-value frames are product-critical");
    expect(outputContract).toContain("wrong nightstand/drawer/table substitution");
    expect(outputContract).toContain("frame-level `PRODUCT VERIFY:` phrase");
    expect(outputContract).toContain("suppress readable non-product prop/background text");
    expect(outputContract).toContain("blank or unreadable book covers and spines");
    expect(outputContract).toContain("zero white divider lines");
    expect(outputContract).toContain("A single generic `SCENE DESCRIPTION:` block");
  });
});
