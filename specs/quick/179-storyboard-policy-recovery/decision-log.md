# Decision Log

- Depth: standard. The change is bounded but crosses generator behavior, async artifact persistence, and tests.
- Use a story-bearing safety projection to avoid metadata and duplicated-handoff false positives.
- Use three candidate-aware policy repair attempts after the initial candidate.
- Preserve the final rejected candidate only as a run artifact; never publish it as the episode storyboard.
- Keep existing provider/schema retry behavior separate.
- Keep existing credit timing: deduct only after safety acceptance.

## Self-review rounds

1. Coverage: added async artifact preservation to avoid candidate loss. `[AUTO-FIX]`
2. Contradictions: clarified that three policy repairs are separate from schema retries. `[AUTO-FIX]`
3. Security: confirmed safety remains fail-closed and unsafe content is not published. Clean.
4. Integration: confirmed no schema or public API change is required. Clean.
5. Completeness: added explicit credit and oversized-handoff regressions. Clean.
6. Consecutive clean review: no further meaningful changes.
