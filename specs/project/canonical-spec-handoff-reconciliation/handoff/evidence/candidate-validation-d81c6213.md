# Candidate Validation Evidence

- Repository: `naibarn/SmartSpecPro`
- Canonical base fetched before reconciliation: `7c5e012be2efc3f14f6f4bd3d66d2024366845c9`
- Candidate worktree commit tested: `d81c6213d88c25cd75391a6935f8904bfd6d6c65`
- Branch: `codex/evidence-execution-reconcile-20261008`
- Scope: canonical Spec handoff inventory/projections and reconciliation regression suite.

## Results at the candidate SHA

- `python3 -m unittest discover -s tools/spec_handoff/tests -q`: PASS, 82 tests.
- `python3 -m tools.spec_handoff --repo . classifications --check`: PASS, 472 records, 0 unresolved classifications.
- `python3 -m tools.spec_handoff --repo . index --check`: PASS, 472 records / 314 canonical Specs, no global or per-Spec drift.
- `python3 -m tools.spec_handoff --repo . validate --all`: PARTIAL / exit 2. Inventory walk completed with 472 records / 314 canonical Specs; invalid manifests 0; generated status drift 0; global index equal. Missing canonical handoffs remain for SPEC-305, SPEC-306, and SPEC-307.
- `git diff --check`: PASS.

The three missing handoffs prevent claiming the repository-wide final migration gate passed. This candidate evidence does not certify runtime behavior, production deployment, UAT, or acceptance.
