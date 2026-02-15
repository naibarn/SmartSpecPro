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

- section: `section-06-compatibility-font-fallback`
- options_considered: `silent_preview_font_fallback`, `emit_preview_font_diagnostics`
- decision: `emit_preview_font_diagnostics`
- mode_used: `auto`
- rationale: Deterministic fallback diagnostics reduce triage ambiguity without changing preview rendering behavior.

- section: `section-06-compatibility-font-fallback`
- options_considered: `inline_render_telemetry_fields`, `centralized_telemetry_builder`
- decision: `centralized_telemetry_builder`
- mode_used: `auto`
- rationale: Consolidating policy + font outcomes in one builder prevents drift across drawtext/ASS branches.

- section: `section-07-verification-hardening`
- options_considered: `new_production_hardening_logic`, `verification_matrix_expansion_tests_only`
- decision: `verification_matrix_expansion_tests_only`
- mode_used: `auto`
- rationale: Existing section 01-06 implementation already satisfied targeted hardening behavior; section objective is best served by expanding deterministic regression coverage without adding unnecessary runtime risk.

- section: `section-08-rollout-observability-runbook`
- options_considered: `env_only_rollout_gate`, `env_plus_runtime_canary_gate`
- decision: `env_plus_runtime_canary_gate`
- mode_used: `auto`
- rationale: Supports staged rollout control at deploy-time and runtime cohort level without requiring destructive migrations or feature rewrites.

- section: `section-08-rollout-observability-runbook`
- options_considered: `external_monitoring_only`, `repo_local_alert_evaluation_helpers`
- decision: `repo_local_alert_evaluation_helpers`
- mode_used: `auto`
- rationale: Provides deterministic, testable alert/rollback policy behavior in-repo while external dashboard wiring remains an ops follow-up.

- section: `post-implementation-hardening`
- options_considered: `plan_now`, `fix_now`, `defer`
- decision: `fix_now`
- mode_used: `asked`
- rationale: User selected immediate remediation for critical/high findings after mandatory security re-review.

- section: `post-implementation-hardening`
- options_considered: `frontend_gate_only`, `server_admission_gate_with_tenant_policy`
- decision: `server_admission_gate_with_tenant_policy`
- mode_used: `auto`
- rationale: Enforcing rollout policy at backend submission boundaries closes direct API bypass risk and makes the feature gate authoritative.
