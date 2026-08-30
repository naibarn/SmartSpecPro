# Presentation Builder: Use an Existing Article

## Goal

Allow a user who already has article content to send it directly into the
Presentation Builder slide-planning workflow. The existing topic-only flow
must remain unchanged for users who want the system to write the article.

## UX and state

- Add an explicit input mode: `generate` (default for a blank builder) or
  `existing` (default when the dialog receives an initial article).
- `generate` keeps the topic field and Skill/Agency controls. Its primary
  workflow action calls `generateArticle` and then prepares the slide bundle.
- `existing` treats the article textarea as the source document, makes the
  topic optional, and derives a bounded topic from the first non-empty article
  line when the user does not provide one. Skill/Agency controls are hidden in
  this mode because no article-generation provider is needed.
- The existing article is shown in the editable article textarea near the
  input controls. The generated-article review area remains available for the
  normal generation mode.
- The existing-article workflow action calls `prepareSlideBundle` directly;
  it never calls `generateArticle` and does not consume article-generation
  credits.
- In existing-article mode, Step 1 is explicitly marked as required and the
  Step 2 prepare action is disabled until Step 1 completes. After preparation,
  Step 2 shows the completed state so the user can continue without repeating
  the same action.
- Persist the mode in the local builder draft, while treating old drafts with
  no mode field as `generate` for backward compatibility.

## Validation and errors

- Topic generation input remains 3–2,000 characters.
- Existing article input is validated in the client before the API call: at
  least 20 characters and at most 25,000 characters, matching the slide-bundle
  contract.
- A topic longer than 2,000 characters receives a plain-language message that
  explains it is a topic field and directs the user to the existing-article
  mode.
- Common raw Zod/API messages for the topic length constraint are translated
  into the same friendly message, so users do not see `too_big`, `path`, or
  schema internals.
- Existing slide-planning, media, credit, authorization, and provider errors
  retain their current behavior and are not swallowed.

## Implementation boundary

The change is limited to `PresentationArticleGeneratorDialog`, its focused
helper tests, and the Thai/English presentation locale files. No database
migration or new article storage source is required; the existing local draft
storage remains the source for restoring the builder state.

## Verification

- Unit-test topic fallback bounding and both article validation branches.
- Unit-test friendly topic-length error mapping.
- Run the focused Presentation Article Generator dialog tests and the related
  presentation service/payload tests if they are part of the workspace test
  command.
- Keep unrelated dirty worktree changes untouched; browser/provider/production
  verification is outside this local change unless separately requested.
