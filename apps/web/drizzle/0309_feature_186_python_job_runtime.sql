-- Feature 186: PostgreSQL control-plane jobs executed by the Python runtime.
-- This is additive; the existing Celery transport remains a compatibility
-- adapter until all Python task families have passed their rollout gates.
ALTER TYPE "worker_runtime_type" ADD VALUE IF NOT EXISTS 'python_job_worker';
