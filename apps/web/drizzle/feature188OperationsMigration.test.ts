import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const operationsMigration = readFileSync(new URL("./0318_feature_188_platform_operations.sql", import.meta.url), "utf8");
const promotionBindingMigration = readFileSync(new URL("./0322_feature_188_promotion_binding.sql", import.meta.url), "utf8");
const promotionFencingMigration = readFileSync(new URL("./0323_feature_188_promotion_batch_fencing.sql", import.meta.url), "utf8");

describe("Feature 188 migration contract", () => {
  it("creates platform evidence tables without destructive migration steps", () => {
    for (const table of [
      "platform_release_controls",
      "platform_gate_results",
      "data_promotions",
      "data_promotion_batches",
      "data_promotion_dispositions",
      "platform_operation_outbox",
      "platform_action_keys",
    ]) {
      expect(operationsMigration).toContain(`CREATE TABLE IF NOT EXISTS "${table}"`);
    }
    expect(operationsMigration).not.toMatch(/DROP TABLE|TRUNCATE|DELETE FROM/i);
  });

  it("binds activation to a promotion and fences checkpoint runners additively", () => {
    expect(promotionBindingMigration).toContain('ADD COLUMN IF NOT EXISTS "promotionId"');
    expect(promotionBindingMigration).toContain("platform_release_controls_promotion_fk");
    expect(promotionFencingMigration).toContain('ADD COLUMN IF NOT EXISTS "leaseTokenHash"');
    expect(promotionFencingMigration).toContain('ADD COLUMN IF NOT EXISTS "fencingVersion"');
    expect(promotionBindingMigration).not.toMatch(/DROP TABLE|TRUNCATE|DELETE FROM/i);
    expect(promotionFencingMigration).not.toMatch(/DROP TABLE|TRUNCATE|DELETE FROM/i);
  });
});
