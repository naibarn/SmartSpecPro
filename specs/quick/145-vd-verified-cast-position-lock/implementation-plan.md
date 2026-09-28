# Implementation plan

## Objective

Make a current, user-confirmed cast layout the independent authority for speaker
position, use stable speaker identities throughout, and fail before credits when
the current image is not safely mapped.

## Current-codebase fit

Extend the optional JSONB artifact types in `contracts.ts`; add small pure layout
helpers; add an owner-scoped router mutation and preconditions in the existing
prompt/render procedures; pass the verified map into the existing prompt service;
and add a compact ordered-slot editor to the existing storyboard shot card.

## Implementation approach

1. Add lock types, deterministic positions, and pure validation helpers with unit
   tests for 1-5 characters, duplicates, missing keys, asset mismatch, and Shot 5.
2. Resolve display-name speakers to stable keys and reject unknown/ambiguous or
   off-shot speakers before any prompt credit spend.
3. Persist locks through a narrow tRPC mutation. Invalidate them whenever the
   authoritative image or physical cast changes.
4. Make prompt position validation compare to the lock rather than to its own
   generated answer. Persist a lock snapshot on the clip.
5. Revalidate lock/frame/clip parity before paid video credit reservation.
6. Add the ordered UI editor, blocked button states, and bilingual guidance to
   replace/repair unclear images.

## Risks and mitigation

- Dirty overlapping files: patch only narrow hunks and inspect scoped diffs.
- Legacy artifacts: optional fields and risk-scoped gating.
- Display-name ambiguity: fail closed and instruct the user to fix roster/dialogue.
- Video-safe anchor mismatch: use the same active asset selection at prompt and
  render boundaries.
- Provider drift: retain post-render identity QC and avoid absolute guarantees.

## Acceptance criteria

- Shot 5 maps กล้า to viewer-center, ปราง to viewer-center-right, and ไอริณ to
  viewer-center-left.
- Prompt generation cannot run for a physical multi-character shot until the
  exact current image/cast order is confirmed; paid render rechecks the same
  lock even for silent clips.
- Wrong/duplicate/missing/stale mappings are rejected before an LLM or video
  provider call.
- A display-name dialogue speaker resolves to the matching stable key and portrait.
- Paid render rejects a clip whose lock snapshot does not match the current frame.
- Changing an image or required cast invalidates the lock and affected prompt.
- Focused service/router/UI tests and scoped diff/type diagnostics pass.
