# Section 03 — Video Prompt and Reference Attachment

## Ownership boundary

Own speaker-to-side cut planning, labeled image inputs, consolidated barrier prompt facts, render attachment priority/capability gate, and clip provenance. Do not redesign global storyboard shot counts.

## Target areas

- `verticalDramaVideoMotionPromptGeneration.ts`
- `verticalDramaEpisodes.ts` video prompt/render paths
- `subShots.ts` or a focused barrier cut helper
- video prompt contracts and skills
- server tests

## TDD expectations

Test a two-speaker Irin/Krit dialogue with alternating cuts, an unmapped speaker, a single-reference provider, and a tight reference-image cap.

## Acceptance

- Prompt sees `VIEW_START_INSIDE` and `VIEW_REFERENCE_OUTSIDE` labels.
- Every dialogue window maps to a side and view role.
- Render ordering preserves both primary views or fails before paid work.
- Non-barrier shots and phone Caller paths remain byte-compatible.

## Risks

Do not assume a provider will infer hard cuts from two images. The prompt must contain timed cuts, and unsupported capability must not silently fall back to a one-image render.
