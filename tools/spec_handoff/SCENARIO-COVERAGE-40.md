# Canonical Handoff 40-Case Scenario Matrix

Framework scenarios below are checked by focused unit, lifecycle, and skill-contract tests. Repository facts that depend on the post-recovery Spec set remain explicitly waiting; passing an isolated unit fixture does not certify the current or recovered repository inventory.

| # | Expected behavior | Framework evidence | State |
|---:|---|---|---|
| 1 | Fully superseded incomplete Spec is not continued; history remains | `test_full_supersession_requires_manual_decision_and_preserves_implementation_history` | FRAMEWORK_PASS |
| 2 | Partial supersession preserves residual requirements | `test_partial_supersession_retains_open_residual_scope` | FRAMEWORK_PASS |
| 3 | Age does not obsolete runtime-referenced work | `test_age_metadata_does_not_change_continuation_policy`; `test_code_and_test_mentions_are_evidence_only` | FRAMEWORK_PASS |
| 4 | Newness does not establish relevance or authority | `test_age_or_newness_does_not_choose_a_winner` | FRAMEWORK_PASS |
| 5 | Completion artifact cannot complete a Spec | `test_completion_rejects_completion_file_only_state`; `test_completion_artifact_never_auto_completes_and_emits_requirement_ledger` | FRAMEWORK_PASS |
| 6 | Stale verification remains incomplete | `test_completion_rejects_stale_verification_sha` | FRAMEWORK_PASS |
| 7 | Missing implementation mapping requires reconciliation | `test_missing_implementation_mapping_stays_reconciliation_required` | FRAMEWORK_PASS |
| 8 | Duplicate revisions remain ambiguous without a winner | `test_duplicate_spec_revision_surfaces_authority_conflict_without_selecting_winner` | WAITING_POST_RECOVERY_INVENTORY |
| 9 | Equivalent implementation is not inferred from references alone | `test_runtime_reference_does_not_claim_equivalent_requirement_satisfaction` | WAITING_POST_RECOVERY_INVENTORY |
| 10 | Intentionally removed legacy feature is not revived | `test_retirement_requires_rationale_and_evidence`; `test_retired_specs_are_excluded_from_implementation_queue` | WAITING_POST_RECOVERY_INVENTORY |
| 11 | Current security obligations remain visible | security-root review and requirement mapping | WAITING_POST_RECOVERY_INVENTORY |
| 12 | All applicable requirements with exact-SHA proof can close | `test_all_applicable_requirements_with_fresh_exact_sha_can_complete` | FRAMEWORK_PASS |
| 13 | Required deployment evidence gates completion | `test_completion_rejects_missing_deployment_and_acceptance` | FRAMEWORK_PASS |
| 14 | Supersession does not mark residual requirements failed | `test_full_supersession_requires_manual_decision_and_preserves_implementation_history` | FRAMEWORK_PASS |
| 15 | Retired work is excluded from implementation backlog | `test_retired_specs_are_excluded_from_implementation_queue` | FRAMEWORK_PASS |
| 16 | Multiple successor candidates are represented without authority inference | `test_explicit_multi_successor_and_requirement_edges_are_candidates` | FRAMEWORK_PASS |
| 17 | Reconciliation rerun is idempotent | `test_rerun_is_idempotent` | FRAMEWORK_PASS |
| 18 | Manual authority/disposition survives reconciliation | `test_manual_disposition_is_preserved`; `test_manifest_writer_persists_explicit_disposition_across_reconciliation` | FRAMEWORK_PASS |
| 19 | Discovered record count equals global index count | `test_every_discovered_record_appears_once_in_global_index` | WAITING_POST_RECOVERY_INVENTORY |
| 20 | Every canonical Spec appears exactly once | `test_every_discovered_record_appears_once_in_global_index` | WAITING_POST_RECOVERY_INVENTORY |
| 21 | Open applicable requirement blocks completion | `test_open_requirement_prevents_complete` | FRAMEWORK_PASS |
| 22 | Incomplete status alone does not require continuation | `test_incomplete_does_not_imply_continue_required` | FRAMEWORK_PASS |
| 23 | Do-not-continue needs rationale and evidence | `test_retirement_requires_rationale_and_evidence` | FRAMEWORK_PASS |
| 24 | Reconciliation does not fabricate historical timestamps | `test_changed_spec_marks_existing_evidence_stale_and_does_not_fake_dates` | FRAMEWORK_PASS |
| 25 | Changed normative Spec invalidates stale evidence | `test_changed_spec_marks_existing_evidence_stale_and_does_not_fake_dates` | FRAMEWORK_PASS |
| 26 | Stale generation, digest, or canonical SHA writes are rejected | `test_stale_generation_is_rejected`; `test_stale_spec_digest_is_rejected`; `test_stale_canonical_sha_is_rejected` | FRAMEWORK_PASS |
| 27 | Resume consumes the canonical continuation capsule | `test_planning_to_resume_flow_uses_one_manifest_and_exact_sha`; `test_resume_preserves_exact_unresolved_and_prohibited_work` | FRAMEWORK_PASS |
| 28 | Processed sections cannot close an open requirement | `test_all_sections_processed_cannot_close_an_open_requirement` | FRAMEWORK_PASS |
| 29 | Repeated no-progress retries escalate strategy | `AutonomousCompletionPolicyTests.test_repeated_no_progress_changes_strategy` | FRAMEWORK_PASS |
| 30 | Resource wait queues checks and continues independent work | `AutonomousCompletionPolicyTests.test_waiting_unit_does_not_hide_ready_independent_work`; lifecycle scenario DWF-03 | FRAMEWORK_PASS |
| 31 | Checkpoint stages only task-owned paths | `test_checkpoint_skills_stage_only_task_owned_paths` | FRAMEWORK_PASS |
| 32 | Planner schedules remaining requirements when some work exists | `skills/deep-plan/tests/test_task_storage.py::test_partial_state_generates_remaining_tasks`; lifecycle scenario DWF-05 | FRAMEWORK_PASS |
| 33 | Safe substitute avoids a false external blocker | `AutonomousCompletionPolicyTests.test_only_allowlisted_true_blockers_stop`; lifecycle scenario DWF-06 | FRAMEWORK_PASS |
| 34 | Genuine product ambiguity remains a human decision | lifecycle scenario DWF-07 | FRAMEWORK_PASS |
| 35 | Recoverable destructive work uses backup/recovery | lifecycle scenario DWF-08 | FRAMEWORK_PASS |
| 36 | Unrecoverable external destructive work is a true blocker | lifecycle scenario DWF-09 | FRAMEWORK_PASS |
| 37 | Generated status drift is detected | `test_generated_status_manual_drift_is_detected` | FRAMEWORK_PASS |
| 38 | Canonical manifest decisions survive legacy artifacts/config | `test_manual_decision_survives_inference_seed_rerun`; `test_completion_artifact_claim_does_not_become_authority` | FRAMEWORK_PASS |
| 39 | Integration state records the exact canonical SHA | `test_cross_skill_lifecycle_persists_deployment_and_resume_in_one_handoff`; `test_planning_to_resume_flow_uses_one_manifest_and_exact_sha` | FRAMEWORK_PASS |
| 40 | Verification and required deployment evidence bind to exact SHA | `test_cross_skill_lifecycle_persists_deployment_and_resume_in_one_handoff`; `test_completion_rejects_stale_verification_sha`; `test_completion_rejects_missing_deployment_and_acceptance` | FRAMEWORK_PASS |

## Result

- Framework behavior: 34 cases pass in focused tests/contracts.
- Post-recovery inventory confirmation: cases 8, 9, 10, 11, 19, and 20 wait for the recovered Spec set to be uploaded, validated, and integrated. No repository classification is inferred from invented Spec fixtures.
- Resume predicate: `Recovered/canonical Spec set has been uploaded, validated, and integrated into canonical ref`.
