# Decision log

## Depth

**standard quick-plan**. The change crosses skill content, one server adapter,
shared snapshot typing, two router call paths, and focused tests, but stays
within the existing Vertical Drama character boundary. It does not require a
new provider, worker, migration, or unrelated domain. Promote to full
deep-plan if implementation reveals that replacing legacy DNA requires changes
across the episode pipeline or a database migration.

## Decisions

1. Use a dedicated adapter instead of embedding the new skill in the large
   legacy service. This isolates the new output contract and keeps a rollback
   path.
2. Generate one profile per requested deliverable. Do not call the old and new
   skills for the same request.
3. Keep the existing portrait approval contract and skip the second LLM call
   when an approved prompt is returned by preview.
4. Add a validated `characterPromptProfile` to persisted/approved visual-bible
   snapshots. Legacy `designDna` remains supported and is not synthesized with
   invented narrative facts.
5. Keep reference-guided candidate casting on `character-candidate-prompt`.
6. Use the existing series model policy and fixed skill-run settlement, changing
   only the skill slug and feature metadata for the new path.

## Risks still monitored

- New profile output may not contain every legacy narrative DNA field. Readers
  must tolerate profile-only snapshots and use its visual summary/face blueprint
  as continuity evidence.
- The existing target-model approval reuse gate expects the current contract
  version. The adapter will emit that version only after its profile prompt has
  passed the same model capability/length checks.
- The UI should not expose a removed field as an empty fallback. Optional fields
  must remain absent when a deliverable was not requested.
