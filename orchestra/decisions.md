# Orchestra Decisions

[2026-07-20T01:35:00Z] DECISION: Recommend one enabled backward-compatible
GPT Image 2 catalog row with declarative reference-driven Kie model routing.
  Context: The current stack already separates the selected/public model ID from
  `api_config.kie_model_id`, and all Kie image requests expose normalized reference
  URLs at the provider boundary.
  Alternatives considered: new canonical row, frontend-only switching, and a
  hardcoded provider-wide GPT-specific branch.

[2026-07-20T08:50:00+07:00] DECISION: Implement the approved route as an
opt-in provider capability keyed by `kie_model_id_with_references`.
  Context: Reference URLs and flattened model API config meet at the Python Kie
  provider, making it the narrowest authoritative switching boundary.
  Proof: catalog migration/seed tests, enabled-model alias test, TypeScript
  metadata-forwarding test, and 28 focused Python provider tests pass.

[2026-07-20T08:48:32+07:00] DECISION: Back up the affected database tables
before applying migration 0212.
  Backup: /home/dev/projects/SmartSpecPro/orchestra/backups/backup-20260720-014832Z-kie-gpt-image-2-pre-migration.dump
  Scope: public.media_models and drizzle.__drizzle_migrations from database smartspec
  Format: PostgreSQL custom archive; SHA-256 cd4a731a919fde4adf1c6c0551727ee46b9498ff988cbc24e8c8ab089af1e6bf
  Restore: inspect with pg_restore --list, then restore into a recovery database
  with pg_restore --data-only --dbname=<recovery_database> <backup>.

[2026-07-20T08:49:21+07:00] DECISION: Raise migration 0212 journal timestamp
above the latest live migration timestamp before retrying Drizzle migrate.
  Context: the first migrate command exited successfully but skipped 0212 because
  its original journal timestamp was older than an out-of-band live ledger entry.
  Proof: the retried migration inserted hash
  96aba02e01fa08d411a251e8c8f05b687974b031bf4b5777379e7f4d52f1dc67
  once and produced the expected one-enabled-row database state.

[2026-07-20T09:08:11+07:00] DECISION: Gracefully drain and restart only the
production media Celery worker after explicit user approval.
  Context: the bind-mounted source was current but the worker process had loaded
  the old provider module two days earlier; an active generation was allowed to
  finish before the media consumer restarted.
  Proof: media queue consumer is restored, worker ping is OK, and the fresh
  process resolves reference-bearing GPT Image 2 requests to image-to-image.

[2026-07-20T09:11:47+07:00] DECISION: Persist the effective opt-in image model
at async task creation and restart only the Python backend.
  Context: provider routing alone fixed Kie execution but Media History reads
  media_tasks.model, which previously retained the canonical text-to-image ID.
  Proof: three new endpoint tests plus 28 provider tests pass; backend health is
  HTTP 200 after restart.

[2026-07-20T09:25:37+07:00] DECISION: Stop the only abandoned MCP media task
after creating a table-data backup.
  Context: task mcp_815c37bf01582291e6bb200d7b9960a1 caused 354 wrong-backend
  fetch-result calls in about 100 seconds and exhausted a shared limiter bucket.
  Backup: /home/dev/projects/SmartSpecPro/orchestra/backups/backup-20260720-mcp-media-tasks-pre-polling-stop.sql
  Scope: public.mcp_media_tasks data
  Format: PostgreSQL plain SQL data dump
  Restore: load into a recovery database with psql; do not restore the stale row
  to production because it would re-enable the incident condition.

[2026-07-20T09:41:00+07:00] DECISION: Deploy the approved complete fix by
gracefully restarting only the backend and web services.
  Context: focused routing, polling, reconciliation, and JWT identity tests
  passed; no schema or infrastructure change was required.
  Proof: both services are active, local/public health passed, and two polling
  windows recorded zero fetch-result bursts, 404s, limiter events, or 429s.
[2026-07-20T22:55:37Z] DECISION: Route per-shot prompt plus image generation through the bounded per-shot prompt mutation
  Context: Production evidence showed eight duplicate full start-frame plan runs for episode 114; synchronous whole-episode planning behind each per-shot click caused overlapping retries and HTTP 524 responses.
  Alternatives considered: Client-only single-flight would still leave the first long request exposed to the proxy timeout; increasing the proxy timeout would preserve duplicate expensive work.
