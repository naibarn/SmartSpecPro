CREATE TABLE IF NOT EXISTS "media_studio_storyboard_reviews" (
  "id" serial PRIMARY KEY,
  "userId" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "name" varchar(256) NOT NULL,
  "reviewData" json NOT NULL,
  "status" varchar(24) NOT NULL DEFAULT 'active',
  "videoEditorProjectId" integer REFERENCES "video_editor_projects"("id") ON DELETE SET NULL,
  "clipCount" integer DEFAULT 0,
  "completedClipCount" integer DEFAULT 0,
  "thumbnailUrl" text,
  "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
  "updatedAt" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "media_studio_storyboard_reviews_user_idx"
  ON "media_studio_storyboard_reviews" ("userId");

CREATE INDEX IF NOT EXISTS "media_studio_storyboard_reviews_updated_idx"
  ON "media_studio_storyboard_reviews" ("updatedAt");

CREATE INDEX IF NOT EXISTS "media_studio_storyboard_reviews_status_idx"
  ON "media_studio_storyboard_reviews" ("status");
