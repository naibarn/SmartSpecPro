# Section 06: Media Studio Gemini Omni UX

## Goal

Replace confusing raw/synced field interaction with a dedicated Gemini Omni suite panel.

## What This Section Must Change

- Detect `gemini-omni-video` selection.
- Render a suite panel with:
  - reference image picker/status
  - source video picker/status
  - character asset picker
  - audio asset picker
  - inline create dialogs for character/audio
  - delivery mode selector
  - reference unit meter
  - credit estimate
  - skill/QA cost indicator when those steps are billed separately
  - QA status areas
  - Storyboard Review handoff action when reviewable prompts or clips exist
  - Video Edit handoff action when reviewable prompts or generated clips exist
  - Cinematic Storyboard workspace when story-driven delivery mode is selected
  - Marketplace Product Storytelling workspace when a marketplace product/image/VideoBrief is selected
- loading, empty, and error states for provider asset pickers
- Keep existing reference images/videos as source of truth.
- Keep `modelInputValues` for generic fields only.
- Hide or demote synced raw provider fields in normal mode.

## Files Likely Touched

- `apps/web/client/src/pages/MediaStudio.tsx`
- possible new components under `apps/web/client/src/components/media`
- provider asset API hooks
- i18n translation files
- UI tests

## UX Rules

- Reference Images and Source Video must be visibly interactive when supported.
- Source Video should cap at one selected video.
- Character picker should cap at 3.
- Quota meter must show why a selection is invalid before Generate is clicked.
- Create Character/Audio should return to Video flow with the new asset selected.
- Advanced/debug mode may reveal provider payload names; normal mode should not.
- Controls must be keyboard-accessible, mobile-safe, and localized in Thai/English.
- Character creation must block reference images larger than 20 MB before submission.
- Storyboard mode must surface per-clip progress and partial failure states.
- Processing status should be understandable whether completion arrives from callback or polling.
- Unsafe/non-public references should show a direct error before generation.
- Character/Audio create dialogs should show policy/consent acknowledgment when tenant policy requires it.
- Storyboard mode should show per-clip and total estimated cost before launch.
- Rate-limit, concurrency, and budget blocks should be disabled/deferred states, not generic failures.
- Director/QA unavailable states should be visible and follow tenant policy.
- Storyboard Review should be a downstream review workspace reached through a clear handoff/deep link, not a duplicate generation surface.
- Video Edit should be a downstream manual editing workspace reached through a clear handoff/deep link, not hidden behind Storyboard Review.
- When output is reviewable or generated, show two distinct actions: `Review Storyboard` and `Open in Video Edit`.
- Review-only storyboard placeholders must be visually distinct from submitted or completed clips.
- Returning from Storyboard Review should preserve the Gemini Omni run, clip order, and current selections.
- Returning from Video Edit should preserve the original Gemini Omni/Production run and show the linked edit project/export status without rewriting provider generation state.
- Storyboard Review feedback should be framed as comments/approval/revision requests, not as direct edits to provider asset or billing state.
- Video Edit changes should be framed as user edit-layer changes, not as provider submission, provider asset, credit, or historical generation changes.
- Gemini Omni review tasks should show a compact Gemini Omni badge/metadata summary for delivery mode, QA status, reference-unit usage, and selected character/audio/reference assets.
- Generic Storyboard Review regenerate controls must be disabled for Gemini Omni tasks unless they route through a Gemini Omni-specific regeneration adapter.
- If direct regeneration is disabled, the CTA should be "Revise in Gemini Omni" and return the user to the authoritative Gemini Omni run.
- Review-layer replace/import/reorder/render actions must be labeled as review/composition changes so users do not think they changed the original Gemini Omni provider submission.
- Video Edit project creation should include clips, scene order, dialogue/voiceover, captions where available, asset snapshots, QA badges, product evidence warnings, and provider metadata needed for safe manual editing.
- Cinematic Storyboard mode should show Story Bible, Cast & Voice, Scene Timeline, Provider Plan, QA, and Review Storyboard sections.
- Cast & Voice should support no voice, voiceover narration, character dialogue/audio-guided performance, and mixed narration/dialogue.
- Lipsync-related labels must be provider-safe. Use "audio-guided dialogue/performance" unless the Kie contract confirms exact lipsync support.
- Scene Timeline should show each scene's narrative beat, emotional intent, duration, shot list, transition, voice/dialogue text, assets, credit estimate, and readiness.
- Storyboard Review should open in story timeline mode for cinematic runs, with grouped scenes and whole-story approval.
- Marketplace Product Storytelling should reuse existing Media Studio marketplace product/image selection for Shopee and TikTok Shop.
- When a marketplace product is selected, show a Product Truth panel with product name, platform, shop, source URL, selected images, price/sold/rating/review text snapshots when available, and Feature 115 insight badges.
- Product Truth panel should show which claims are evidence-backed, user-confirmed, unsupported, or requiring review.
- Offer product campaign presets: product review, sales/demo, brand awareness, customer journey, objection handling, trust/proof, TikTok Shop trend short, Shopee product support video, and cinematic brand story.
- Customer Journey view should map each scene/clip to a funnel stage and show whether the content stays aligned with the selected product journey.
- Storyboard Review should show product card summary, selected marketplace images, evidence-backed claims, unsupported-claim warnings, and customer journey stage per scene/clip.
- Import Feature 115 `MarketplaceStorytellingHandoff` by capture ID, product ID, insight ID, or AI Video Studio import payload.
- Show Feature 115 readiness states clearly: ready for storytelling, ready with warnings, needs user review, insufficient evidence.
- When readiness is `needs_user_review`, show claim/image/evidence review actions instead of Generate.
- When readiness is `insufficient_evidence`, route users to capture more evidence, select more product images, run server AI review, or manually confirm product fields.
- Support claim resolution actions: approve, edit, remove, request more evidence.
- Edited or removed claims should visibly update affected scenes, captions, voiceover lines, CTA, and on-screen text before generation.
- UI must pass responsive, keyboard, and accessible-label smoke checks before release.

