<!-- PROJECT_CONFIG
runtime: typescript-pnpm
test_command: pnpm --dir apps/web exec vitest run server/services/__tests__/taskObservabilityReadModel.test.ts
END_PROJECT_CONFIG -->
<!-- SECTION_MANIFEST
section-01-work-profiles
section-02-event-projection
section-03-unified-experience
section-04-skill-invocation
section-05-skill-authoring
section-06-delegation-controls
section-07-artifact-evidence
section-08-development-source-release
section-09-cross-boundary-acceptance
END_MANIFEST -->

# UWAC implementation sections

Planning complete; runtime implementation has not started. This task is documentation only. Each future section must refresh canonical source and assign exact file ownership before work.

| Section | WP | Priority | Owner | Dependencies |
|---|---|---|---|
| [01 work-profiles](section-01-work-profiles.md) | WP31 | P0 | 196/269 | G0 source/identity audit; existing context/job owners agree metadata compatibility |
| [02 event-projection](section-02-event-projection.md) | WP32 | P0 | 294 plus 200/205/206 producers | WP31 metadata/event boundary agreed; can progress in parallel on independent reducer fixtures |
| [03 unified-experience](section-03-unified-experience.md) | WP33 | P1 | 198/277/287 | WP31/32 stable consumer contracts; preserve existing UI capabilities |
| [04 skill-invocation](section-04-skill-invocation.md) | WP34 | P0 | 256 plus 198 consumers | WP31 and 256 documented identity; WP32 event envelope |
| [05 skill-authoring](section-05-skill-authoring.md) | WP35 | P1 | 221 plus 198 proposal entry | WP31/34 versioned handoff; existing artifact/registry authority |
| [06 delegation-controls](section-06-delegation-controls.md) | WP36 | P0 | 196/269/279 with 200/205/206 adapters | WP31/32/34 contracts; exact current command/permission/economic owners |
| [07 artifact-evidence](section-07-artifact-evidence.md) | WP37 | P1 | 269/294 consumers; existing Library/R2/domain owners | WP31 source/deliverable types and WP32 evidence envelope |
| [08 development-source-release](section-08-development-source-release.md) | WP38 | P0 | 218/224/293/295 | WP31/32 conditional bindings; current SPEC224 live work and source policies preserved |
| [09 cross-boundary-acceptance](section-09-cross-boundary-acceptance.md) | WP39 | P1 | 287 with all evidence owners | WP31–38 independently integrated; current authorized test environments |
