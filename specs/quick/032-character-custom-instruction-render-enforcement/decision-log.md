# Decision Log

- Depth: `standard` with two sequential sections; the task crosses skill contract and router submission but needs no schema or API migration.
- Use one pure, exported, idempotent prompt builder as the single enforcement boundary.
- Encode the user brief with `JSON.stringify`, place it inside stable owned markers, and replace an existing owned block instead of duplicating it.
- Apply the builder to preview output and immediately before provider submission; provider submission remains the final invariant.
- An absent brief does not remove an already approved prompt's block and otherwise leaves the prompt byte-identical.
- Keep raw user text out of instruction prose except as the JSON-encoded data value.

## Self-review

1. Coverage review: added direct, preview, approved and no-op paths. `[AUTO-FIX]` clarified final provider invariant.
2. Contradiction review: resolved absent brief versus approved prompt by preserving an existing block. `[AUTO-FIX]` recorded replacement semantics.
3. Security review: marker termination risk addressed by JSON encoding and owned block replacement. `[AUTO-FIX]` no raw delimiter interpolation.
4. Integration review: no API shape change; legacy `portraitPrompt` remains the transport field. No meaningful fixes.
5. Test/obvious-gap review: require exact final `generateImageAsync.prompt`, idempotence and changed-brief replacement. No meaningful fixes; second consecutive clean review after cross-section review.
