# Synthesized Specification: Feature 122 Video Segment Planner Multi-Shot Storyboard Review

## Objective

Create a central `videoSegmentPlanner` that can convert storyboard shots into provider/model-aware video generation segments. The first caller is Marketplace Capture Auto Storyboard Review for product review videos. The component must preserve current per-shot behavior, then enable adaptive multi-shot grouping for selected video models.

## Current Implemented Foundation

A supporting creative preset/audio-policy slice is already implemented:

- shared preset registry in `apps/web/shared/hyperframes/autoReviewCreativePresets.ts`;
- preset selection passed through Runtime API and Marketplace Capture router;
- Marketplace Capture product UI exposes preset choices;
- Marketplace Auto Review service applies preset directives and audio strategy guardrails;
- Storyboard Review prompt planning/regeneration receives `creativePresetDirective`.

This foundation is part of Feature 122 context, but it does not implement multi-shot segment planning yet.

## Product Scope

MVP surfaces:

- Marketplace Capture product detail Auto Storyboard Review.
- Storyboard Review handoff and regeneration.

Future-compatible surfaces:

- Media Studio;
- Production Director;
- short-drama;
- music-video;
- presentation video.

## Required Behavior

- Preserve `per_shot` behavior with no prompt/reference/media history regression.
- Add video structure options:
  - `per_shot`
  - `adaptive_multi_shot`
  - `compact_multi_shot`
  - `manual_group_size`
- Add optional creative brief text.
- Reuse implemented creative presets and audio-policy logic.
- Resolve video model capability from data, not display-name prompt strings.
- Use `capabilities.videoSegment` model config metadata as the primary capability source; display-name heuristics cannot enable paid multi-shot.
- Store `videoSegmentPlan` in run metadata and Storyboard Review state.
- Provide server-owned `getVideoSegmentPlanPreview` and `regenerateVideoSegmentPrompt` contracts so client pages do not recreate planner logic.
- Keep preview/regeneration responses safe and consistent: use `VideoSegmentPlanWarning[]`, separate credit basis from credit source, and never expose provider tokens, session references, or signed provider upload URLs.
- Make Storyboard Review regenerate prompts from the shared segment contract.
- Synthesize legacy per-shot plans for existing review records without segment state.
- Gate MCP models by owned/shared account eligibility.
- Keep Thai separate TTS and storyboard voiceover aligned with video prompts.
- Block paid generation for stale auto-generated prompts until regenerated or explicitly kept.
- Require explicit user confirmation before paid retry after split fallback.
- Persist generated segment outputs as SmartSpecPro-managed durable media-history/storage URLs, not provider temporary URLs.

## Non-Goals For First Implementation Wave

- Do not enable unrestricted multi-shot generation for every provider.
- Do not remove per-shot generation.
- Do not rewrite Storyboard Review page architecture.
- Do not create new user-editable provider capability free text.
- Do not change product truth, product claim, or reference lock governance.
