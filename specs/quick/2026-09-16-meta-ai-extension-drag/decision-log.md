# Decision log

## Decision 1 — standard quick plan

Use standard quick-plan depth because the change spans extension bridge, Web
projection, UI, tests, and packaging but needs no schema migration or new
service. Keep implementation inline in standard-light mode.

## Decision 2 — Meta.ai adapter

Reuse the existing drag bridge record/File protocol. Add a Meta.ai target adapter
that selects a suitable upload input, sets native files, dispatches input/change,
and falls back to synthetic drop. This is safer for a React uploader than only
adding a host allowlist.

## Decision 3 — Storyboard navigation

Reuse Drama Series' mutually exclusive list/detail state. Explicit Back clears
the selected Storyboard project; loading the project list must not automatically
open the first project.

## Decision 4 — prompt projection

Add bounded `imagePrompt` to the existing clip projection from task/context
image-prompt keys, while keeping video prompt resolution independent so an image
prompt cannot be shown as a video prompt.

