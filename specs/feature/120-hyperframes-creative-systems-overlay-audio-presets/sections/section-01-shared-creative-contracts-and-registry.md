# Section 01: Shared Creative Contracts and Registry

## Goal

Create the shared contract layer for Feature 120 before changing runtime or UI
behavior. The registry must describe overlay, subtitle, music, SFX, transition,
and audio pack presets as versioned data with explicit capabilities and legacy
aliases.

## In Scope

- `apps/web/shared/hyperframes/creativePresets.ts`
- additive schemas in `apps/web/shared/hyperframes/contracts.ts`
- additive schemas in `apps/web/shared/hyperframes/runtimeApiSchemas.ts`
- contract tests for registry, aliases, creative plan, manifest, timeline, and
  audio event map
- Thai font policy and safe-area metadata
- HyperFrames English prompt packs as metadata
- capability metadata for producer-ready, fallback-only, and unsupported states
- evidence-bound copy plan metadata for product truth, ad policy, stale
  volatile facts, and user edits
- exact `copySource` enum values: `product_truth`,
  `marketplace_capture_field`, `ai_insight_evidence`, `user_edit`,
  `policy_disclosure`, and `derived_summary`
- evidence-bound copy metadata includes `policyRulePackRef` and blocks when it
  cannot resolve a current policy pack.
- audio/SFX/font source, license, checksum, and ownership metadata contracts
- exact audio role values: `voiceover`, `music`, `transition_sfx`, `ui_sfx`,
  `accent_sfx`, and `ambience`
- artifact/output kind compatibility rules and social variant rollout status
- product-category-aware presets for electronics/spec, price/deal, and social
  proof/review use cases
- subtitle preset families including classic box, karaoke word highlight,
  highlight sweep, creator pop, and cinematic wide
- preset lifecycle, emergency disable, historical outputs, and candidate to
  active promotion metadata
- prompt intent, agent-authored template generation, future HyperFrames Studio
  integration, and manifest traceability metadata
- non-goal guard that arbitrary tenant-authored HTML cannot become executable
  production HTML
- preset metadata records whether SFX depends on a bundled SFX starter pack,
  tenant-uploaded assets, or Library-selected assets, and whether music
  generation or asset-library based music is enabled

## Out of Scope

- No worker dependency changes.
- No Storyboard Review UI implementation.
- No new database table unless Section 02 approves migration.
- No contract version bump unless migration gates pass.

## Existing Files To Review

- `apps/web/shared/hyperframes/contracts.ts`
- `apps/web/shared/hyperframes/runtimeApiSchemas.ts`
- `apps/web/shared/hyperframes/templates.ts`
- `apps/web/shared/hyperframes/featureAccess.ts`
- `apps/web/shared/hyperframes/__tests__/runtimeApiSchemas.test.ts`
- `specs/feature/119-hyperframes-marketplace-auto-review-render-adapter/sections/section-01-contracts-and-runtime-schemas.md`

## Test First

Add failing tests for:

- unique registry ids and versions;
- overlay/subtitle/audio/music/SFX/transition categories;
- lifecycle states and disabled/archived behavior;
- legacy alias resolution from current final composite ids;
- unknown ids rejected;
- Thai font metadata required for Thai text presets;
- producer-only presets hidden or disabled when runtime capability is fallback;
- prompt pack metadata exists but render input still requires variables and
  creative plan;
- all starter preset ids from the spec exist exactly once in the registry, with
  no spelling drift, category drift, or implicit fallback alias;
- creative plan hash changes on output-affecting fields;
- contract version remains compatible with Feature 119.
- copy plan requires `copySource`, evidence refs, freshness metadata, claim
  category, edit actor, and safe omission reasons;
- unsupported claims and instruction-like marketplace text are rejected before
  render-facing metadata is accepted;
- allowed Thai font families are exactly `Prompt`, `Noto Sans Thai`,
  `IBM Plex Sans Thai`, `Sarabun`, and `Kanit`;
- audio/SFX/font refs require source/license/checksum metadata.
- creative sidecars map to existing Feature 119 artifact kinds by default;
- `social_variant_package` is represented as contract-ready but rollout-gated
  until fixture/platform evidence exists.
- active presets include explicit lifecycle state and rollback behavior so
  disabled presets stop new renders while historical outputs remain playable.
- `HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION` remains
  `hyperframes_marketplace_auto_review_v1` unless an explicit versioned
  migration with dual-parse tests is added.
- the exact compatibility anchor
  `HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION = "hyperframes_marketplace_auto_review_v1"`
  is covered by tests and release notes.
- runtime capability metadata uses the exact spec fields `ffmpegAssFallback`,
  `smokeRenderer`, `hyperframesProducer`, `minRuntimeProfile`, and
  `testedRuntimeProfileHash`.
