# Section 03: AI Draft Note Capture

## Goal

Persist AI Draft source material into the new authoring note surfaces without changing playback/export behavior.

## Scope

- AI slide schema/output normalization updates
- mapping full article text to deck notes
- mapping per-slide split text to slide notes
- service-level tests around draft insertion

## Implementation Steps

1. Decide a normalized per-slide source-text field for AI draft output
   - e.g. `sourceNote`, `speakerNotes`, or similar
   - keep naming consistent across schema + service code
2. Extend the article-splitting prompt/schema handling so each generated slide carries source text suitable for a note
3. Before inserting slides, persist full `articleText` to deck note via deck metadata update path
4. When calling `addSlideToDeck(...)`, pass each slide's source note as `notes`
5. Define fallback behavior for topic-only drafts so note content is explicit and deterministic
6. Add tests that assert both deck note and slide notes are written during AI Draft insertion

## Constraints

- store readable authoring text, not raw debug payloads
- do not require play/export contracts to know about notes
- avoid writing truncated 200-char preview text when the full article is available

## Done When

- full article text is saved to Presentation Note
- each inserted AI draft slide stores its split text in Slide Note
- AI Draft tests cover the mapping path
