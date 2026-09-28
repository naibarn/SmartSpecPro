# Section 01 — Safety Decision Contract

## Goal

Make policy analysis advisory-only during video-prompt authoring while retaining
structured findings and preserving all non-policy hard failures.

## Files

- `apps/web/server/services/verticalDramaStorySafety.ts`
- `apps/web/server/services/verticalDramaVideoMotionPromptGeneration.ts`
- adjacent safety and motion-generation tests

## Implementation

Remove policy-only `VerticalDramaStorySafetyError` throws from whole-pack,
single-shot, and speaker-switch generation. Keep input analysis for warning
telemetry and run output analysis without blocking the generated prompt. If the
result type is extended, use optional warning fields that are backward-compatible
with existing consumers.

Do not weaken operational validation, vision assurance, prompt schema parsing,
prompt length checks, credit checks, or persistence ordering. Keep the analyzer's
real-risk findings available to callers. Ensure `restrained tension` is covered as
an advisory false-positive fixture without globally accepting physical restraint.

## TDD

- Exact episode-232 prompt returns a usable result and no policy exception.
- Real threat/coercion fixtures still produce findings, but not a video-authoring
  exception.
- Whole-pack, single-shot, and speaker-switch paths all preserve valid outputs.
- Operational and schema errors remain hard failures.

## Acceptance

No policy analyzer result can make a video-prompt authoring call fail. The prompt
continues to the existing persistence/billing caller.
