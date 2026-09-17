# Storyboard Model Provenance Design

## Goal

Keep the selected image and video models from Skill Framework consistent through generation and Storyboard Review, and expose per-shot model provenance for quality review.

## Source of truth

The normalized Skill Framework global input remains authoritative for requested models:

- `imageModelSelection.modelId` is the requested image model.
- `videoModelSelection.modelId` is the requested video model.

The Storyboard Review projection carries both values explicitly. Image tasks keep their image model in the task model field, while the video model is stored in a first-class storyboard-level/shot-level metadata field and never inferred from an image task's model.

When media generation resolves a provider substitution, the requested model and effective model are retained separately. Review displays the requested model and, when available, the effective model/provider used for the artifact.

## Data flow

`Skill Framework form -> normalized draft/run -> image generation and video prompt planning -> Storyboard Review projection -> Review generation actions`.

Image generation receives the selected image model. Video generation receives the selected video model. Review option changes update the draft even when the projection currently contains image-only tasks, so later video generation cannot silently fall back to the default model.

## UI

Each Storyboard Review shot displays a compact model provenance block:

- Image model: requested/effective model and provider where known.
- Video model: requested/effective model and provider where known.
- Generation status remains separate from model identity.

The existing video options panel remains editable and is initialized from the projected video model. The selected option is persisted and used by subsequent video generation.

## Failure and compatibility behavior

- Legacy drafts without explicit video metadata continue using the current video-task/plan fallback order.
- A missing model is shown as `Not recorded` rather than being presented as a verified model.
- Provider fallback does not overwrite the requested model.
- No retired system or new dependency is introduced.

## Verification

Regression tests cover image-only Skill Framework projections, video option persistence without existing video tasks, effective generation model selection, projection metadata, and per-shot provenance rendering data. Existing Storyboard Review and Skill Framework focused suites must remain green.
