-- Feature 186: Node-side PostgreSQL-pull execution runtime.
-- Additive enum expansion; existing worker runtime values remain unchanged.
ALTER TYPE "worker_runtime_type" ADD VALUE IF NOT EXISTS 'node_job_worker';
