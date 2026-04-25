# Section 02: ISC Create, Improve, and Migration

## Goal

Make the Intelligence Skill Creator able to create, improve, and migrate subagent-aware bundles in a way that matches the runtime contract from Section 01.

## Scope

This section covers:

- create flow support for subagent-aware bundles
- improve flow support for legacy skill upgrades into subagent-aware bundles
- migration from single-agent bundles to subagent-aware bundles
- schema/UI updates for the new authoring inputs
- compatibility mirror generation and preservation

## Files to touch

- `apps/web/skills/intelligence-skill-creator/python/skill.py`
- `apps/web/skills/intelligence-skill-creator/isc/creator.py`
- `apps/web/skills/intelligence-skill-creator/isc/cli.py`
- `apps/web/skills/intelligence-skill-creator/schemas/input.schema.json`
- `apps/web/skills/intelligence-skill-creator/schemas/ui.schema.json`
- `apps/web/skills/intelligence-skill-creator/skill.md`
- `apps/web/skills/intelligence-skill-creator/SKILL.md`

## Implementation notes

- Extend the create path so it can scaffold an orchestrator plus specialist subagents when the requested skill clearly benefits from delegation.
- Extend the improve path so it upgrades legacy workflows toward subagent awareness only when the improvement is materially useful.
- Preserve existing slugs, public inputs, and compatibility mirrors unless the user explicitly requests a breaking change.
- Use the same native bundle generation logic for create, improve, and migration paths so the emitted bundle structure stays consistent.
- Add authoring fields for target platform and improvement intent so the UI can make subagent-aware decisions explicitly rather than guessing from prose.
- Keep deterministic wrapper scripts and verification behavior intact during migration.
- Reuse the bundle contract and scaffold helpers from Section 01 instead of duplicating manifest validation logic in the authoring flow.

## Acceptance criteria

- ISC can generate a valid subagent-aware bundle without manual edits.
- ISC can improve a legacy skill into a subagent-aware bundle only when requested or justified.
- The compatibility mirror remains intact during migration.
- The emitted bundle satisfies the manifest and validation rules from Section 01.

## Test-first guidance

- Write tests for create, improve, and migration outputs before changing runtime code.
- Cover the cases where subagents are requested, not requested, and not justified.
