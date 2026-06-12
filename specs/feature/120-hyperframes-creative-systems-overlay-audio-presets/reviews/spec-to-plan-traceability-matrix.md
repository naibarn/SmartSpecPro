# Spec To Plan Traceability Matrix

Date: 2026-06-12

This matrix maps Feature 120 spec areas to the deep-plan artifacts that own
implementation detail and tests.

| Spec Area | Plan Owner | Coverage |
|---|---|---|
| 1-4 Executive summary, problem, goals, non-goals | `claude-plan.md`, section 09 | Additive Feature 119 extension, no prompt-only renderer, rollout gates |
| 5 Creative system model | sections 01, 04, 05, 06 | Preset identity, variables, preview, composition, manifest |
| 6 Preset registry | section 01, `claude-plan-tdd.md` | Ids, versions, aliases, lifecycle, capability, prompt metadata |
| 7 Overlay presets and electronics specs | sections 01, 04, 05, 09 | Spec overlays, preview differences, fallback capability, fixtures |
| 8 Subtitle presets | sections 01, 04, 05, 09 | Independent subtitle presets, burn-in, word/highlight styles, snapshots |
| 9 Audio/SFX presets | sections 01, 04, 06, 09 | Audio roles, packs, SFX trigger/timing, volume, ducking, license/source |
| 9.7 Evidence-bound copy | sections 01, 03, 05, 09 | Product truth hashes, claim evidence, stale facts, user edit checks |
| 10.1-10.3 Creative plan, variables, manifest | sections 01, 03, 05, 06 | Creative plan hash, variables hash, manifest, runtime profile |
| 10.4 Library metadata | section 07 | Existing source reuse, creative metadata, idempotency |
| 10.5 Runtime status projection | sections 03, 06, 07 | Completed requires playable final video URL and content hash |
| 10.6 Provenance binding | sections 02, 03, 06 | Product/run/storyboard identity, no fallback guessing |
| 10.7 Shot assignment persistence | sections 02, 04, 06 | Server-owned assignments, refresh persistence, render blocking |
| 10.8 Storage and concurrency | section 02 | JSON subdocument first, revision conflict, companion-table gate |
| 10.8.1 Migration discipline | sections 02, 08, 09 | Dry-run, backfill, dual-read/write, rollback, cleanup tests |
| 10.9 Feature access/credit/rollout | section 03 | Existing flags, Admin Tenant metadata, credit idempotency |
| 10.10 Legacy cleanup | sections 02, 08 | Audit, repairable/delete-only classification, Library protection |
| 10.11 Runtime API surface | section 03 | Preset list, scoped state mutation, final render guards |
| 10.12 Runtime capability/version | sections 01, 03, 06, 09 | Producer/fallback gating, runtime version diagnostics |
| 10.13 Contract compatibility | sections 01, 05, 09 | Preserve v1, artifact/output enum compatibility, migration tests |
| 11 UX | section 04 | Collapsed panel, controls, editable text, preview, output actions |
| 11.6 Copy/accessibility/responsive | sections 04, 09 | Thai/English copy, keyboard, reduced motion, viewport evidence |
| 12 Composition builder | section 05 | Data attributes, GSAP timeline, sanitizer, no async/fetch |
| 12.1 Fallback boundary | sections 05, 06 | FFmpeg/ASS partial support and explicit capability reports |
| 12.2 Timeline normalization | sections 05, 06, 07 | Shared timeline hash for preview/render/audio/QA/Library |
| 13 Asset/storage | sections 05, 06, 07, 08 | Audio assets, staged manifest, artifact kinds, retention |
| 14 QA validation | sections 05, 06, 09 | Visual, audio, schema, snapshot, browser evidence |
| 15 Security/compliance | sections 01, 03, 05, 06, 08 | Sanitizer, asset staging, instruction firewall, diagnostics redaction |
| 16 Migration plan/work packages | `sections/index.md`, all sections | 9 executable deep-plan sections |
| 17 Acceptance criteria | `claude-plan-tdd.md`, sections 01-09 | Test-first coverage, release gate script availability, Feature 119 disabled-flag regression, and rollout gates |
| 18 Open questions | `claude-plan.md`, section 09, `reviews/open-question-decision-log.md` | Decision gates and required decision record before enabling unresolved capabilities |
| 19 Codebase alignment | `claude-research.md`, sections 01-09 | Existing files reviewed and preserved |
| 20-21 Research and long-term direction | `claude-plan.md`, sections 05, 09 | HyperFrames data attributes, variables, Studio/player, future upgrades |

## Keyword Coverage Addendum

