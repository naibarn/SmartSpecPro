## Summary

Add a per-slide "repair from slide note" action in Presentation Editor.

The action should be available from the Slide Note dialog and regenerate the current slide in place using the saved slide note as the source of truth. It should reuse the Draft with AI pipeline where practical, but only for a single slide:

- parse / restructure the saved slide note
- rebuild title, body, hierarchy, and block/component choice
- regenerate slide image media
- replace the current slide instead of creating new slides
- preserve undo behavior in the editor

## Constraints

- Use the saved slide note, not unsaved draft text, unless the draft is first saved successfully.
- Keep the feature scoped to one slide.
- Reuse the existing auto-layout/editor refresh patterns where possible.
- Avoid disturbing unrelated dirty files in the repo.

## Assumptions

- Regenerating image media is sufficient for the first version; no separate video-regeneration UI is required in the Slide Note modal.
- The current slide title in deck metadata should update if the repaired note produces a better title.
