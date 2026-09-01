# Implementation plan

## Objective

Make scene-slot identity consistent across normal and Special Tie-in flows and stop label variations from silently creating another scene.

## Files and changes

1. Shared location identity helper: strengthen Unicode/punctuation normalization and add deterministic bounded near-match candidate scoring.
2. Special reference service: add series-scoped scene lookup and a safe resolve operation for reuse/create decisions; make special slot provisioning reuse exact normalized names.
3. Marketplace idea service/router: return near-match scene candidates during idea selection and add an ownership-checked resolve procedure for the user's choice.
4. Special Tie-in contract/worker: persist and consume the chosen canonical scene key before reference-derived or auto-created scene resolution.
5. Special Tie-in dialog: show candidates, require a reuse/create choice, load scene options for product tie-ins, and persist the selected key.
6. Tests: shared scoring, special reference resolution, marketplace selection response, input propagation, and UI action state.

## Non-goals

- No automatic fuzzy merge.
- No deletion or in-place merge of existing location rows.
- No change to paid billing or provider submission.

## Acceptance and verification

- Focused server/shared/UI suites pass.
- `git diff --check` passes for owned files.
- Full typecheck is attempted only as a bounded warning gate because the worktree has a large unrelated dirty baseline.
