# Vertical Drama Episode Numbering Design

## Context and observed root cause

`vertical_drama_episodes.episodeNumber` is an integer with one unique key per
tenant and series. Normal episode creation and special Tie-in creation both
previously used the maximum number across all episode kinds. The local database
for series 53 confirms the result: normal episodes occupy 1 through 50 and the
existing Tie-in episode occupies number 51 while its display sequence is
`SPECIAL 04`.

## Decision

Keep `episodeNumber` numeric. Introducing values such as `S01` would require a
wide contract and ordering migration because prompts, continuation, memory,
file labels, and UI types all currently perform numeric arithmetic and sorting.

- Normal episodes continue from the highest **normal** episode number only.
- Special Tie-in episodes allocate from numeric range 501 upward.
- Both allocators skip every number already used by either kind, so the current
  unique database constraint remains the final concurrency guard.
- `specialSequence` remains the user-facing `SPECIAL 01`, `SPECIAL 02`, ...
  label and is independent from the numeric ordering namespace.
- Legacy special rows that consumed a normal number are repaired by the
  idempotent transactional `manual_vertical_drama_episode_numbering.sql` data
  migration. It changes only the numeric episode label of special rows; normal
  rows, `specialSequence`, and episode IDs remain unchanged.

## Implementation boundary

Add a pure shared allocator with explicit normal/special rules. Reuse it in:

1. the normal `createEpisode` and `generateNextEpisodes` paths;
2. the special Tie-in allocator;
3. series list aggregates and extension summaries that count/report normal
   episodes only, so a Tie-in cannot make the UI suggest the wrong next number.

The normal flow remains otherwise unchanged: its plan/LLM continuity still
uses normal episodes, while the persisted number is the number returned by the
same race-safe insert helper.

## Failure and concurrency behavior

The existing unique index on `(tenantId, seriesId, episodeNumber)` remains in
place. Allocators choose a free candidate from the current rows; if concurrent
requests race, the existing retry loops re-read state and retry the insert.
The schema needs no migration. A one-time transactional data migration is
required for legacy special rows so the next normal episode can use the true
next normal number without being blocked by an old Tie-in number.

## Verification

Pure tests cover normal continuation after a Tie-in, special allocation from
501, occupied-number skipping, and legacy rows without an explicit kind. A
read-only database query verifies the observed series 53 state. Focused web
tests are run; the repository-wide RAM-heavy `apps/web` check is intentionally
not run.

## Out of scope

This change does not change story generation, storyboard composition, media
rendering, special sequence labels, or existing normal episode numbers.
