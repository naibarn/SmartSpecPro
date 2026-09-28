-- Video Studio deliberately has no bridge to the standalone Video Editor.
-- The column had no foreign key and no readers/writers; remove the misleading
-- dead stub from installations created before the manual table definition was
-- updated. The IF EXISTS guard keeps this safe for fresh installations.
ALTER TABLE IF EXISTS "video_projects"
  DROP COLUMN IF EXISTS "videoEditorProjectId";
