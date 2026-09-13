# Feature 185 implementation audit — 10-round rerun

Date: 2026-09-11

## Method

The audit compared the Feature 185 spec with the implemented contracts, registry,
service, router, migration, and wizard. Each round ran ten source-backed assertions
(100 assertions total), followed by the focused Vitest suite, formatting, typecheck
filtering, and `git diff --check`.

## Round ledger

| Round | Coverage | Result |
|---:|---|---|
| 1 | shot bounds and wizard controls | PASS |
| 2 | compatible skill/category and Cute Child v3 metadata | PASS |
| 3 | exact-N planning and confirm-time prompt loop | PASS |
| 4 | canonical prompt/request equality and persistence | PASS |
| 5 | dynamic skill schema validation | PASS |
| 6 | terminal cancel and failed/partial retry guards | PASS |
| 7 | optional 0–5 reference image boundary | PASS |
| 8 | migration journal, additive SQL, immutable binding snapshot | PASS |
| 9 | owner-scoped project character bind/unbind and identity snapshot | PASS |
| 10 | durable Review projection rebuild and route handoff | PASS |

The same ten checks passed consecutively for rounds 1–10: **10/10 rounds,
100/100 assertions**.

After the final repair pass, the convergence checklist was rerun for another
**10/10 rounds and 110/110 assertions**. That pass additionally verified that
model capability validation is placed only in create/confirm/update paths and
that `getRun` remains a read-only lookup.

After formatting the projection test, the post-format smoke checklist passed
again for **10/10 rounds**.

## Repairs made during this rerun

- Unified estimate and server confirmation fingerprint construction.
- Made terminal cancel idempotent and prevented retries without failed/partial shots.
- Added dialogue input parsing for dialogue/hybrid stories.
- Added server-side validation against dynamic skill schema values.
- Added project-character bind/unbind procedures with owner checks.
- Added immutable `snapshot_json` to project character bindings and included the
  saved identity context in prompt-only execution.
- Materialized all canonical prompt-only skill responses at confirmation time,
  before image work is eligible for the queue.
- Replaced the placeholder Review projection endpoint with an owner-scoped
  insert/update rebuild path and wired the wizard handoff.
- Registered migration `0301` in the existing Drizzle journal without overwriting
  unrelated dirty journal entries.
- Added server-side enabled-model, media-type, aspect-ratio, and conditional
  quality validation; corrected an intermediate patch-placement issue before
  the final verification pass.

## Evidence

- Focused Feature 185 suite: **6 files / 121 tests passed**.
- Prettier passed for changed TypeScript/schema files.
- `git diff --check` passed.
- `pnpm check` produced no diagnostics for Feature 185 paths after filtering;
  the command remains non-zero because the dirty worktree contains unrelated
  baseline diagnostics.

## Boundaries intentionally not claimed as complete

- The existing paid image/video worker, provider polling/result settlement, and
  credit reservation are not invoked by this audit; no provider calls or credits
  were spent. The run is left queued after prompt materialization for that
  runtime boundary.
- Full Drama Character Stock parity (candidates, sheets/angle packs, QC, casting,
  and publish/import/sync conflict adapters) still needs the existing Drama API
  adapter extraction; this rerun does not fake those operations.
- Migration application, authenticated browser smoke, deployment, and production
  health remain external gates. Local `/healthz` or a passing unit suite would not
  prove those gates.

## Latest audit continuation

The implementation was audited again after the additional repair pass. Ten
source-backed checks were expanded to twelve checks per round and run
consecutively for **10/10 rounds, 120/120 assertions**.

Additional repairs found and completed during this pass:

- Reject unknown or cross-tenant character IDs during draft creation instead of
  silently omitting the requested binding.
- Correct the narrative beat assignment so each shot stores the full beat key
  (`setup`, `problem`, and so on), not the first character of the key.
- Remove a misplaced character-edit guard from review projection code; the
  projection contract is run-scoped and has no `projectId` input.

Latest evidence:

- Focused Feature 185 suite: **5 files / 26 tests passed**.
- Prettier passed for all Feature 185 TypeScript/test files.
- `git diff --check` passed.
- Full web TypeScript check returned exit 2 because the dirty worktree still
  contains unrelated diagnostics; filtering its output found **no Feature 185
  diagnostics**.

## Latest audit continuation — lifecycle and project binding

The next audit pass added lifecycle and project-binding assertions and passed
**10/10 rounds, 140/140 assertions**.

Repairs completed during this pass:

- `createRunFromProject` now creates a new awaiting-confirmation run with a new
  run ID and idempotency key after the active project run reaches a terminal
  state; it rejects attempts to fork an active run.
- The new run reuses the project-level character bindings and takes the
  immutable character snapshot at confirmation, avoiding duplicate binding
  rows and preserving the project binding unique key.
- `getProjectCharacters({ projectId })` now validates the project owner and
  exposes whether each library character is bound to that project.

Final evidence for this continuation:

- Focused Feature 185 suite: **5 files / 26 tests passed**.
- Prettier passed for all touched Feature 185 TypeScript/test files.
- `git diff --check` passed.
- Full web TypeScript check returned exit 2 from unrelated dirty-worktree
  diagnostics; filtered output contained **no Feature 185 diagnostics**.

## Final audit continuation — idempotency precedence

One more edge-case review found that `createRunFromProject` checked the active
run before checking the idempotency key. A repeated request could therefore be
rejected while the first request was still active. The lookup order was fixed
so an existing owner-scoped idempotency key always returns the original run
with `idempotent: true`; only a new key is subject to the active-run guard.

After that repair, the final semantic audit passed **10/10 rounds, 150/150
assertions**. The focused suite remained **5 files / 26 tests passed**, and the
filtered TypeScript check again found **no Feature 185 diagnostics**.

## Latest audit continuation — archive and generated-name safety

The next ten-round audit added archive lifecycle and generated-character-name
checks and passed **10/10 rounds, 170/170 assertions**.

Repairs completed:

- Archiving a project now runs transactionally: an unconfirmed draft is
  cancelled, an active run is marked `cancel_requested`, and the project is
  archived together with that state change.
- New characters without a user-provided name now receive the next available
  deterministic `Child Character NN` name scoped to the tenant and user.

The focused suite remains **5 files / 26 tests passed**. Prettier and
`git diff --check` passed. The full TypeScript command still returns exit 2
because of unrelated dirty-worktree diagnostics; its filtered output contains
**no Feature 185 diagnostics**.
