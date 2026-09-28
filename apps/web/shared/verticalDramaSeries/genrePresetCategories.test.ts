import { describe, expect, it } from "vitest";
import { genrePresetCategoryLabel } from "./genrePresetCategories";

const LOCAL_SERVICE_PRESET_CATEGORIES = [
  "thai_local_service_comedy_mini_drama",
  "restaurant_service_skit",
  "food_shop_tie_in_drama",
  "local_business_comedy_drama",
  "customer_staff_situation_comedy",
  "thai_everyday_lifestyle_skit",
];

const ROMANCE_EXPANSION_CATEGORIES = [
  "romantic-comedy",
  "soul-kiss-fantasy-romance",
  "relentless-pursuit-romance",
  "intern-romance",
  "secret-junior-romance",
  "sweet-wholesome-romance",
];

describe("genrePresetCategoryLabel", () => {
  it("has friendly Thai and English labels for local-service mix-and-match categories", () => {
    for (const slug of LOCAL_SERVICE_PRESET_CATEGORIES) {
      expect(genrePresetCategoryLabel(slug, "th")).not.toBe(slug);
      expect(genrePresetCategoryLabel(slug, "en")).not.toBe(slug);
    }
  });

  it("has friendly Thai and English labels for the romance expansion categories", () => {
    for (const slug of ROMANCE_EXPANSION_CATEGORIES) {
      expect(genrePresetCategoryLabel(slug, "th")).not.toBe(slug);
      expect(genrePresetCategoryLabel(slug, "en")).not.toBe(slug);
    }
  });
});
