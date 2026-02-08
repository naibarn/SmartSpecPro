ALTER TABLE "workflow_templates" ALTER COLUMN "tenantId" SET DATA TYPE varchar(36);--> statement-breakpoint
ALTER TABLE "workflows" ALTER COLUMN "tenantId" SET DATA TYPE varchar(36);--> statement-breakpoint

-- Manual enhancements for workflow system

-- GIN index for tags (cast json to jsonb for GIN indexing)
CREATE INDEX IF NOT EXISTS "workflow_templates_tags_gin" ON "workflow_templates" USING GIN ((tags::jsonb));--> statement-breakpoint

-- Convert searchVector from text to tsvector type (if it exists as text)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'workflow_templates' AND column_name = 'searchVector' AND data_type = 'text'
  ) THEN
    ALTER TABLE "workflow_templates" DROP COLUMN "searchVector";
    ALTER TABLE "workflow_templates" ADD COLUMN "searchVector" tsvector;
  END IF;
END $$;--> statement-breakpoint

-- Auto-update search_vector from name + description
CREATE OR REPLACE FUNCTION workflow_templates_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW."searchVector" := to_tsvector('english', COALESCE(NEW.name, '') || ' ' || COALESCE(NEW.description, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

DROP TRIGGER IF EXISTS workflow_templates_search_vector_trigger ON "workflow_templates";--> statement-breakpoint
CREATE TRIGGER workflow_templates_search_vector_trigger
BEFORE INSERT OR UPDATE ON "workflow_templates"
FOR EACH ROW EXECUTE FUNCTION workflow_templates_search_vector_update();--> statement-breakpoint

-- GIN index on search_vector for full-text search
CREATE INDEX IF NOT EXISTS "workflow_templates_search_vector_gin" ON "workflow_templates" USING GIN ("searchVector");--> statement-breakpoint

-- Check constraint for rating value (1-5)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE constraint_name = 'template_ratings_rating_check'
  ) THEN
    ALTER TABLE "template_ratings" ADD CONSTRAINT "template_ratings_rating_check" CHECK (rating >= 1 AND rating <= 5);
  END IF;
END $$;