import fs from "fs";
import path from "path";

const PRODUCT_REFERENCE_STORYBOARD_SKILL_ID = "product-reference-storyboard";

const PRODUCT_REFERENCE_STORYBOARD_CATEGORY_IDS = new Set([
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
]);

export type ProductReferenceStoryboardCategoryRuleAudit = {
  status:
    | "not_applicable"
    | "missing_category"
    | "appended"
    | "rule_file_missing"
    | "rule_file_read_failed";
  skillSlug: string;
  category: string | null;
  categoryPath: string | null;
  checkedPaths: string[];
  error: string | null;
};

function normalizeProductReferenceStoryboardCategory(value: unknown): string | null {
  const category = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/-/g, "_")
    .replace(/[^a-z0-9_]/g, "");
  if (!category || category === "auto") return null;
  return PRODUCT_REFERENCE_STORYBOARD_CATEGORY_IDS.has(category) ? category : null;
}

function resolveSkillFolderCandidates(input: {
  skillSlug: string;
  folderPath?: string | null;
  skillDirectories?: string[];
}): string[] {
  const candidates: string[] = [];
  candidates.push(...(input.skillDirectories ?? []));
  if (input.folderPath) {
    candidates.push(
      path.resolve(process.cwd(), input.folderPath),
      path.resolve(process.cwd(), "..", input.folderPath),
      path.resolve(process.cwd(), "apps", "web", input.folderPath)
    );
  }
  candidates.push(
    path.resolve(process.cwd(), "skills", input.skillSlug),
    path.resolve(process.cwd(), "..", "skills", input.skillSlug),
    path.resolve(process.cwd(), "apps", "web", "skills", input.skillSlug)
  );
  return Array.from(new Set(candidates));
}

export function appendProductReferenceStoryboardCategoryRules(
  systemPrompt: string,
  params: {
    skillSlug: string;
    folderPath?: string | null;
    skillDirectories?: string[];
    userInputs: Record<string, unknown>;
  }
): { systemPrompt: string; audit: ProductReferenceStoryboardCategoryRuleAudit } {
  if (params.skillSlug !== PRODUCT_REFERENCE_STORYBOARD_SKILL_ID) {
    return {
      systemPrompt,
      audit: {
        status: "not_applicable",
        skillSlug: params.skillSlug,
        category: null,
        categoryPath: null,
        checkedPaths: [],
        error: null,
      },
    };
  }

  const category = normalizeProductReferenceStoryboardCategory(
    params.userInputs.product_category
  );
  if (!category) {
    return {
      systemPrompt,
      audit: {
        status: "missing_category",
        skillSlug: params.skillSlug,
        category: null,
        categoryPath: null,
        checkedPaths: [],
        error: "product_category must be concrete before skill execution",
      },
    };
  }

  const checkedPaths: string[] = [];
  for (const skillDir of resolveSkillFolderCandidates(params)) {
    const categoryPath = path.join(
      skillDir,
      "references",
      "product-categories",
      `${category}.md`
    );
    checkedPaths.push(categoryPath);
    if (!fs.existsSync(categoryPath)) continue;
    try {
      const categoryRules = fs.readFileSync(categoryPath, "utf-8").trim();
      if (categoryRules) {
        return {
          systemPrompt: [
            systemPrompt,
            "## Selected Product Category Rule File",
            `Selected product_category: ${category}.`,
            categoryRules,
          ].join("\n\n"),
          audit: {
            status: "appended",
            skillSlug: params.skillSlug,
            category,
            categoryPath,
            checkedPaths,
            error: null,
          },
        };
      }
    } catch (error) {
      return {
        systemPrompt,
        audit: {
          status: "rule_file_read_failed",
          skillSlug: params.skillSlug,
          category,
          categoryPath,
          checkedPaths,
          error: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  return {
    systemPrompt,
    audit: {
      status: "rule_file_missing",
      skillSlug: params.skillSlug,
      category,
      categoryPath: null,
      checkedPaths,
      error: `category rule file not found for ${category}`,
    },
  };
}
