# Review findings

## Round 1

- Material finding: Enhanced timeline contradicts its own correct dialogue-lock block because actions are paired to dialogue by array index.
- Material finding: Thai mouth-motion actions survive cleanup and become duplicate speaking cues.
- No implementation applied because the user requested comparison/diagnosis.

## Round 2

- Additional finding: persisted Enhanced Grok prompts exceed the 4,096-character provider budget and are semantically rewritten before paid submission; protected fragments preserve line text, not speaker-action ownership.
- Existing tests prove names/positions are present but do not test that every timeline action belongs to its bound speaker.
- Convergence: two evidence reviews agree on the same compiler/validator failure; provider-specific sensitivity is explicitly left as an inference.

## Approved design review round 1

- Finding fixed in spec: model-family limits must be hard ceilings; stale generic catalog values must not lower Omni incorrectly or raise Grok.
- Finding fixed in spec: resolved prompt budget must enter Enhanced skill input and fingerprint.

## Approved design review round 2

- Finding fixed in spec: rejecting every over-budget Enhanced prompt would make Grok unusable; deterministic protected-core compaction is required before persistence.
- No unresolved design ambiguity for the five named model families. The user's trailing “และ” is treated as punctuation unless another model is supplied later.

## Implementation review round 1

- Fixed the root action/dialogue index coupling and duplicate listener aliasing.
- Added deterministic compaction with JavaScript-compatible character counting and protected-dialogue failure.
- Added a second semantic guard at the TypeScript bridge boundary, including a regression for fully swapped lines.

## Implementation review round 2

- Found one integration mismatch during self-review: pipeline catalog models expose `id`, not `modelId`; corrected before final verification.
- Security review: no new endpoint, auth flow, secret handling, database mutation or provider call. Untrusted action prose is reduced to non-speech motion and terminal output fails closed on semantic drift.
- Convergence: no remaining must-fix finding in the approved scope.
