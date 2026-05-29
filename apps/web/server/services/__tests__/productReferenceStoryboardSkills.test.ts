import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const skillsRoot = path.resolve(__dirname, "..", "..", "..", "skills");

const categorySkills = [
  ["household-product-reference-storyboard", "เครื่องใช้ในบ้าน"],
  ["computer-laptop-reference-storyboard", "คอมพิวเตอร์และแล็ปท็อป"],
  ["electrical-appliance-reference-storyboard", "เครื่องใช้ไฟฟ้า"],
  ["food-beverage-reference-storyboard", "อาหารและเครื่องดื่ม"],
  ["electronics-reference-storyboard", "อุปกรณ์อิเล็กทรอนิกส์"],
  ["fashion-clothing-reference-storyboard", "เสื้อผ้าแฟชั่น"],
  ["shoes-reference-storyboard", "รองเท้า"],
  ["watch-eyewear-reference-storyboard", "นาฬิกาและแว่นตา"],
  ["mobile-tablet-reference-storyboard", "มือถือและแท็บเล็ต"],
  ["jewelry-reference-storyboard", "เครื่องประดับ"],
  ["mother-baby-reference-storyboard", "สินค้าแม่และเด็ก"],
  ["pet-supplies-reference-storyboard", "ของใช้และอาหารสัตว์"],
  ["sports-equipment-reference-storyboard", "อุปกรณ์กีฬา"],
  ["camera-photography-reference-storyboard", "กล้องและอุปกรณ์ถ่ายภาพ"],
  ["gaming-accessories-reference-storyboard", "เกมส์และอุปกรณ์เสริม"],
  ["automotive-reference-storyboard", "ยานยนต์"],
  ["stationery-reference-storyboard", "เครื่องเขียน"],
  ["books-reference-storyboard", "หนังสือ"],
] as const;

const productionReferenceStoryboardSkillIds = [
  "furniture-reference-storyboard",
  "cosmatic-reference-storyboard",
  ...categorySkills.map(([skillId]) => skillId),
] as const;

describe("category reference storyboard skills", () => {
  it("mark every production reference storyboard skill for Media Studio filtering", () => {
    for (const skillId of productionReferenceStoryboardSkillIds) {
      const skillDir = path.join(skillsRoot, skillId);
      const skillContent = fs.readFileSync(path.join(skillDir, "SKILL.md"), "utf-8");
      const mirroredSkillContent = fs.readFileSync(path.join(skillDir, "skill.md"), "utf-8");

      expect(mirroredSkillContent).toBe(skillContent);
      expect(skillContent).toContain("production-reference-storyboard");
      expect(skillContent).toContain("production_reference_storyboard:");
      expect(skillContent).toContain("enabled: true");
    }
  });

  it("provide mirrored markdown, schemas, and category-specific fidelity contracts", () => {
    for (const [skillId, thaiCategory] of categorySkills) {
      const skillDir = path.join(skillsRoot, skillId);
      const skillContent = fs.readFileSync(path.join(skillDir, "SKILL.md"), "utf-8");
      const mirroredSkillContent = fs.readFileSync(path.join(skillDir, "skill.md"), "utf-8");
      const outputContract = fs.readFileSync(
        path.join(skillDir, "references", "output_contract.md"),
        "utf-8",
      );
      const inputSchema = JSON.parse(
        fs.readFileSync(path.join(skillDir, "schemas", "input.schema.json"), "utf-8"),
      );
      const uiSchema = JSON.parse(
        fs.readFileSync(path.join(skillDir, "schemas", "ui.schema.json"), "utf-8"),
      );
      const outputSchema = JSON.parse(
        fs.readFileSync(path.join(skillDir, "schemas", "output.schema.json"), "utf-8"),
      );
      const lock = JSON.parse(fs.readFileSync(path.join(skillDir, "skill.lock.json"), "utf-8"));

      expect(mirroredSkillContent).toBe(skillContent);
      expect(skillContent).toContain(`name: ${skillId}`);
      expect(skillContent).toContain(thaiCategory);
      expect(skillContent).toContain("Reference Role Disambiguation Rule");
      expect(skillContent).toContain("PRODUCT PHYSICAL PROPORTION LOCK");
      expect(skillContent).toContain("TEXT RENDERING POLICY");
      expect(skillContent).toContain("Fatal QA Gates");
      expect(skillContent).toContain("image_text_mode");
      expect(skillContent).toContain("all product fidelity rules are rewritten for this category");

      expect(outputContract).toContain("plain prompt text only");
      expect(outputContract).toContain("canvas_9_16_grid_3x3_frame_9_16_exact");
      expect(outputContract).toContain(thaiCategory);
      expect(outputSchema.type).toBe("string");

      expect(inputSchema.properties.reference_product_images.description).toContain(thaiCategory);
      expect(inputSchema.properties.image_text_mode.default).toBe("no_text");
      expect(inputSchema.properties.image_text_language.default).toBe("en");
      expect(inputSchema.properties.cinematic_style.enum).toContain("info_graphics_realistic");
      expect(inputSchema.properties.cinematic_style.enum).toContain("info_graphics");
      expect(uiSchema["ui:order"]).toContain("image_text_mode");
      expect(uiSchema["ui:order"]).toContain("image_text_language");
      expect(lock.name).toBe(skillId);
    }
  });
});