The plan explicitly covers these spec keywords and phrases to avoid relying on
implicit interpretation during implementation:

- prompt intent, staged assets, QA results, output artifacts
- commercial product videos and long-term adapter
- product-category-aware, electronics/spec, price/deal, social proof
- classic box, karaoke word highlight, highlight sweep, creator pop, cinematic
  wide
- deterministic preview, preserve native audio, audio clipping, exact duration
- preset lifecycle, historical outputs, candidate to active, canary tenants
- agent-authored template generation, future HyperFrames Studio, manifest
  traceability
- audio-reactive text, complex masking, safe fallback mode, worker queueing
- polite live regions, mandatory disclosure, repair action, safe labels
- operator replay and purge
- arbitrary tenant-authored HTML rejection, no manual audio control JavaScript,
  custom React preview trusted-player boundary, raw signed/private URL redaction,
  SFX starter pack and music generation decisions, and thumbnail policy
- exact starter preset ids from spec sections 7, 8, and 9: 16 overlays, 12
  subtitles, 6 music presets, 10 SFX presets, and 6 audio packs
- exact contract/schema symbols for creative variables, preset timing/safe-area
  policies, audio events, render manifests, QA results, Library metadata, shot
  assignments, artifact/output refs, status projection output refs, final
  composite config/schema, and create-final-composite input/output
- exact runtime/provenance terms:
  `MARKETPLACE_HYPERFRAMES_RUNTIME_READY`, `marketplace_capture_field`,
  `marketplace_auto_review_runs.storyboardReviewId`, `marketplaceContext`, and
  `hyperframes-credit:{tenantId}:{runId}:{renderIntent}:{compositionInputHash}:{templateVersion}:{platformPresetId}`
- exact Feature 119 compatibility names for contract version, access flags,
  capability fields, runtime API procedures, outbox fields, artifact kinds,
  output kinds, HyperFrames data attributes, timeline fields, and Storyboard
  Review state keys.
- remaining exact enum/field coverage for audio roles, `policyRulePackRef`,
  `preserveNativeAudio`, `runtimeCapabilityHash`, `styleBrief`, platform
  profile ids, raw enum copy leakage, and lifecycle timestamps.
- release gate command parity with `apps/web/package.json`, dependency-audit and
  doctor fail-closed behavior, and Feature 119 regression evidence with Feature
  120 creative flags disabled.
- open-question decision log gating for SFX starter pack, music generation,
  karaoke timing, producer path, and HyperFrames Studio/player preview.

## Exact Preset Id Traceability

`section-01-shared-creative-contracts-and-registry.md` now owns the exact
starter preset id checklist. `claude-plan-tdd.md` requires registry tests to
assert every id exists exactly once, belongs to the correct category, and is not
replaced by family-level placeholders.

The checklist covers:

- overlays: `hf_text_hook_kinetic_slam_ecommerce_v1`,
  `hf_text_title_gradient_product_pop_v1`,
  `hf_text_spec_electronics_stack_v1`,
  `hf_text_price_badge_pop_ecommerce_v1`,
  `hf_text_price_particle_burst_deal_v1`,
  `hf_text_social_review_card_v1`, `hf_text_lower_third_creator_v1`,
  `hf_text_marker_highlight_sweep_v1`,
  `hf_text_title_texture_mask_premium_v1`,
  `hf_text_title_parallax_behind_product_v1`,
  `hf_text_title_blend_difference_auto_contrast_v1`,
  `hf_text_title_morph_word_chain_v1`,
  `hf_text_caption_emoji_pop_family_v1`,
  `hf_text_process_website_scan_label_v1`,
  `hf_text_cta_terminal_command_v1`, and
  `hf_text_hook_comic_hype_word_v1`;
- subtitles: `hf_subtitle_classic_box_v1`,
  `hf_subtitle_minimal_shadow_v1`, `hf_subtitle_creator_pop_v1`,
  `hf_subtitle_karaoke_word_highlight_v1`,
  `hf_subtitle_tiktok_red_sweep_v1`, `hf_subtitle_pill_karaoke_v1`,
  `hf_subtitle_marker_highlight_sweep_v1`,
  `hf_subtitle_lower_third_v1`, `hf_subtitle_cinematic_wide_v1`,
  `hf_subtitle_neon_glow_v1`, `hf_subtitle_review_bubble_v1`, and
  `hf_subtitle_none_v1`;
