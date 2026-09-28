# Decision Log

## Depth

Standard quick-plan. The request is a medium-to-large cross-cutting change, but
the repository already has the draft ledger, wizard, and series shell contracts.
No new story-generation architecture is needed.

## Decisions

1. Create a lightweight Series shell with `status=planning` at the first New
   action; do not introduce a second workspace identity/table.
2. Use `/drama-series/:seriesId?tab=planning&edit=1` and add page presentation to
   the existing wizard rather than fork its form logic.
3. Promote the selected Draft/QC into the existing shell in-place, guarded by
   owner checks and an active-plan revision.
4. Keep `vertical_drama_draft_ledgers` and immutable versions as history/job
   recovery. The default payload exposes only active snapshot and live status;
   explicit history is paginated/lazy.
5. Add `Planning` as the summary/navigation tab; existing editors remain
   canonical. Preserve the modal as a compatibility fallback during rollout.

## Review rounds

- Round 1: checked route ordering, modal compatibility, and draft commit boundary.
- Round 2: checked tenant ownership, bounded snapshots, and optimistic updates.
- Round 3: checked source/QC recovery and generated-ledger coexistence.
- Round 4: checked responsive/accessibility surface and URL deep links.
- Round 5: checked tests, migration impact, and unrelated dirty-worktree safety.
