# Canonical Spec Handoff Contract

This is the shared Spec lifecycle contract for this repository. The implementation in `tools/spec_handoff/` and the schemas under `tools/spec_handoff/schemas/` are the semantic authority. Skills and task-local files are consumers; they do not define another Spec-level status engine.

## Authority boundaries

- `spec.md` is the normative intent and requirement source.
- `handoff/manifest.json` is the canonical authority, disposition, lifecycle, continuation, evidence, blocker, integration, verification, deployment, acceptance, and resume state.
- `handoff/requirement-ledger.json` is the canonical requirement-level closure record. Every intermediate row has a `next_action`.
- `handoff/STATUS.md` is generated from the manifest and ledger. Never edit it as source data.
- `handoff/history.jsonl` records observed transitions and reconciliation snapshots. Never invent historical timestamps.
- `specs/_status/*` are generated repository-wide projections. Their records must equal dynamic inventory records exactly once.
- Completion eligibility is derived by the shared policy kernel. A section count, commit, completion document, integration, build, or deployment by itself cannot set overall completion.

Disposition, implementation lifecycle, and continuation are independent dimensions. Age, Spec number, filename, revision number, or file timestamp cannot choose authority or justify retirement/continuation. Relationships found by text search are candidates until evidence or an authoritative decision resolves them. Unproven cases remain `DORMANT_UNRESOLVED` / `RECONCILIATION_REQUIRED` with evidence and a next action.

## SmartSpecPro writer API

Run from the repository root; use `specs/_config/handoff-roots.toml` and never maintain a Spec-ID allowlist.

```bash
python3 -m tools.spec_handoff --repo "$REPO_ROOT" inventory --dry-run
python3 -m tools.spec_handoff --repo "$REPO_ROOT" init --spec-dir "$SPEC_DIR" --write
python3 -m tools.spec_handoff --repo "$REPO_ROOT" reconcile --spec-dir "$SPEC_DIR" --write
python3 -m tools.spec_handoff --repo "$REPO_ROOT" update --spec-dir "$SPEC_DIR" \
  --expected-generation "$GENERATION" --expected-spec-digest "$SPEC_DIGEST" \
  --expected-canonical-sha "$CANONICAL_SHA" --changes-json "$CHANGES_JSON"
python3 -m tools.spec_handoff --repo "$REPO_ROOT" requirement-update --spec-dir "$SPEC_DIR" \
  --expected-manifest-generation "$MANIFEST_GENERATION" \
  --expected-ledger-generation "$LEDGER_GENERATION" \
  --expected-spec-digest "$SPEC_DIGEST" --expected-canonical-sha "$CANONICAL_SHA" \
  --requirement-id "$REQUIREMENT_ID" --changes-json "$REQUIREMENT_CHANGES_JSON"
python3 -m tools.spec_handoff --repo "$REPO_ROOT" status --global --filter CURRENT_INCOMPLETE
python3 -m tools.spec_handoff --repo "$REPO_ROOT" validate --all
python3 -m tools.spec_handoff --repo "$REPO_ROOT" index --write
```

`init`, `reconcile`, and `index` are dry-run unless `--write` is supplied. Writers use atomic file replacement where practical and optimistic checks for manifest generation, ledger generation, normative Spec digest, and canonical SHA. A `STALE_WRITE` means reload the manifest/ledger, reconcile a changed Spec, recompute the intended delta, then retry with fresh expected values. Never retry stale payloads unchanged.

Every implementation, verification, deployment, acceptance, and integration proof records its exact source/canonical SHA and evidence path. A requirement may be `PASS` only with implementation evidence and fresh verification evidence bound to the current canonical SHA. Deployment and acceptance remain separate obligations where required. `completion_eligible` is a read-only derived result.

## Planning, execution, and resume

For a new canonical Spec, write normative requirements first, then initialize its handoff before planning implementation. For a legacy Spec without a handoff, reconcile and backfill; missing handoff during migration is not a feature failure. Planners map work sections to ledger requirement IDs and plan only unsatisfied deltas. Implementers update requirement evidence through the shared writer; processed sections do not close requirements automatically.

Before resume, load the canonical manifest and ledger, verify digest/generation/current canonical SHA, then consume `continuation.next_ready_workunit`, `next_action`, waiting/reactivation predicates, `resume_point`, open requirements, attempted/prohibited strategies, blockers, and evidence freshness. Local plan/progress/completion files remain supporting evidence. Session finish persists the resume capsule through the manifest writer. Integration records the exact canonical ref/SHA and may invalidate only affected evidence. Generated status and global views are regenerated from canonical records.
