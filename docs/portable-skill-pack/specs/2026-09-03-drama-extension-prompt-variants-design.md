# Drama Series Extension Prompt Variants Design

## Goal

Update the Chrome extension's Drama Series episode view so each shot can show
its persisted Legacy and Enhanced video prompts independently, with a separate
copy action for each prompt. Image prompts remain collapsible and are closed by
default.

## Current state and evidence

The extension-facing episode service currently projects only `clip.prompt` as
`videoPrompt`. Enhanced prompts are persisted inside
`clip.videoPromptVariants.variants.enhanced.prompt`, but that store is not
projected to the extension. The shared prompt renderer already supports a
closed-by-default `<details>` block and copy action, but the Drama Series UI
renders a video fallback from storyboard/visual intent when `clip.prompt` is
empty.

## Design

### Server projection

Extend the safe `DramaShot` projection with optional
`legacyVideoPrompt` and `enhancedVideoPrompt` fields. Resolve the variant store
through the existing shared parser:

- Legacy uses the stored Legacy variant prompt when a valid store contains one;
  otherwise it uses the legacy `clip.prompt` field for old records.
- Enhanced uses the stored Enhanced variant prompt when present and not marked
  invalid.
- Empty or unavailable prompts are returned as absent/empty and are never
  replaced with storyboard or visual-intent text.

This is read-only, tenant/user-scoped, additive, and does not mutate generation
records or database data.

### Extension UI

The Drama Series shot view renders only non-empty prompt blocks:

- `Video Prompt (Legacy)` with its own Copy button.
- `Video Prompt (Enhanced)` with its own Copy button.
- `Image prompt` is rendered only when a prompt exists; when present it remains
  collapsible and closed by default, with Copy in its header. Clicking Copy
  must not toggle the disclosure state.

Existing non-Drama prompt surfaces retain their current behavior unless they
already use the shared helper's image collapse behavior.

### Testing and verification

Add service-level tests for legacy-only, enhanced-only, both variants, and
empty/malformed data. Add extension tests for the prompt projection/rendering
decision where the current test setup supports it. Run the focused web service
tests, extension typecheck/tests, and extension production build.

## Alternatives and trade-offs

Sending the raw variant store to the extension would preserve future metadata,
but couples the UI to internal persistence schema and exposes unnecessary
fields. Projecting two prompt strings is intentionally narrower and keeps the
tenant-safe server boundary explicit. The extra strings are negligible at
episode-shot scale; at very large episodes the response remains bounded by the
existing shot count and does not add database queries.

## Failure and compatibility behavior

Legacy records without a variant store continue to show `clip.prompt`. Records
with no actual video prompt show no video prompt block. A malformed variant
store does not break the episode response; the projection falls back to the
legacy clip field and omits Enhanced. Missing image prompts do not render a
prompt block. Existing non-Drama callers may continue to use the shared
renderer's empty-message behavior.
