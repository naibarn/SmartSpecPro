# Special tie-in dialogue continuity implementation

## Classification

- scope: medium/high
- risk: high because the task changes generation gates, advertising safety, and repairs persisted JSONB data
- route: direct-standard-light; no sub-agents because SocratiCode tools are unavailable and overlapping dirty worktree files require one writer
- socraticode: unavailable; bounded shell and read-only PostgreSQL evidence used

## Evidence ledger

- source: database rows and focused tests
- identifier: episodes 289/290, series 53; `vertical_drama_episodes` and `vertical_drama_special_tie_in_debug_events`
- observed failure: episode 289 has canonical dialogue markers for 9 shots but current generated clips have empty `dialogue`; episode 290 is persisted as `dialogueMode=none` with no dialogue
- data state: special rows have no normal `script` or `dialogueAudioPlan`; per-shot resolver receives `script=null` for special episodes
- confidence: high

## Scope

1. Add structured nine-shot dialogue to marketplace idea output and UI review.
2. Add adult-only speaker and Thai advertising-compliance validators.
3. Persist special dialogue through the normal dialogue/audio and clip contracts.
4. Resolve special dialogue before normal fallbacks and fail closed on missing speaking dialogue.
5. Add deterministic legacy silent/rehydration repair tooling and audit the local database before applying it.

## Dirty worktree discipline

Existing Worker App and `apps/web/server/_core/index.ts` edits are unrelated and must remain untouched. Intended Web edit paths are limited to shared vertical-drama/marketplace contracts, special dialog, special adapters/services, the episode router, focused tests, docs, and this orchestration directory.

## Sequential waves

- Wave 1: tests/contracts/policy helpers and marketplace idea shape.
- Wave 2: special persistence and per-shot resolver wiring.
- Wave 3: UI nine-shot review and adult-speaker gate.
- Wave 4: deterministic legacy audit/repair script, only after fresh code gates pass.
- Wave 5: focused verification, diff review, and database post-repair audit.

## Quality gates

- focused shared/server/client Vitest suites
- no paid provider call during tests or repair
- `git diff --check`
- scoped TypeScript/test command; avoid full workspace check if memory pressure recurs
- pre/post read-only DB audit for special rows
