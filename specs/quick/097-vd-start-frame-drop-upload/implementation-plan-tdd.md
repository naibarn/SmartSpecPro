# TDD Plan

## Red phase

Create `VerticalDramaStoryboardPanel.startFrameDropUpload.test.tsx` and first prove:

- an OS image drop sends an upload-kind input with metadata and base64;
- the busy overlay remains while a deferred callback Promise is pending;
- a second drop for the same shot is ignored;
- a durable URL drop sends URL-kind input;
- unsupported/oversized files do not call the callback.

Add focused page-side helper tests if the upload-vs-URL finalization cannot be tested
without mounting the full episode page. Expected old-code failures are URL-only callback
arguments and prematurely cleared busy state.

## Green phase

Implement the discriminated contract, awaited callback, busy/drag state, workspace
plumbing, and page upload branch with the smallest targeted edits.

## Refactor phase

- Remove inaccurate comments claiming the old URL handler uploads data URLs.
- Keep shared parsing helpers pure and named around Start Frame drop semantics.
- Avoid generalizing character/reference drops in this task.

## Verification

From `apps/web`:

```bash
pnpm exec vitest run client/src/components/verticalDramaSeries/__tests__/VerticalDramaStoryboardPanel.startFrameDropUpload.test.tsx
pnpm check
```

Also run `git diff --check` for owned paths and inspect the final targeted diff against
pre-existing dirty hunks.