## Tests

- image/video reference controls are interactive
- source video cap works
- over-quota blocks generation
- empty character/audio states show create actions
- newly created asset is selected
- dynamic raw fields are not the primary normal UX
- mobile layout keeps controls usable without overlapping text
- Thai and English strings exist for new labels/errors
- callback/polling processing status does not expose infrastructure internals
- unsafe reference URL errors are visible and actionable
- policy/consent acknowledgment is required before creating reusable character/voice assets when configured
- storyboard cost estimate includes provider, skill, and QA costs when applicable
- budget/rate/concurrency blocks do not submit provider jobs
- manual prompt fallback works only when policy allows it
- Review Storyboard action appears only after prompt QA creates reviewable prompts or after generated clips exist
- Open in Video Edit action appears only after reviewable prompts with media placeholders or generated clips can form an edit project
- Storyboard Review handoff shows placeholder/submitted/completed/revision-needed states clearly
- Video Edit handoff shows project creation/opening/export states clearly
- returning from Storyboard Review preserves Gemini Omni run state and clip ordering
- returning from Video Edit preserves Gemini Omni run state and linked edit project metadata
- Gemini Omni review task metadata badges fit in desktop/mobile layouts without exposing raw provider IDs
- Gemini Omni review tasks do not show generic direct regenerate unless Gemini Omni regeneration adapter is active
- Revise in Gemini Omni CTA restores the run and selected clip context
- Cinematic Storyboard workspace keeps Story Bible, Cast & Voice, Scene Timeline, Provider Plan, QA, and Review Storyboard usable on desktop and mobile
- Storyboard Review story timeline view shows narrative arc, scene groups, voiceover/dialogue, cinematic QA, continuity warnings, and whole-story approval
- Provider-safe labels do not over-promise lipsync support
- Marketplace Product Storytelling workspace imports Shopee/TikTok Shop product context and Feature 115 ProductBrief/ReviewInsight/TikTokShopTrendBrief/VideoBrief when available
- Product Truth panel blocks or warns on unsupported product claims, product-image mismatch, and customer journey mismatch before Generate
- Storyboard Review product timeline displays product evidence, customer journey stage, claim QA, and product image fidelity status
- Feature 115 readiness states map to the correct Gemini Omni actions and never allow direct generation for `needs_user_review` or `insufficient_evidence`
- claim resolution UI updates dependent scene/voice/caption/CTA content before Generate
- request-more-evidence action returns to marketplace capture/product evidence surfaces where a route exists
- desktop/mobile responsive smoke checks show no overlapping or clipped controls
- keyboard path reaches the Gemini Omni panel controls and dialogs

## Completion Criteria

- A user can understand what to upload/select for Gemini Omni without knowing Kie raw field names.
- A user can recover from asset picker/load/create errors without losing their video setup.
- A user can see why a generation is blocked, deferred, or too expensive before credits are reserved.
- Users can still recover when Auto Prompt/QA infrastructure is unavailable according to tenant policy.
- A user can move a Gemini Omni storyboard into Storyboard Review without confusing review placeholders with actual provider jobs.
- A user can move the same Gemini Omni or Production output into Video Edit without triggering new provider generation or credit reservation.
- A user can build and review a coherent cinematic story instead of managing disconnected generated clips.
- A user can turn confirmed marketplace products and images into evidence-backed product review, sales, brand, and customer journey videos without inventing product facts.
