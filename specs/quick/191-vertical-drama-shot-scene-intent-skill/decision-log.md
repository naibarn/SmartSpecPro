# Decision Log

## Depth

`standard` quick plan. The change crosses one new skill bundle, one service
contract, the storyboard pipeline, and focused tests, but does not require schema
or UI changes.

## Key decisions

1. Use a post-storyboard semantic pass rather than relying on more prose in the
   existing shotgrid prompt. This sees the actual shot text and can canonicalize
   the exact output consumed downstream.
2. Persist derived `scene_intent` inside the existing storyboard JSON rather than
   adding a parallel status/table source of truth.
3. Apply only validated roster keys. Unknown or overlapping role assignments are
   review failures, not fallback guesses.
4. Reuse existing `screen_caller_refs` and `dual_view` fields so start-frame and
   video paths receive the correction without a second identity system.
5. Invoke the pass directly only in the real storyboard path; keep dry-run and
   plan-only unchanged. A rollout flag can be introduced later if canary
   evidence requires a reversible gate.
