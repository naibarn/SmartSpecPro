-- Migration: Add celery_task_id column to media_tasks
-- Date: 2026-02-09
-- Purpose: Track internal Celery task UUID separately from external provider task ID

BEGIN;

-- Add celery_task_id column (nullable for backward compatibility with existing rows)
ALTER TABLE media_tasks
ADD COLUMN celery_task_id VARCHAR(36);

-- Add index for faster lookups by Celery task ID
CREATE INDEX idx_media_tasks_celery_task_id ON media_tasks(celery_task_id);

-- Add comment for documentation
COMMENT ON COLUMN media_tasks.celery_task_id IS 'Internal Celery task UUID for tracking and monitoring (separate from external provider task_id)';

COMMIT;
