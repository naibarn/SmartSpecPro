# TDD guidance

## Test-first order

1. Shared profile/snapshot schema tests: valid profile, profile-only approved
   snapshot, legacy DNA snapshot, and rejection when both are absent.
2. Adapter normalization tests: Thai series DNA, lead/support/elder/child role
   mapping, explicit region, age/timeline conflict, twin/reference facts,
   target-model inline negative behavior, and requested deliverable context.
3. Adapter execution tests: one LLM call, new skill body loaded, profile output
   validation, bounded retry, credit settlement slug/metadata, and no fallback
   prompt synthesis.
4. Router tests: portrait preview/direct portrait, approved-prompt no-call path,
   turnaround sheet, named sheet, stale snapshot, and persistence warning.
5. Client type/smoke tests only if the response contract changes; verify absent
   optional fields are not rendered as empty prompt content.

## Expected initial failures

- The new profile schema will not yet be accepted by the approved snapshot.
- Router mocks will still provide the legacy result shape and will fail until
  the adapter result is wired.
- Skill-content tests will fail until the deliverable rule is added.

## Verification commands

- Focused Vitest files for the adapter, shared profile contract, and character
  router.
- `python apps/web/skills/character-prompt-skill/scripts/audit_skill.py`
- `git diff --check`
- Targeted TypeScript/esbuild parsing for touched server/shared/client modules.

Do not run a full production build, restart services, mutate the database, or
submit image-generation tasks as part of this feature verification.
