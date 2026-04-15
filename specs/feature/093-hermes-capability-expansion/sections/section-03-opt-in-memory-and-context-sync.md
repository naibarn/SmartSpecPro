# Section 03: Opt-In Memory and Context Sync

## Scope

Own the consented memory and context sync model for Hermes.

## Goals

- add opt-in memory or context sync
- support explicit scope selection
- preserve tenant and user boundaries
- keep Hermes usable when sync is disabled

## Target files and modules

- `apps/web/server/services/memoryService.ts`
- `apps/web/server/services/scopedMemoryService.ts`
- `apps/web/server/services/memoryArchiveService.ts`
- `apps/web/server/services/teamService.ts`
- `apps/web/client/src/pages/Teams.tsx`

## Implementation notes

- sync must be explicit and scope-limited
- personal persona-scoped sync can be enabled by the user, but team-shared or workspace-shared sync requires tenant approval
- use existing memory services where possible
- keep provenance and disablement reversible
- revoke must stop future sync immediately and remove the synced context from active use
- do not auto-import upstream Hermes memories or profiles

## Tests

- sync cannot activate without explicit opt-in
- sync is limited to the selected scope
- disabling sync leaves Hermes functional
- shared scopes cannot activate without tenant approval
- revoked sync scopes stop affecting active runs immediately
