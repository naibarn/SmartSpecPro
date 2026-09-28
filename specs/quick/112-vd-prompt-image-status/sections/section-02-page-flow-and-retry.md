# Section 02 — page flow and retry

## Ownership

Own the start-frame prompt/image orchestration in
`VerticalDramaEpisodePage.tsx`. Keep prompt authoring, image submission,
polling, reload resume, and task-id protections intact.

## TDD expectations

Add regressions for prompt success followed by image admission failure, result
URL sync failure, and render-only retry. Verify that prompt authoring is not
called for `reauthor = false`.

## Acceptance checks

- sync failure persists terminal `failureStage: "sync"` before return;
- admission failure persists terminal `failureStage: "admission"` without a
  provider task id;
- if failure persistence itself fails, a local per-shot error still clears the
  busy UI and directs the user to Media History;
- user-facing error distinguishes prompt success from image failure;
- `สร้างภาพใหม่` reuses the saved prompt behind the existing paid-action
  confirmation and no automatic duplicate paid retry occurs;
- sync retry uses `lastTaskId` to recheck and link an existing result before
  offering a new paid image-only render;
- status/error/action data reaches the storyboard panel;
- reload resume and late-task behavior remain unchanged.

## Copy contract

Thai is primary for the reported workflow; English mirrors every new state.
Use explicit copy such as `สร้าง prompt สำเร็จแล้ว แต่สร้างภาพไม่สำเร็จ` and
include a concrete reason plus an action. Never show a generic success after a
terminal image failure.
