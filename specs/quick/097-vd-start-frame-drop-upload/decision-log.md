# Decision Log

## Planning depth

- depth: standard
- reason: The change is small but crosses three client files and an asynchronous
  upload/resolve/link contract, so two execution sections are safer than a micro plan.
- promotion: not required; there is no schema, backend endpoint, auth, or provider change.

## Decisions

1. Use a discriminated `VerticalDramaStartFrameDropInput` contract instead of overloading
   a string with both durable URLs and base64 data.
2. Keep browser file reading and drop validation in the storyboard panel.
3. Keep upload, media-asset resolution, and Start Frame persistence in the episode page.
4. Make `onDropStartFrame` return `Promise<void>` and await it in the panel.
5. Treat inline `data:` URLs as upload inputs, never as durable remote URLs.
6. Add a dedicated test file rather than modifying unrelated dirty test files.

## Risks that could trigger promotion

None expected. Promote only if implementation proves a server API or storage contract
must change.

## Review rounds

- Round 1: verified requirement and approved-design coverage; no scope expansion.
- Round 2: added inline `data:` URL normalization to prevent the same durability bug.
- Round 3: confirmed the workspace prop boundary is included.
- Round 4: confirmed failure leaves the old frame intact and busy state clears in finally.
- Round 5: confirmed dirty-worktree isolation and dedicated-test ownership.
- Round 6: clean review; no meaningful auto-fix items.
- Round 7: clean review; plan stabilized after two consecutive clean rounds.

