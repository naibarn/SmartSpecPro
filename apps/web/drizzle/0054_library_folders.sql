-- Add parent_id to library_items for folder support
ALTER TABLE "library_items" ADD COLUMN "parent_id" integer;

ALTER TABLE "library_items"
  ADD CONSTRAINT "library_items_parent_id_library_items_id_fk"
  FOREIGN KEY ("parent_id") REFERENCES "library_items"("id") ON DELETE cascade ON UPDATE no action;

CREATE INDEX "library_items_parent_id_idx" ON "library_items" ("parent_id");