- music: `hf_audio_music_tense_cinematic_opener_v1`,
  `hf_audio_music_lofi_tutorial_bed_v1`,
  `hf_audio_music_upbeat_ecommerce_social_v1`,
  `hf_audio_music_premium_luxury_minimal_v1`,
  `hf_audio_music_warm_mother_baby_v1`, and
  `hf_audio_music_ai_tech_momentum_v1`;
- SFX: `hf_audio_sfx_whoosh_scene_transition_v1`,
  `hf_audio_sfx_button_click_tap_v1`,
  `hf_audio_sfx_notification_message_pop_v1`,
  `hf_audio_sfx_cash_register_sales_moment_v1`,
  `hf_audio_sfx_riser_impact_reveal_v1`,
  `hf_audio_sfx_extraction_ping_data_detect_v1`,
  `hf_audio_sfx_keyboard_typing_loop_v1`,
  `hf_audio_sfx_soft_shutter_capture_pulse_v1`,
  `hf_audio_sfx_completion_chime_v1`, and
  `hf_audio_sfx_error_warning_buzz_v1`;
- audio packs: `hf_audio_pack_ecommerce_fast_cut_v1`,
  `hf_audio_pack_tutorial_calm_v1`, `hf_audio_pack_ai_tech_launch_v1`,
  `hf_audio_pack_premium_product_luxury_v1`,
  `hf_audio_pack_mother_baby_friendly_v1`, and
  `hf_audio_pack_sales_revenue_proof_v1`.

## Review Notes

- The plan intentionally keeps `social_variant_package` rollout-gated until
  evidence exists.
- Creative sidecars map to existing Feature 119 artifact kinds first.
- Runtime capability and package-version checks are implementation gates, not
  optional documentation.
- Evidence-bound copy is a blocker, not just a QA warning, when claims cannot be
  safely tied to persisted evidence.

## Exact Compatibility Names Addendum

The latest review added exact-name coverage so implementation cannot silently
rename existing Feature 119 contracts while adding Feature 120:

- contract/version and copy source:
  `HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION`,
  `hyperframes_marketplace_auto_review_v1`, `product_truth`,
  `marketplace_capture_field`, `ai_insight_evidence`, `user_edit`,
  `policy_disclosure`, and `derived_summary`;
- feature access: `canStartAuto`, `canPreview`, `canCancel`,
  `canSaveToLibrary`, `canInspectAsOperator`, `canReplayAsOperator`,
  `flags.enabled`, `flags.tenantAllowed`, `flags.workerEnabled`,
  `flags.librarySaveEnabled`, `flags.operatorEnabled`, and
  `flags.templateAllowlist`;
- runtime API: `marketplaceCapture.createHyperframesFinalComposite`,
  `marketplaceCapture.getHyperframesRenderJob`,
  `marketplaceCapture.repairHyperframesRenderJob`,
  `marketplaceCapture.cancelHyperframesRenderJob`,
  `marketplaceCapture.saveHyperframesRenderToLibrary`,
  `marketplaceCapture.listHyperframesTemplates`,
  `videoEditorProjects.updateStoryboardReviewHyperframesState`, and
  `videoEditorProjects.getStoryboardReview`;
- composition/timeline: `data-start`, `data-duration`, `data-media-start`,
  `data-track-index`, `data-overlay-preset`, `data-subtitle-preset`,
  `window.__timelines[compositionId] = tl`, `shotId`, `shotIndex`,
  `absoluteStartSec`, `absoluteEndSec`, `timelineHash`, and
  `timelineVersion`;
- outbox/artifacts/outputs: `compositionInputHash`, `compositionHtmlHash`,
  `templateId`, `templateVersion`, `templateContentHash`, `platformPresetId`,
  `platformPresetVersion`, `renderIntent`, `compositionMode`,
  `runtimeProfileHash`, `creativePlanHash`, `presetManifestHash`,
  `audioEventMapHash`, `fallbackQuality`, `hyperframes_input_json`,
  `hyperframes_composition_html`, `hyperframes_snapshot`,
  `hyperframes_render_mp4`, `hyperframes_render_webm`,
  `hyperframes_subtitle_vtt`, `hyperframes_manifest`,
  `hyperframes_sanitized_log`, `preview_video`, `final_video`, `snapshot`, and
  `library_item`.
- remaining exact names: `<audio>`, `transition_sfx`, `ui_sfx`, `accent_sfx`,
  `policyRulePackRef`, `preserveNativeAudio`, `runtimeCapabilityHash`,
  `styleBrief`, `generic_vertical_9_16`, `tiktok_reels_shorts_9_16`,
  `fallback_quality`, `producer_ready`, `smoke_only`, `createdAt`, and
  `deletedAt`.
