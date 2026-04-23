# section-03-node-registry-compatibility

## Scope

Update Node-side skill resolution, registry behavior, compatibility gates, and router exposure so native bundles become visible and manageable without breaking legacy skills.

## What this section must cover

- Make `skillFiles.ts` understand native bundle layouts while keeping current manifest resolution behavior.
- Promote native-bundle metadata in `skillRegistry.ts`.
- Extend `skillCompatibilityGate.ts` to snapshot the native bundle surface.
- Extend `skillMaintenanceAnalyzer.ts` to rank missing native bundle files and migration priority.
- Update `skills.ts` router responses so callers can inspect native-bundle readiness and migration state.

## Plan constraints

- Do not rewrite unrelated skill APIs.
- Preserve backward compatibility for legacy skill manifests during migration.
- Avoid inventing a new registry store; reuse existing DB and folder sync mechanisms.

## Tests to write before implementation

- native bundle layouts resolve correctly.
- legacy `skill.md` / `SKILL.md` behavior still works.
- compatibility snapshots include native bundle files.
- maintenance analysis ranks missing run/verify/lock files as higher priority.
- router output exposes native-bundle compatibility fields.

## Dependencies

This section depends on the native bundle contract from section 01 and the runtime semantics from section 02.
