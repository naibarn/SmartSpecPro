import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const migrationPath = path.resolve(__dirname, "../0176_marketplace_capture.sql");
const sharingMigrationPath = path.resolve(__dirname, "../0177_marketplace_capture_sharing_history.sql");
const sharingTenantContextMigrationPath = path.resolve(__dirname, "../0178_marketplace_share_settings_tenant_context.sql");
const extensionDeviceBindingMigrationPath = path.resolve(__dirname, "../0179_marketplace_extension_device_binding.sql");
const activeCaptureUniqueMigrationPath = path.resolve(__dirname, "../0180_marketplace_capture_active_unique.sql");
const mainCategoryMigrationPath = path.resolve(__dirname, "../0197_marketplace_product_main_category.sql");
const mainCategoryInferenceMigrationPath = path.resolve(__dirname, "../0198_marketplace_product_main_category_inference.sql");
const mainCategoryPathPriorityMigrationPath = path.resolve(__dirname, "../0199_marketplace_product_main_category_path_priority.sql");
const schemaPath = path.resolve(__dirname, "../schema.ts");

describe("marketplace capture migration contract", () => {
  const migration = fs.readFileSync(migrationPath, "utf8");
  const sharingMigration = fs.readFileSync(sharingMigrationPath, "utf8");
  const sharingTenantContextMigration = fs.readFileSync(sharingTenantContextMigrationPath, "utf8");
  const extensionDeviceBindingMigration = fs.readFileSync(extensionDeviceBindingMigrationPath, "utf8");
  const activeCaptureUniqueMigration = fs.readFileSync(activeCaptureUniqueMigrationPath, "utf8");
  const mainCategoryMigration = fs.readFileSync(mainCategoryMigrationPath, "utf8");
  const mainCategoryInferenceMigration = fs.readFileSync(mainCategoryInferenceMigrationPath, "utf8");
  const mainCategoryPathPriorityMigration = fs.readFileSync(mainCategoryPathPriorityMigrationPath, "utf8");
  const schema = fs.readFileSync(schemaPath, "utf8");

  it("creates enum types before marketplace tables", () => {
    for (const typeName of [
      "marketplace_platform",
      "marketplace_page_type",
      "marketplace_capture_status",
      "marketplace_asset_kind",
      "marketplace_product_image_type",
      "marketplace_pairing_status",
    ]) {
      expect(migration).toContain(`CREATE TYPE ${typeName} AS ENUM`);
    }
    expect(migration.indexOf("CREATE TYPE marketplace_platform")).toBeLessThan(
      migration.indexOf('CREATE TABLE IF NOT EXISTS "marketplace_capture_sessions"'),
    );
    expect(migration).toContain("review_image");
    expect(migration).toContain("'review'");
  });

  it("creates all marketplace capture tables", () => {
    for (const tableName of [
      "marketplace_extension_pairings",
      "marketplace_capture_sessions",
      "marketplace_capture_assets",
      "marketplace_candidate_batches",
      "marketplace_candidate_items",
      "marketplace_products",
      "marketplace_product_images",
      "marketplace_product_price_snapshots",
    ]) {
      expect(migration).toContain(`CREATE TABLE IF NOT EXISTS "${tableName}"`);
    }
  });

  it("includes safety constraints and dedupe indexes", () => {
    expect(migration).toContain("marketplace_candidate_items_score_bounds");
    expect(migration).toContain("marketplace_products_price_nonnegative");
    expect(migration).toContain("marketplace_products_rating_bounds");
    expect(migration).toContain("marketplace_capture_assets_byte_size_positive");
    expect(migration).toContain('CREATE UNIQUE INDEX IF NOT EXISTS "idx_marketplace_capture_sessions_user_source_unique"');
    expect(migration).toContain('CREATE UNIQUE INDEX IF NOT EXISTS "idx_marketplace_capture_sessions_user_product_pair_unique"');
    expect(migration).toContain('CREATE UNIQUE INDEX IF NOT EXISTS "idx_marketplace_products_user_product_unique"');
    expect(migration).toContain('CREATE UNIQUE INDEX IF NOT EXISTS "idx_marketplace_products_user_product_pair_unique"');
    expect(migration).toContain('WHERE "externalProductId" IS NOT NULL');
    expect(migration).toContain('WHERE "externalShopId" IS NOT NULL AND "externalProductId" IS NOT NULL');
  });

  it("keeps schema enum and migration enum names aligned", () => {
    for (const enumExport of [
      "marketplacePlatformEnum",
      "marketplacePageTypeEnum",
      "marketplaceCaptureStatusEnum",
      "marketplaceAssetKindEnum",
      "marketplaceProductImageTypeEnum",
      "marketplacePairingStatusEnum",
    ]) {
      expect(schema).toContain(`export const ${enumExport}`);
    }
  });

  it("adds marketplace sharing settings and metric history fields", () => {
    expect(sharingMigration).toContain('CREATE TABLE IF NOT EXISTS "marketplace_product_group_shares"');
    expect(sharingMigration).toContain('CREATE TABLE IF NOT EXISTS "marketplace_user_share_settings"');
    expect(sharingMigration).toContain('"capturedByUserId"');
    expect(sharingMigration).toContain('"ratingScore" numeric(4, 2)');
    expect(sharingMigration).toContain('"reviewCountText" varchar(128)');
    expect(sharingMigration).toContain('"reviewCountNormalized" integer');
    expect(sharingMigration).toContain('"idx_marketplace_product_group_shares_unique"');
    expect(sharingMigration).toContain('"idx_marketplace_user_share_settings_unique"');
    expect(schema).toContain("export const marketplaceProductGroupShares");
    expect(schema).toContain("export const marketplaceUserShareSettings");
  });

  it("keeps marketplace sharing tenant context compatible with group tenant ids", () => {
    expect(sharingTenantContextMigration).toContain('ALTER TABLE "marketplace_user_share_settings" DROP CONSTRAINT');
    expect(sharingTenantContextMigration).toContain('ALTER TABLE "marketplace_product_group_shares" DROP CONSTRAINT');
    expect(sharingTenantContextMigration).toContain("Access is enforced through active group membership");
    expect(schema).toContain('tenantId: varchar("tenantId", { length: 36 }).notNull(),');
  });

  it("binds extension pairings to one browser installation", () => {
    expect(extensionDeviceBindingMigration).toContain('"deviceIdHash" varchar(64)');
    expect(extensionDeviceBindingMigration).toContain('"tokenJti" varchar(128)');
    expect(extensionDeviceBindingMigration).toContain('"idx_marketplace_extension_pairings_device"');
    expect(schema).toContain('deviceIdHash: varchar("deviceIdHash", { length: 64 }),');
    expect(schema).toContain('tokenJti: varchar("tokenJti", { length: 128 }),');
  });

  it("allows new active capture drafts after confirmed or discarded captures", () => {
    expect(activeCaptureUniqueMigration).toContain('DROP INDEX IF EXISTS "idx_marketplace_capture_sessions_user_source_unique"');
    expect(activeCaptureUniqueMigration).toContain('DROP INDEX IF EXISTS "idx_marketplace_capture_sessions_user_product_pair_unique"');
    expect(activeCaptureUniqueMigration).toContain('"status" NOT IN (\'confirmed\', \'discarded\')');
    expect(schema).toContain('"status" NOT IN (\'confirmed\', \'discarded\')');
  });

  it("adds and backfills marketplace product main storyboard category", () => {
    expect(mainCategoryMigration).toContain('ADD COLUMN IF NOT EXISTS "productCategory" varchar(64)');
    expect(mainCategoryMigration).toContain('capture."rawPayloadJson"->>\'productCategory\'');
    expect(mainCategoryMigration).toContain('capture."normalizedResultJson"->>\'productCategory\'');
    expect(mainCategoryMigration).toContain("'computer_laptop'");
    expect(mainCategoryMigration).toContain("'cosmetics'");
    expect(schema).toContain('productCategory: varchar("productCategory", { length: 64 })');
  });

  it("infers marketplace product main category from existing category evidence", () => {
    expect(mainCategoryInferenceMigration).toContain("category_evidence");
    expect(mainCategoryInferenceMigration).toContain("'computer_laptop'");
    expect(mainCategoryInferenceMigration).toContain("'mother_baby'");
    expect(mainCategoryInferenceMigration).toContain("'sports_equipment'");
    expect(mainCategoryPathPriorityMigration).toContain("path_priority_inferred");
    expect(mainCategoryPathPriorityMigration).toContain("'household_product'");
    expect(mainCategoryPathPriorityMigration).toContain("'furniture'");
  });
});
