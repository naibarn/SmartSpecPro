# Video Studio Draft Handoff

## Goal

Make the review-first flow explicit and lossless:

`brief -> content draft -> accept -> scenes/narration ready -> optional TTS/media generation`

The accepted draft is the single source for the initial scene list and spoken
script. Accepting it must not trigger a second scene-planning call, TTS, image
generation, video generation, or render.

## Design

### 1. Draft artifact

The existing content-draft candidate already contains scene timing, visual
template choices, motion direction, and per-scene narration. It remains a
review artifact until accepted. The server promotes the exact candidate into
`video_projects.document` through the revision-guarded optimistic-concurrency
save, then removes the temporary candidate marker.

The candidate is then cleared from the brief, but the accepted document and its
revision remain the durable source of truth. The UI must immediately consume the
returned canonical document so the user never sees an empty/stale draft after
accepting.

### 2. Handoff after acceptance

The accept response returns the promoted document and revision. The workspace:

- replaces its in-memory document with that response;
- refreshes the project metadata;
- navigates to the Scenes stage;
- shows a handoff banner explaining that scenes and narration came from the
  accepted draft.

The Scenes stage must not encourage a second AI plan when all scenes already
have narration and visual templates. An explicit replace/re-plan action remains
available for intentional regeneration.

### 3. Narration stage

The Narration stage displays every scene's full spoken script before any TTS
action. Scenes with script but no audio are labelled `รอสร้างเสียง`. Model,
voice, and provider voice ID selection remain explicit; pressing the TTS action
is the only operation that creates audio.

### 4. Approval gate

The generic stage approval bar is not shown for `brief`. A brief is an input
stage, not a complete generated result. Draft acceptance is the content
approval action; stage approval must not appear as a second approval before a
downstream artifact exists.

## Failure handling

- A stale revision keeps the candidate and shows the existing conflict error.
- A failed revision-guarded accept leaves the candidate and canonical document
  unchanged. If cleanup of the temporary candidate marker fails after the
  document save, the accepted document remains usable and the candidate remains
  available for recovery rather than being silently discarded.
- A refetch failure after a successful accept does not erase the returned
  canonical document from the workspace.
- No downstream paid operation is dispatched by accepting a draft.

## Verification

Focused tests cover:

1. accept response handoff and navigation to Scenes;
2. Scenes stage no-op/notice when the accepted draft is already complete;
3. Narration stage renders full script and pending-TTS state;
4. approval bar hidden for `brief`;
5. existing draft regeneration, TTS, and scene-plan behavior remain intact.
