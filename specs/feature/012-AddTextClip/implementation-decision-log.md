# Implementation Decision Log

## 2026-02-15

- section: `section-01-contract-validation-foundation`
- options_considered: `allow_all_text_effects`, `strict_parity_effect_subset`
- decision: `strict_parity_effect_subset`
- mode_used: `auto`
- rationale: Plan and section objective require deterministic parity; unsupported effects are now rejected during validation.

- section: `section-01-contract-validation-foundation`
- options_considered: `default_reject_unsupported_contract`, `always_downgrade`, `gated_downgrade`
- decision: `default_reject_unsupported_contract + gated_downgrade_when_no_text_semantics`
- mode_used: `auto`
- rationale: Matches plan policy to prevent silent text data loss while allowing safe non-text compatibility fallback.

- section: `workflow-preflight`
- options_considered: `stop_on_dirty_tree`, `proceed_on_dirty_tree`
- decision: `proceed_on_dirty_tree`
- mode_used: `asked`
- rationale: User explicitly instructed to proceed on top of existing workspace changes.

- section: `section-02-editor-timeline-t1`
- options_considered: `inline_component_logic`, `shared_text_timeline_utility`
- decision: `shared_text_timeline_utility`
- mode_used: `auto`
- rationale: Consolidating T1 creation, move-guard, and overlap rules into a pure utility made section behavior testable without brittle component-level drag tests.

- section: `section-02-editor-timeline-t1`
- options_considered: `prevent_overlap_all_tracks`, `allow_text_overlap_only`
- decision: `allow_text_overlap_only`
- mode_used: `auto`
- rationale: Section objective requires overlap-allowed text behavior with deterministic array ordering while preserving non-text anti-overlap safeguards.

- section: `section-02-editor-timeline-t1`
- options_considered: `show_all_effect_controls`, `strict_parity_effect_controls_only`
- decision: `strict_parity_effect_controls_only`
- mode_used: `auto`
- rationale: Keeps editor interaction layer aligned with capability matrix and prevents unsupported options from entering timeline state.

- section: `section-03-text-authoring-keyframes`
- options_considered: `ui_plus_schema_easing_overrides`, `schema_first_with_existing_ui`
- decision: `schema_first_with_existing_ui`
- mode_used: `auto`
- rationale: Section objective can be met with deterministic persistence/interpolation semantics first, while keeping UI complexity controlled and parity-safe.

- section: `section-03-text-authoring-keyframes`
- options_considered: `reject_invalid_property_overrides`, `drop_invalid_and_fallback_to_segment`
- decision: `drop_invalid_and_fallback_to_segment`
- mode_used: `auto`
- rationale: This preserves backward compatibility for malformed payloads while guaranteeing deterministic behavior.

- section: `section-04-preview-parity-engine`
- options_considered: `render_text_in_timeline_layer`, `render_text_in_preview_player`
- decision: `render_text_in_preview_player`
- mode_used: `auto`
- rationale: Keeps preview parity logic colocated with active clip timing/transition state and reuses existing transform interpolation flow.

- section: `section-04-preview-parity-engine`
- options_considered: `render_without_font_readiness_gate`, `wait_for_fontset_then_render`
- decision: `wait_for_fontset_then_render`
- mode_used: `auto`
- rationale: Deterministic font readiness avoids transient parity drift from late font loads.

- section: `section-04-preview-parity-engine`
- options_considered: `hide_text_when_no_base_video`, `render_text_on_empty_preview_stage`
- decision: `render_text_on_empty_preview_stage`
- mode_used: `auto`
- rationale: Preserves text preview behavior for text-only timelines and avoids misleading blank preview states.

- section: `section-05-render-pipeline-ass`
- options_considered: `single_pass_filter_graph_integration`, `two_pass_text_burnin_after_base_render`
- decision: `two_pass_text_burnin_after_base_render`
- mode_used: `auto`
- rationale: Lower integration risk for this section while still enforcing canonical ASS output and deterministic fallback behavior.

- section: `section-05-render-pipeline-ass`
- options_considered: `broad_drawtext_eligibility`, `strict_equivalence_gate`
- decision: `strict_equivalence_gate`
- mode_used: `auto`
- rationale: Conservative acceptance criteria avoids preview/render parity drift and ensures ASS remains canonical unless equivalence is explicit.
