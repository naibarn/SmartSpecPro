-- A source/ACL projection is independently indexed in each routed AI Search
-- instance. Keep the source identity unique per instance so one shard cannot
-- overwrite the ledger receipt for another shard.
ALTER TABLE "rag_projection_items"
  DROP CONSTRAINT IF EXISTS "rag_projection_items_identity_unique";

ALTER TABLE "rag_projection_items"
  ADD CONSTRAINT "rag_projection_items_identity_unique"
  UNIQUE (
    "tenant_id", "source_type", "source_id", "source_version",
    "projection_part", "acl_scope", "instance_id", "embedding_profile"
  );
