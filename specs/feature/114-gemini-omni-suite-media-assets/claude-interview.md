# Interview and Decision Log - Feature 114 Gemini Omni Suite Media Assets

Date: 2026-05-21
Mode: self_review

No blocking user questions remain for planning. The user already provided the core product direction and asked to proceed with deep-plan.

## Confirmed Decisions

- Gemini Omni should be treated as a suite, not one generic model config.
- The suite has three capabilities:
  - Gemini Omni Video for video generation.
  - Gemini Omni Character for reusable `characterId` assets.
  - Gemini Omni Audio for reusable `kieAudioId` assets.
- Video remains the primary user workflow.
- Character and Audio should feel like reusable reference asset tools inside the Video workflow, not separate confusing model choices.
- Users should not have to type raw provider fields such as `image_urls`, `video_list`, `character_ids`, or `audio_ids`.
- The current locked reference field UX is insufficient and must be replaced by interactive pickers/status surfaces.
- Pricing must match the user-provided Gemini Omni matrix.
- The system should support:
  - one-shot video
  - multi-shot prompt in one generated video
  - storyboard made of multiple generated videos, where each video can itself contain multi-shot instructions
- A dedicated Gemini Omni Video Director skill should be added under `apps/web/skills`.
- The skill should have complete schemas like existing skills.
- The learning loop should evaluate prompt quality after Auto Prompt and generated video quality after video generation, then create safe reviewable skill-improvement recommendations.

## Planning Assumptions

- The Kie.ai docs linked in `spec.md` are the source of provider contract truth for implementation.
- The first implementation should be feature-flagged so existing Media Studio and non-Gemini provider flows can remain stable.
- Asset creation may initially be available only to admins/internal users, then rolled out to normal users after validation.
- Provider assets should be tenant/user scoped and soft deletable.
- Existing generated videos and library items should not be migrated destructively.

