# Section 04: Gemini Omni Skill Packages

## Goal

Add skill packages that understand Gemini Omni’s asset-aware video planning and QA requirements.

## What This Section Must Change

Create:

- `apps/web/skills/gemini-omni-video-director`
- `apps/web/skills/gemini-omni-prompt-qa`
- `apps/web/skills/gemini-omni-video-quality-qa`

Each package must include:

- `SKILL.md`
- `skill.md`
- `schemas/input.schema.json`
- `schemas/output.schema.json`
- `schemas/ui.schema.json`
- `references`
- fixtures/examples
- `scripts/verify.sh`
- registration/sync metadata compatible with the existing app skill catalog
- versioned contract fixtures and snapshot tests for required output fields

## Director Contract

Must support:

- single-shot one video
- multi-shot prompt for one generated video
- storyboard multi-video plan
- per-clip shot lists
- asset usage plan
- quota-aware reference summary
- machine-readable Media Studio handoff with duration, resolution, prompt per clip, and retry/QA hints

## QA Contract

Prompt QA should evaluate:

- provider compatibility
- shot completeness
- asset references
- quota risk
- continuity
- prompt clarity

Video QA should evaluate:

- generated result vs prompt package
- asset fidelity
- continuity
- audio/voice use
- regenerate or revise recommendation

## Tests

- JSON schemas validate representative fixtures
- verification scripts pass
- skill metadata is loadable by existing skill system
- skills can be discovered/selected by stable slug/ID in Media Studio
- issue taxonomy is stable enough for learning recommendations
- contract snapshot fails if learning edits remove required Director/QA handoff fields

## Completion Criteria

- Media Studio can select/use these skills without relying on the generic video prompt skill.
- Skill outputs are structured enough that Media Studio does not need to parse free-form prose.
