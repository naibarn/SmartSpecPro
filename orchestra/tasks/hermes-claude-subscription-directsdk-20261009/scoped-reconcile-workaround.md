# Scoped Handoff Reconciliation Method

## Finding

The official CLI `reconcile --spec-dir` path in `tools/spec_handoff/cli.py` calls `reconcile_one(..., inventory_record=record)` without `relationship_claims`, `source_references`, or `declared_claims` collected from the global dynamic inventory. In `tools/spec_handoff/reconcile.py`, this defaults relationship claims and source references to empty and rewrites current `authority.claims`, `relevance_assessment.active_references`, and `reconciliation.sources`. As a result, the first targeted CLI write removed current relationship/source projections from the seven target Handoffs even though JSON validation passed.

## Recovery

To avoid broad `reconcile --all` mutation, the same canonical `reconcile_one` writer was invoked only for the seven task-owned Specs with context built through the repository's supported functions: `inventory`, `build_relationship_graph`, `collect_source_evidence_for_inventory`, `collect_declared_claims`, `resolve_claim_targets`, and `collect_git_times`. A dry-run confirmed the refreshed counts before any recovery write. The task-specific conflict record and new conditional requirement rows are then reattached using `tools.spec_handoff update` and `requirements-batch-update`, respectively.

This preserves current graph/source evidence without reconciling unrelated Specs. It does not change the Handoff tool implementation; fixing CLI scoped context collection is a separate maintenance task. Original pre-task manifests and ledgers remain available at the worktree base SHA `05ffe1c9640fda1e3324514daaa456cb3f0d020a` in Git history; no history files were overwritten.

## Recovery result

Recovery completed for all seven owned Specs. Current claims/reference/source counts match the canonical context pass (200: 25/1/32; 224: 66/173/102; 231: 0/66/86; 267: 1/0/3; 269: 0/0/2; 272: 0/0/2; 277: 1/0/1). Task review evidence was reattached through the shared manifest writer, including the SPEC-231 identity conflict. Original authority, disposition, lifecycle, and continuation states remain unchanged. `index --check` and `validate --all` pass with 472 records, 314 canonical Specs, no missing Handoffs, no invalid manifests, and no generated-status drift.
