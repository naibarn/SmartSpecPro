ALTER TABLE "video_editor_project_revisions"
  ADD COLUMN IF NOT EXISTS "parentRevisionId" varchar(36)
  REFERENCES "video_editor_project_revisions"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "video_editor_project_revisions_parent_idx"
  ON "video_editor_project_revisions" ("parentRevisionId");
