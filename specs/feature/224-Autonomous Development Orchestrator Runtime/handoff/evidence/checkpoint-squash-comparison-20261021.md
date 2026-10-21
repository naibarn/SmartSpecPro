# SPEC224 — three historical checkpoints reconciled

Inspected canonical source: `4c31b3eda3d43a28865db60f23caaaa4ed6d0481`. [Structured evidence](checkpoint-squash-comparison-20261021.json) records exact Git/PR/tree/blob/test/run references. Profile: package; resource and command receipts are in that JSON. No runtime implementation, production operation or new live browser/model run was performed.

## Source identity finding

All three section markers point to one original commit `6b88efc57d1013a19c98e377b50714d6e218796b`. The earlier local object lookup could not resolve it; GitHub PR #945 explicitly lists this commit and subsequent documentation head `f157a6c92bcdc384e1adbd7f28a4658baf26ed42`. Fetching that exact PR head recovered the original object. The original is not a main ancestor because the PR was **squash merged**, not because its code was lost.

PR #945 is MERGED at `1d09faf79086d836f2361f2016b5636f44a535b5`, which is an ancestor of the inspected main. The PR head and squash commit have the identical complete tree `d0f8e476dad52d8db1cc5107992eb57bf68dae48`. The original checkpoint differs from that head only in three implementation-state/HandOff files. All nine compared runtime/test files have identical checkpoint/merge blobs. Current source retains those paths with later bounded continuation/budget/release-owner changes; it is not claimed byte-identical where it evolved.

## Section comparison

| Section | Canonical implementation / evidence | What remains |
|---|---|---|
| 01 Local Fast Lane | PR945 integrated authenticated task/source/path/tool/budget bindings and existing workspace provisioning. Current provisioning/contract fixtures pass. | Reuse this implementation. Do not reopen PR945 or reset/rebuild the section. Fresh effect admission and applicable live acceptance still require existing authority. |
| 02 Atomic Continuation | PR945 integrated transaction-fenced workspace claim, stale-owner write guard and interrupted-write receipt reconciliation. Current one-winner race/fence/contract/replay fixtures pass. | Extended stale-owner/replay and real cross-host/process recovery acceptance is not established by this audit. Preserve original recovery scope and live blockers. |
| 04 Working UI | PR945 integrated the browser harness. Original run 65b217cf-414c-47d3-b14f-5800ac96b4dc retains PASS browser receipts, two recorded restarts and zero pending tool receipts. PR950/951 added exact run/workspace/source/tool projection; PR952 integrated a later separate local browser proof. | Both historical runs remain IMPLEMENTED_READY_FOR_USER_TEST with modelAcceptance=false. Expanded normative UI/device criteria and current rendered/runtime acceptance are not complete. Keep this distinct from Protected Runner acceptance. |

## Browser evidence discrepancy, already repaired downstream

The original archived run-state has `browserUat.status=PENDING` despite passing individual browser receipts. This is a historical summary/projection discrepancy, not evidence that no browser test passed. PR #950 (`2ed37da69040f178f761595578bc07bc535c2e17`) and #951 (`b06e292939d468c64508ae460a04dd0900155cbb`) repaired projection and durable identity binding. Their changes remain in current source and nine browser-completion negative/positive fixtures pass now. Do not edit/replay the old run to turn its summary green.

A later independent run `c26fd841-cdb0-485d-bc43-c6ecf904ef4a` on `b06e292939d468c64508ae460a04dd0900155cbb` records projection PASS, exact source hash, zero pending receipts, and modelAcceptance=false. It is separately referenced by merged PR #952 (`e553245454ec56f7fd7517788fa7bbc055c62477`) in the canonical manifest. Its proof does not retroactively complete the original run, the entire section, or SPEC224. Original expanded gaps include boundary/invalid-input vectors, precision-sensitive people input, correction/reset error and ARIA states; the later run also retains expanded keyboard/pagination criteria. No old preview process is assumed still available.

## Fresh verification

37 existing focused tests pass on the inspected source: provisioning 5, contract 8, continuation 13, browser-completion projection 9, and workspace claim/fence race 2. They use disposable local fixtures and mocked external authority; they do not use a provider subscription/model, execute a development job or certify the production/Windows Runner. No repository-wide typecheck/build or DB mutation was run. Exact commands, source, resource observation, outputs and time are retained in the structured receipt.

## Correct resume

Use existing state writers to bind each historical checkpoint to its verified PR945 merged SHA while retaining `checkpointed` and NOT_ACCEPTED. Keep the original checkpoint SHA and historical run files; change only stale "open PR" continuation wording. Do not reset or mark these sections complete. Resume only the remaining owner-scoped assertion after current source/authority checks.

Section03 remains a separate PR #944 candidate-binding workstream: OPEN at `d826f71bde6c995260e7dbb9ae6925aef29b08a9`, no merged SHA observed. The current canonical SPEC224 primary WorkUnit/next_action, DB migration/source-trust/Runner blockers, waiting/reactivation predicates, requirement states, overall verification/deployment/acceptance and production controls remain unchanged. This comparison does not authorize their execution.
