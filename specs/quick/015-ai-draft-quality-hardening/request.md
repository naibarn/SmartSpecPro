# Request

User-reported auto-draft presentation quality regressions:

1. Some generated slides still save without a usable image in the final rendered slide.
2. Slide text still diverges from slide notes.
3. Layout variety collapsed into near-identical image-overlay compositions with poor aesthetics, repeated long-form blocks, text escaping the intended block, and weak handling for long article-style copy.

## Repository-fit assumptions

- Scope is the `Draft with AI` auto-generation pipeline, not the general manual editor authoring system.
- Quality fixes should land in server-side draft planning/layout composition first so saved deck JSON is correct before the editor loads it.
- Existing long-form and structured block families should be reused where possible instead of inventing a new rendering system.

## Non-goals

- Rebuilding the entire presentation editor UI.
- Changing user-authored/manual relayout behavior unless needed for compatibility.
