# Section 02 — repair service and persistence

Ownership: revision schema/migration, `verticalDramaEpisodeRepair.ts`, and service tests.

Create an immutable episode revision ledger. The service loads the owned series/episode, previous memory, previous episode summary, bounded next-episode constraint, and current source fingerprint. It invokes the existing story-builder and storyboard-shotgrid skills in sequence, validates the exact 9-shot contract, stores a candidate, and auto-promotes only when all gates pass. Promotion updates script/storyboard and resets stale downstream plans without deleting media. Guard every read/write by tenantId, userId, seriesId, and episodeId.

TDD: repository lifecycle, stale source, malformed output, safety failure, successful promotion, rollback-safe preservation, and idempotency.