- exported schema/type tests cover the exact Feature 120 contract names:
  `HyperframesPresetVariable`, `HyperframesPresetTimingPolicy`,
  `HyperframesPresetSafeAreaPolicy`, `HyperframesAudioEvent`,
  `HyperframesCreativeVariables`, `HyperframesCreativeRenderManifest`,
  `HyperframesCreativeQaResult`, `HyperframesCreativeLibraryMetadata`,
  `HyperframesLibraryFinalizeMetadata`, `HyperframesShotMediaAssignment`,
  `HyperframesArtifactRef`, `HyperframesOutputRef`,
  `HyperframesRenderStatusProjection.outputRefs`,
  `HyperframesRenderStatusProjection.polling`,
  `HyperframesFinalCompositeConfig.shots`,
  `HyperframesFinalCompositeConfigSchema`,
  `CreateHyperframesFinalCompositeInput.config`, and
  `CreateHyperframesFinalCompositeOutput`.

## Exact Starter Preset Ids

Treat these ids as a contract checklist copied from `spec.md`. Implementation
must not rename, collapse, or replace them with family-level placeholders.

Overlay presets:

- `hf_text_hook_kinetic_slam_ecommerce_v1`
- `hf_text_title_gradient_product_pop_v1`
- `hf_text_spec_electronics_stack_v1`
- `hf_text_price_badge_pop_ecommerce_v1`
- `hf_text_price_particle_burst_deal_v1`
- `hf_text_social_review_card_v1`
- `hf_text_lower_third_creator_v1`
- `hf_text_marker_highlight_sweep_v1`
- `hf_text_title_texture_mask_premium_v1`
- `hf_text_title_parallax_behind_product_v1`
- `hf_text_title_blend_difference_auto_contrast_v1`
- `hf_text_title_morph_word_chain_v1`
- `hf_text_caption_emoji_pop_family_v1`
- `hf_text_process_website_scan_label_v1`
- `hf_text_cta_terminal_command_v1`
- `hf_text_hook_comic_hype_word_v1`

Subtitle presets:

- `hf_subtitle_classic_box_v1`
- `hf_subtitle_minimal_shadow_v1`
- `hf_subtitle_creator_pop_v1`
- `hf_subtitle_karaoke_word_highlight_v1`
- `hf_subtitle_tiktok_red_sweep_v1`
- `hf_subtitle_pill_karaoke_v1`
- `hf_subtitle_marker_highlight_sweep_v1`
- `hf_subtitle_lower_third_v1`
- `hf_subtitle_cinematic_wide_v1`
- `hf_subtitle_neon_glow_v1`
- `hf_subtitle_review_bubble_v1`
- `hf_subtitle_none_v1`

Music presets:

- `hf_audio_music_tense_cinematic_opener_v1`
- `hf_audio_music_lofi_tutorial_bed_v1`
- `hf_audio_music_upbeat_ecommerce_social_v1`
- `hf_audio_music_premium_luxury_minimal_v1`
- `hf_audio_music_warm_mother_baby_v1`
- `hf_audio_music_ai_tech_momentum_v1`

SFX presets:

- `hf_audio_sfx_whoosh_scene_transition_v1`
- `hf_audio_sfx_button_click_tap_v1`
- `hf_audio_sfx_notification_message_pop_v1`
- `hf_audio_sfx_cash_register_sales_moment_v1`
- `hf_audio_sfx_riser_impact_reveal_v1`
- `hf_audio_sfx_extraction_ping_data_detect_v1`
- `hf_audio_sfx_keyboard_typing_loop_v1`
- `hf_audio_sfx_soft_shutter_capture_pulse_v1`
- `hf_audio_sfx_completion_chime_v1`
- `hf_audio_sfx_error_warning_buzz_v1`

Audio packs:

- `hf_audio_pack_ecommerce_fast_cut_v1`
- `hf_audio_pack_tutorial_calm_v1`
- `hf_audio_pack_ai_tech_launch_v1`
- `hf_audio_pack_premium_product_luxury_v1`
- `hf_audio_pack_mother_baby_friendly_v1`
- `hf_audio_pack_sales_revenue_proof_v1`

## Implementation Notes

Keep the existing `HyperframesFinalCompositeConfig` as compatibility input.
Introduce a richer `HyperframesCreativePlan` and a bridge from legacy flat config
to registry ids. Store both `legacyFinalCompositeConfigHash` and
`creativePlanHash` during migration.

Model product truth and ad-policy safety as first-class input to creative plans.
Feature 120 should consume persisted evidence and AI insight refs; it must not
perform render-time LLM or web-search repairs.

Do not import HyperFrames runtime packages from shared files.

## Acceptance Criteria

- Shared tests pass.
- Server and client can import schemas without pulling worker-only packages.
- Existing Feature 119 tests still parse old final composite configs.
- New registry ids and aliases are deterministic.
- Capability projection can explain why a preset is selectable, disabled, or
  unsupported.

## Rollback Notes

The section is additive. Rollback by disabling Feature 120 registry exports and
keeping existing final composite schema intact.
