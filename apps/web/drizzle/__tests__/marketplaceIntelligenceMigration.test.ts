import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const migrationPath = path.resolve(__dirname, "../0209_marketplace_intelligence_persistence.sql");
const schemaPath = path.resolve(__dirname, "../schema.ts");

describe("marketplace intelligence persistence migration", () => {
  const migration = fs.readFileSync(migrationPath, "utf8");
  const schema = fs.readFileSync(schemaPath, "utf8");

  it("creates all user-owned marketplace intelligence tables", () => {
    for (const tableName of [
      "marketplace_connector_grants",
      "marketplace_connector_grant_events",
      "marketplace_connector_field_samples",
      "marketplace_search_snapshots",
      "marketplace_search_snapshot_items",
      "marketplace_search_snapshot_product_links",
      "marketplace_product_metric_connector_snapshots",
      "marketplace_keyword_discoveries",
      "marketplace_keyword_discovery_clusters",
      "marketplace_search_reports",
      "marketplace_search_report_exports",
      "marketplace_intelligence_watchlists",
      "marketplace_intelligence_watchlist_events",
    ]) {
      expect(migration).toContain(`CREATE TABLE IF NOT EXISTS "${tableName}"`);
    }
  });

  it("adds idempotency, ownership, and exact monitor indexes", () => {
    expect(migration).toContain('"tenantId" varchar(36) NOT NULL');
    expect(migration).toContain('"userId" integer NOT NULL');
    expect(migration).toContain('"marketplace_search_snapshots_idempotency_unique"');
    expect(migration).toContain('"marketplace_search_snapshot_items_external_idx"');
    expect(migration).toContain('"marketplace_search_reports_payload_unique"');
    expect(migration).toContain('"marketplace_intelligence_watchlists_unique"');
  });

  it("preserves raw retention metadata without requiring raw payload storage", () => {
    expect(migration).toContain('"rawPayloadExpiresAt" timestamp with time zone');
    expect(migration).toContain('"rawPayloadRedactedAt" timestamp with time zone');
    expect(migration).toContain('"redactionState" varchar(40) DEFAULT \'raw_not_stored\' NOT NULL');
  });

  it("keeps schema exports aligned with migration tables", () => {
    for (const exportName of [
      "marketplaceConnectorGrants",
      "marketplaceSearchSnapshots",
      "marketplaceSearchSnapshotItems",
      "marketplaceKeywordDiscoveries",
      "marketplaceSearchReports",
      "marketplaceIntelligenceWatchlists",
    ]) {
      expect(schema).toContain(`export const ${exportName}`);
    }
  });
});
