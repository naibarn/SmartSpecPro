# Section 04 — Preview, Presets and Existing Approvals

## Requirement IDs

CPE-09, CPE-16, NB-05

## Objective

Make the already available cinematic/style options understandable and previewable inside the existing Vertical Drama workspace.

## Owned paths

`VerticalDramaStoryboardPanel.tsx`, current style/look-lock controls and the matching episode/series router contracts and component tests.

## Tasks

1. Surface the optional shot/style proposal and its current source revision.
2. Allow existing UI actions to keep, edit, decline or manually approve where the current workflow already requires approval.
3. Ensure optional CPE pending/error status never disables image/video actions or the broader workspace.
4. Version preset application without silently rewriting old episode content or user-authored values.

## Completion predicate

Authenticated/component tests show preview and advisory warnings, unchanged explicit manual approval/reject/cancel, and normal render buttons with CPE off or failed.

## Prerequisites and fallback

Requires sections 01–03. On missing proposal, show existing storyboard/style values without an error modal or wait.

## Focused tests and evidence

Add authenticated component/API coverage for preview, edit, keep, decline, existing approval, reject and cancel. Assert render controls remain available with CPE disabled, pending, failed or unavailable and that applying a preset does not rewrite older/user-authored episode values.

## Unresolved assumptions

Confirm which proposal states and existing approval actions are already supported by the storyboard panel/router. Do not create a new approval state or infer approval from UI mode or CPE completion.
