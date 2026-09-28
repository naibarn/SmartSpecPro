# Synthesized Specification

Implement durable Media Studio artifacts for image, video, and audio generation across Python provider tasks, deferred retries, MCP, Hermes, and merged Media History projections.

Each completed output gets an owner-scoped artifact record containing its provider URL, provider availability state, R2 media asset reference, R2 state, playback URL, fallback URL, timestamps, and errors. R2 is canonical; the provider URL is retained for provenance and fallback only. Existing completed provider-only tasks are migrated through a bounded, resumable backfill.

The system must fail closed without verified `tenantId` and `userId`, validate provider redirects/MIME/size, redact provider query secrets from logs, and use unique/idempotent storage writes. Media History must expose explicit `storage_pending`, `provider_fallback`, `provider_expired`, and `r2_missing` states. The authorized R2 proxy remains cacheable through ETag/conditional validation and supports video Range requests.

Preserve unrelated dirty-worktree changes and do not claim live provider/R2, authenticated browser, target-DB migration, or deployment proof unless performed.
