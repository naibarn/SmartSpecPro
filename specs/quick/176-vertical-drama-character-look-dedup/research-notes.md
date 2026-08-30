# Research notes

- `characterLookSelection.ts` creates a request identity from family, intent,
  scene, location, and time. It already aggregates identical request keys but
  intentionally returns the request key in each suggestion.
- `verticalDramaEpisodePipeline.ts` currently searches existing rows only by
  `lookRequestKey` or request-specific/stable semantic metadata. It does not
  inspect legacy `variantLabel`/`variantType` or derive an intent from existing
  visual fields.
- The current insert path is tenant/user/series scoped and has an
  `onConflictDoNothing` plus re-read recovery for the generated character key.
- `vertical_drama_characters` has no semantic-look unique constraint. The patch
  therefore keeps the existing race recovery and prevents duplicates from the
  loaded roster/current run without introducing a risky migration.
- Existing dirty worktree changes include unrelated stop-frame synchronization
  in the same pipeline file; those hunks must remain untouched.
- No SocratiCode MCP tool was available, so discovery used targeted shell reads
  after narrowing the candidate files from existing specs and symbol matches.
