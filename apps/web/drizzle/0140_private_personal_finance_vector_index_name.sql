ALTER TABLE "library_chunks"
ADD COLUMN IF NOT EXISTS "vector_index_name" varchar(128);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "library_chunks_vector_index_name_idx"
ON "library_chunks" USING btree ("vector_index_name");
--> statement-breakpoint

-- compatibility-only: legacy rows keep NULL vector index names until they are re-indexed.
