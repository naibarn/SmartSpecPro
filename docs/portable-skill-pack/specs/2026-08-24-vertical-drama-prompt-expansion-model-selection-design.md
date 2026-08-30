# Vertical Drama Prompt Expansion Model Selection and Credit Display

## Goal

Make Prompt Expansion honor the same Vertical Drama model contract shown to
the user and make credit history identify the skill unambiguously.

## Decisions

- An explicit series `llmModelPolicy.defaultModelId` is authoritative. The
  prompt-expansion call must use that model and must fail closed if it is no
  longer enabled/routable; it must not silently substitute another model.
- A pre-create wizard `modelId` is equally explicit when no series policy has
  been persisted yet. It is resolved from all enabled/routable rows, including
  an explicitly selected manual-only catalog row; automatic-selection rules do
  not override an explicit choice.
- Automatic selection uses the admin-recommended, large-context, structured
  output, thinking-capable model set used by the planning-model picker. If that
  set is unavailable, the request fails with an actionable provider/model error.
- The selected/effective model is persisted in execution metadata and the
  credit transaction metadata. The credit description starts with the
  authoritative skill display name; model/provider remain separate metadata.
- Existing no-mock/no-fallback behavior remains unchanged. A provider error or
  invalid output never creates a preview or a credit charge.

## Data flow

`PromptExpansionDialog(seriesId)` → `previewPromptExpansion(seriesId)` → strict
model resolver → real skill call → execution metadata → skill settlement →
Credits API/UI.

## Failure and compatibility

- Draft/session flows without a persisted series use Automatic recommended
  selection.
- A disabled pinned model is an explicit configuration error, not an automatic
  fallback case.
- Legacy credit rows continue to resolve their skill slug when no display name
  exists.

## Verification

- Unit tests cover explicit pin, disabled pin, automatic recommended selection,
  manual-only explicit selection, and rejection of the old nano model when it
  is outside Recommend.
- Existing focused Prompt Expansion, model-policy, and Credits tests remain
  green.
- A real-provider test records the selected model and exact skill name without
  mocking or fallback.
