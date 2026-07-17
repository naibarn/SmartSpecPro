# Section 05 — Runtime and Skill-Only Prompt Ownership

## Goal

Ensure the exact canonical role and structured request reach the skill and the skill alone
authors the final provider prompt.

## Ownership

- `verticalDramaCharacterImageGeneration.ts` loader, normalizer, semantic validator,
  role-first resolver, retry, model-family floor, and provenance.
- `verticalDramaCharacters.ts` preview/direct/approved generation branches.
- Focused runtime/router tests and existing comparison-evidence normalization tests.

## Behavior

Load `prompts/system.prompt.md`, canonical `skill.md`, and selected references in a stable
order. Pass authoritative `target_character` with canonical role/tier and V2 generation,
reference, DNA, series, cast, and archive context. Normalize server-owned comparison facts
before creative validation.

On semantic violations, retry the same skill with compact violation codes at most twice.
The retry replaces the whole structured output. Do not append creative prose, marker blocks,
or `buildCharacterRenderPrompt` output. Preview prompt must equal provider prompt in direct
and approved branches. Model fallback must pass the same gates before provider charge.

## TDD stubs

- System/core/reference load order and missing-file failure.
- Canonical role survives into skill input; legacy fallback is provisional.
- Server-owned evidence normalization remains deterministic.
- Skill retry uses violation codes, cap, and explicit final failure.
- Preview/provider prompt equality.
- No marker constants or external creative suffix in final payload.
- Empty custom instruction preserves skill output.
- Model-family floor prevents unsupported paid generation.

## Completion proof

Run character image-generation service/router suites, prompt-QC tests, and a trace-level
assertion that the provider receives only the skill-authored prompt.
