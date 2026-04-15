# Section 01: Persona, Profile, and Selection

## Scope

Own the user-facing model for Hermes personas and profile selection.

## Goals

- surface Hermes profiles as understandable personas or working identities
- keep persona selection optional
- preserve the generic Hermes runtime path
- make selection readable in Teams and any Hermes management surface

## Target files and modules

- `apps/web/shared/workerRuntime.ts`
- `apps/web/server/services/workerRegistryService.ts`
- `apps/web/client/src/pages/Teams.tsx`
- `apps/web/client/src/pages/AdminMonitoring.tsx`

## Implementation notes

- treat persona metadata as additive runtime metadata
- reuse existing worker and team records instead of inventing a new agent entity
- show a persona label, a short description, and the current active profile
- ensure missing persona data fails closed to generic Hermes behavior
- keep persona selection optional so the generic Hermes path always remains available

## Tests

- profile metadata is displayed when present
- missing profile metadata does not break registration or binding
- generic Hermes behavior remains available when no persona is selected

## Implementation notes

Implemented persona/profile summary support by:

- extending `apps/web/shared/workerRuntime.ts` with optional `profileLabel` and `profilePurpose` fields on Hermes runtime metadata
- adding `summarizeHermesRuntimePersona(...)` so UI surfaces can show a safe generic fallback when metadata is missing
- threading persona summary fields through `apps/web/server/services/teamService.ts` and `apps/web/server/services/workerFleetService.ts`
- showing persona labels and descriptions in `apps/web/client/src/pages/Teams.tsx` and `apps/web/client/src/pages/AdminMonitoring.tsx`
- updating tests in:
  - `apps/web/shared/__tests__/workerRuntime.test.ts`
  - `apps/web/server/services/__tests__/teamService.test.ts`
  - `apps/web/server/services/__tests__/workerRegistryService.test.ts`
  - `apps/web/server/services/__tests__/workerFleetService.test.ts`
  - `apps/web/client/src/pages/__tests__/Teams.test.tsx`

Legacy Hermes workers still fall back to generic display text when persona metadata is absent or invalid.
