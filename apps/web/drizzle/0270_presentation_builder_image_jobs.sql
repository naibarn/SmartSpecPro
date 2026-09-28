-- Durable Presentation Builder image jobs. The browser is not the owner of
-- the lifecycle; the server can keep polling and hydrate the exact slide slot
-- after the user closes and reopens the builder.
CREATE TABLE IF NOT EXISTS "presentation_builder_image_jobs" (
  "id" varchar(64) PRIMARY KEY NOT NULL,
  "tenant_id" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "deck_id" integer NOT NULL REFERENCES "presentation_decks"("id") ON DELETE CASCADE,
  "slot_id" varchar(160) NOT NULL,
  "page_number" integer NOT NULL,
  "image_index" integer NOT NULL,
  "placement_role" varchar(24) NOT NULL,
  "short_label" varchar(255) NOT NULL,
  "prompt" text NOT NULL,
  "model" varchar(255),
  "canvas_ratio" varchar(16),
  "media_task_id" varchar(256) NOT NULL,
  "status" varchar(24) NOT NULL DEFAULT 'processing',
  "result_url" text,
  "error_message" text,
  "attempt_count" integer NOT NULL DEFAULT 0,
  "next_poll_at" timestamptz NOT NULL DEFAULT now(),
  "last_checked_at" timestamptz,
  "completed_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "presentation_builder_image_jobs_slot_unique"
  ON "presentation_builder_image_jobs" ("tenant_id", "user_id", "deck_id", "slot_id");
CREATE INDEX IF NOT EXISTS "presentation_builder_image_jobs_due_idx"
  ON "presentation_builder_image_jobs" ("status", "next_poll_at");
CREATE INDEX IF NOT EXISTS "presentation_builder_image_jobs_deck_idx"
  ON "presentation_builder_image_jobs" ("tenant_id", "user_id", "deck_id", "page_number", "image_index");
