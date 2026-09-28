# Section 02: episode pipeline integration

## Ownership

- `apps/web/server/services/verticalDramaEpisodePipeline.ts`
- focused pipeline tests only if an existing harness can exercise the private
  resolver without broad fixture expansion

## Work

Use the stable semantic identity and shared matching helpers before insert.
Preserve existing metadata update rules, insert conflict recovery, manual
override behavior, and tenant/user/series predicates. Verify unrelated dirty
pipeline hunks remain unchanged.
