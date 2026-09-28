# Vertical Drama shot source and async generation design

## Goal

Keep the Overview story draft as the canonical source for shot content, make
start-frame prompt skills consume that source, and prevent long-running image
tasks from being abandoned before their result is linked back to the page.

## Evidence

- The Overview page reads the active story-bible breakdown item's `shotDrafts`.
- The episode workspace renders `startFramePlan.frames[].imagePrompt`, a
  materialized snapshot that can remain stale after the Overview draft changes.
- Character and start-frame image clients currently poll for about five minutes
  and finalize the media asset in the browser.

## Decisions

1. `bible.breakdownVersions[active].items[episode].shotDrafts[shot].summary`
   is the canonical visual beat when it exists. The episode shot card, existing
   storyboard, and stored start-frame prompt all treat it as authoritative; the
   storyboard and stored prompt remain compatibility fallbacks only when no
   active shot draft is available.
2. Pass the canonical shot summary to the relevant skill as structured input.
   The skill authors the final prompt; router/service code must not append
   story prose to a provider prompt.
3. Persist the exact canonical summary used to author each start-frame prompt.
   The episode workspace detects a missing or changed summary and refreshes the
   prompt via the start-frame prompt skill before submitting the image task.
4. Extend character and start-frame polling to a 30-minute bounded window and
   surface finalization failures instead of silently dropping the page sync.
5. Preserve existing behavior when the canonical draft is absent, and avoid a
   schema migration by using additive JSON fields.

## Verification

- Skill/service contract tests prove the canonical shot input is passed beside
  the stale `current_prompt`, with the skill contract making it authoritative.
- Pipeline/service tests prove the canonical summary reaches the skill input
  and is persisted on the projected frame.
- Router tests cover exposing the exact latest Overview shot summary, while
  service tests cover the canonical input and frame metadata contract.
- Storyboard-panel regression coverage proves the visible shot description uses
  the latest Overview summary instead of stale storyboard text.
- The client pollers use explicit 30-minute constants and surface finalization
  errors; full browser timing coverage remains an E2E follow-up.
