# Interview Transcript

## Q1. Should ordinary approved image scenes be allowed to generate video prompts while genuine risk remains blocked?

Yes. If the image generation passed policy, video prompt creation must not be
blocked in this way. At most, show a warning. Genuine unsafe behavior should
still be handled as a warning at video-prompt authoring time, not a hard block;
operational failures remain hard failures.

## Auto-Decisions

- Treat the approved start-frame/image-safety result as authoritative for the
  video-prompt authoring boundary.
- Make the existing video story-safety analyzer warning-only; do not delete its
  telemetry or real-risk classification.
- Keep provider policy enforcement at actual video render time as a separate
  boundary, while preserving the already-created prompt when render fails.
- Avoid a database migration unless the existing JSON contract cannot carry the
  warning fields; prefer additive optional fields and existing audit structures.
- Preserve all unrelated dirty-worktree changes and stage only owned files.
