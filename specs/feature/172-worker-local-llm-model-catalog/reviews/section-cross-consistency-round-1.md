# Section cross-consistency review — round 1

## Result

PASS. The six sections form a coherent dependency chain:

`shared contracts -> projection/ACL -> actor catalog/routing -> Worker runtime -> UI -> lifecycle`

## Interface checks

- Section 01 owns shared schemas and `llm:inventory`; Sections 02–04 consume them.
- Section 02 owns the projection and opaque `modelRef` mapping; Section 03 never derives refs
  from display names and Section 04 resolves the mapping locally.
- Section 03 creates only canonical `llm_invoke` jobs; Section 04 consumes that type while
  preserving legacy `local_ai_task` handling.
- Section 05 consumes actor-aware catalog rows and renders the status/privacy states defined by
  Sections 02–04; it does not own authorization or routing.
- Section 06 owns reservation/reconciliation, cancellation/revocation, retention, rollout, and
  rollback gates without changing the protocol ownership in earlier sections.
- Existing device-local Local AI files are protected from all new Worker catalog changes.

## Remaining implementation watchpoints

1. Preserve unrelated dirty changes in shared files when applying patches.
2. Use atomic database uniqueness for assignment-scoped events rather than the existing
   read-then-insert generic event path.
3. Do not claim full typecheck, build, browser, live-provider, or service verification because
   those are explicitly out of scope for this run.
