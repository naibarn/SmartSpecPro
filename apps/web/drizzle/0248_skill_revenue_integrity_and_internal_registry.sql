ALTER TABLE "skill_revenue_settlements"
  ADD CONSTRAINT "skill_revenue_settlements_total_matches_split"
    CHECK ("totalCredits" = "tenantCredits" + "skillOwnerCredits");

ALTER TABLE "skill_revenue_settlements"
  DROP CONSTRAINT IF EXISTS "skill_revenue_settlements_tenant_owner_id_fk",
  DROP CONSTRAINT IF EXISTS "skill_revenue_settlements_skill_owner_id_fk";

ALTER TABLE "skill_revenue_settlements"
  ADD CONSTRAINT "skill_revenue_settlements_tenant_owner_id_fk"
    FOREIGN KEY ("tenantOwnerId") REFERENCES "users"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "skill_revenue_settlements_skill_owner_id_fk"
    FOREIGN KEY ("skillOwnerId") REFERENCES "users"("id") ON DELETE RESTRICT;

-- These are canonical system skills invoked by server-side workflows without a
-- local folder. They must still be real registry rows so fixed-credit settlement
-- can resolve pricing and ownership fail-closed.
INSERT INTO "skills" (
  "slug", "name", "description", "category", "importSource", "visibility",
  "executionMode", "tenantCreditCost", "skillOwnerCreditCost", "createdAt", "updatedAt"
)
VALUES
  ('ai-presentation', 'AI Presentation', 'System presentation generation skill.', 'other', 'system', 'private', 'llm-only', 2, 0, now(), now()),
  ('audio-generation', 'Audio Generation', 'System audio generation skill.', 'other', 'system', 'private', 'media-generate', 2, 0, now(), now()),
  ('marketplace-capture-product-brief', 'Marketplace Capture Product Brief', 'System marketplace capture brief skill.', 'other', 'system', 'private', 'llm-only', 2, 0, now(), now()),
  ('marketplace-hyperframes', 'Marketplace HyperFrames', 'System HyperFrames marketplace skill.', 'other', 'system', 'private', 'media-generate', 2, 0, now(), now()),
  ('marketplace-product-description-web-enrichment', 'Marketplace Product Description Web Enrichment', 'System marketplace enrichment skill.', 'other', 'system', 'private', 'llm-only', 2, 0, now(), now()),
  ('vertical-drama-deep-story-draft', 'Vertical Drama Deep Story Draft', 'System deep story drafting skill.', 'other', 'system', 'private', 'llm-only', 2, 0, now(), now()),
  ('vertical-drama-source-visual-analysis', 'Vertical Drama Source Visual Analysis', 'System source visual analysis skill.', 'other', 'system', 'private', 'llm-only', 2, 0, now(), now()),
  ('vertical-drama-voice-chain', 'Vertical Drama Voice Chain', 'System vertical drama voice-chain skill.', 'other', 'system', 'private', 'media-generate', 2, 0, now(), now())
ON CONFLICT ("slug") DO NOTHING;
