# Decision Log

- Planning depth: `standard`
- Reason:
  - the feature spans schema, service, editor UX, and AI draft flow
  - the scope is still cohesive enough for `deep-plan-quick`

- Delivery mode: `auto_by_default`
- Reason:
  - product intent is explicit in the request
  - the codebase already suggests the correct persistence split: deck metadata for presentation note, `slide.notes` for slide note

- Package strategy:
  - create `004-presentation-editor-notes`
  - keep the work incremental to the existing presentation editor architecture instead of designing a separate note subsystem

- UX bias:
  - notes remain hidden by default
  - opening/editing note content should feel like an authoring aid, not a permanent layout region
- audio-regeneration controls should extend the existing `SlideAudioPanel` rather than introducing a second audio surface

- Save behavior bias:
  - slide notes follow slide save/conflict semantics
  - presentation note uses deck metadata mutation semantics
  - regenerate-audio from note should save the note first or block until the note is saved successfully

- Runtime isolation bias:
  - do not add notes to slideshow/play/export contracts
  - protect this with explicit regression coverage

- Audio model UX bias:
  - reuse `ImageModelCombobox(mediaType="audio")` and `ModelInputFieldsPanel`
  - expose model/tier/voice selection in a small narration-generation dialog instead of crowding the default panel state
  - when slide note has unsaved edits, prefer a clear `Save Note First` state over exposing `Regenerate Audio`
