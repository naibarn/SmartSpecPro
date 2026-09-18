import { describe, expect, it } from "vitest";
import { getTableColumns } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import * as schema from "./schema";

describe("Feature 201 schema contract", () => {
  it("exports the protection, verification, and evidence tables", () => {
    for (const table of [
      "contentProtectionAssets",
      "contentProtectionWatermarks",
      "contentProtectionFingerprints",
      "contentProvenanceManifests",
      "contentPublications",
      "contentVerificationRuns",
      "contentVerificationMatches",
      "contentProtectionCases",
      "contentEvidencePackages",
      "contentProtectionEvents",
      "contentProtectionSettings",
      "contentRightsHolderProfiles",
      "contentRightsClaims",
      "contentRightsEvidenceDocuments",
      "contentComponentRights",
      "contentCreationCertificates",
      "contentEvidenceAnchors",
      "contentExternalReviewLinks",
    ]) {
      expect((schema as Record<string, unknown>)[table], table).toBeDefined();
    }
  });

  it("keeps raw watermark codewords out of the public schema columns", () => {
    const table = schema.contentProtectionWatermarks;
    const columns = table ? Object.keys(getTableColumns(table)) : [];
    expect(columns).not.toContain("videoCodewordEncrypted");
    expect(columns).not.toContain("audioTagEncrypted");
  });

  it("keeps tenant and idempotency boundaries in the primary asset table", () => {
    const columns = getTableColumns(schema.contentProtectionAssets);
    expect(columns).toHaveProperty("tenantId");
    expect(columns).toHaveProperty("ownerUserId");
    expect(columns).toHaveProperty("publicAssetId");
    expect(columns).toHaveProperty("sourceSha256");
    expect(columns).toHaveProperty("protectedSha256");
    expect(columns).toHaveProperty("firstObservedAt");
    expect(columns).toHaveProperty("trustedTimestampAt");

    const indexNames = getTableConfig(schema.contentProtectionAssets).indexes.map(
      index => index.config.name
    );
    expect(indexNames).toContain("content_protection_assets_tenant_idempotency_unique");
    expect(indexNames).toContain("content_protection_assets_public_id_unique");
    expect(indexNames).toContain("content_protection_assets_tenant_status_idx");
    expect(indexNames).toContain("content_protection_assets_protected_hash_idx");
  });

  it("keeps reviewer-facing case identifiers separate from internal primary keys", () => {
    const columns = getTableColumns(schema.contentProtectionCases);
    expect(columns).toHaveProperty("publicCaseId");
    const indexNames = getTableConfig(schema.contentProtectionCases).indexes.map(
      index => index.config.name
    );
    expect(indexNames).toContain("content_protection_cases_public_id_unique");
  });
});
