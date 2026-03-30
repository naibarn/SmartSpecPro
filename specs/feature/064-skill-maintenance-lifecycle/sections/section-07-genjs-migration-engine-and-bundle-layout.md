# Section 07: GenJS Migration Engine and Bundle Layout

## Goal

Implement the governed `migrate-to-genjs` path for suitable skills.

## Files to Create

- `apps/web/server/services/skillGenjsMigration.ts`
- `apps/web/server/services/__tests__/skillGenjsMigration.test.ts`

## Files to Modify

- `apps/web/server/services/skillExecutor.ts`
- `apps/web/server/services/skillFiles.ts`
- `apps/web/skills/intelligence-skill-creator/*`

## TDD - Tests to Write First

- analyzer marks strong GenJS candidates correctly
- migration preview returns bundle file inventory
- generated migration includes manifest, package, src entrypoint, helper modules, and fixtures
- sandbox smoke metadata is generated for migrated bundle skills
- migration is blocked if compatibility gate fails

## Implementation Guidance

1. Use ISC's GenJS scaffolding as the canonical bundle format.
2. Migration output should provision:
   - `skill.manifest.json`
   - `package.json`
   - `src/index.mjs`
   - modular helper files
   - example input
   - fixture tests
3. Add runtime/tooling verification for:
   - Node support in sandbox profile
   - dependency install expectations
   - network/browser requirements where relevant

## Compatibility Constraints

- migration must preserve the caller-facing contract unless an explicit breaking upgrade path is approved
