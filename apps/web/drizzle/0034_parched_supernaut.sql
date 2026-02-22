ALTER TABLE "library_chunks" ADD COLUMN "is_parent" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "library_chunks" ADD COLUMN "parent_chunk_id" text;--> statement-breakpoint
CREATE INDEX "library_chunks_parent_chunk_idx" ON "library_chunks" USING btree ("parent_chunk_id");