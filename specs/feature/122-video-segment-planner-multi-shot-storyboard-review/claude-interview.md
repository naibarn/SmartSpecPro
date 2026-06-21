# Interview Notes: Feature 122

No blocking follow-up questions were asked in this planning pass because the user explicitly requested continuation without waiting for confirmation.

## Captured Stakeholder Decisions From Conversation

- Start with Auto Storyboard Review for Marketplace Capture product review.
- The component must be reusable later by short-drama, music-video, Media Studio, and other production flows.
- Users need optional customization beyond auto behavior, including a free-text creative brief.
- Creative presets should add variety, but must not change locked product identity, character identity, reference image roles, or factual claims.
- Thai audio needs special care. Seedance 2.0 should not be asked to generate Thai native speech directly; Thai narration should use separate TTS when selected.
- If separate TTS is used, storyboard shot voiceover and the full voiceover script must remain the single source of spoken content and must stay aligned with the same story beats as video prompts.
- Model choice should drive transport/provider behavior. Users should not have to separately choose API vs MCP when model config already knows the correct transport.
- MCP model options should appear only when the user owns a configured MCP account or belongs to a group with shared access.
- Marketplace Capture creates the first storyboard/video plan; Storyboard Review must be able to regenerate prompts later from the same plan.
- The plan must support both existing per-shot generation and future multi-shot grouping. Per-shot fallback must remain available.

## Assumptions For The Plan

- MVP implementation should not enable multi-shot provider spend immediately. It should first route per-shot through the shared planner and persist segment state.
- Multi-shot generation should be feature-flagged and model-capability gated.
- Existing Storyboard Review records without segment state must continue to work through synthesized per-shot segment plans.
- Browser-visible changes must be verified across mobile, tablet, and desktop.
