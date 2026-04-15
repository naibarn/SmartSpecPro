# Section 04: Task Specialization and Work Dispatch

## Scope

Own the named Hermes work modes and specialization packs that sit on top of the existing capability model.

## Goals

- make common work types easier to choose
- map specializations to allowed capability profiles
- preserve generic fallback behavior
- keep the runtime flexible across multiple task types

## Target files and modules

- `apps/web/server/services/workerSchedulerService.ts`
- `apps/web/server/services/workerDelegationService.ts`
- `apps/web/shared/workerRuntime.ts`
- `apps/web/client/src/pages/Teams.tsx`

## Implementation notes

- express modes as additive task profiles, not separate runtimes
- treat each mode as a preset over existing scope profiles and route families
- reuse the current route-family and scope-profile approach
- keep unsupported tasks fail-closed
- avoid narrowing Hermes to one specialized job
- preserve a generic fallback when a mode is missing or unsupported

## Tests

- each specialization maps to an allowed capability profile
- unsupported task types fail closed
- generic fallback remains available
