import { describe, it, expect } from "vitest";
import {
  CAPABILITY_FAMILIES,
  DEFAULT_CREDIT_MODE,
} from "../executors/types";

describe("executors/types", () => {
  describe("CAPABILITY_FAMILIES", () => {
    it("contains all expected family strings", () => {
      expect(CAPABILITY_FAMILIES).toContain("writing.article");
      expect(CAPABILITY_FAMILIES).toContain("writing.review");
      expect(CAPABILITY_FAMILIES).toContain("media.image");
      expect(CAPABILITY_FAMILIES).toContain("media.video");
      expect(CAPABILITY_FAMILIES).toContain("media.audio");
      expect(CAPABILITY_FAMILIES).toContain("orchestration.swarm");
      expect(CAPABILITY_FAMILIES).toContain("skill_factory.create");
    });

    it("has exactly 7 entries", () => {
      expect(CAPABILITY_FAMILIES).toHaveLength(7);
    });

    it("is frozen", () => {
      expect(Object.isFrozen(CAPABILITY_FAMILIES)).toBe(true);
    });
  });

  describe("DEFAULT_CREDIT_MODE", () => {
    it('equals "deduct"', () => {
      expect(DEFAULT_CREDIT_MODE).toBe("deduct");
    });
  });

  describe("module imports", () => {
    it("exports types without throwing", async () => {
      const mod = await import("../executors/types");
      expect(mod.CAPABILITY_FAMILIES).toBeDefined();
      expect(mod.DEFAULT_CREDIT_MODE).toBeDefined();
    });
  });
});
