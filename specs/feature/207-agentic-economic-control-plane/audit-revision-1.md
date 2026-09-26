# Spec 207 — Repository Alignment Audit

Date: 2026-09-19
Status: Completed

This spec was reviewed in the fresh 20-round 207–210 cross-spec/codebase audit
documented in `orchestra/spec-audit-207-210-2026-09-19.md`.

Immediate repairs in Spec 207:

- added the actual `creditService.ts` / `creditTransactions` compatibility baseline;
- corrected companion ownership from legacy Spec 186 to current Features 195–197 and Spec 208;
- distinguished Redis credit reservations from the future canonical ledger;
- mapped economic references to the existing `workerJobs`/outbox/settlement boundary;
- bounded migration dual-write with event identity, reconciliation and removal criteria;
- preserved existing Credits, PromptPay, card and gateway compatibility.
- added explicit economic ownership boundaries for Spec 209 Workflow Studio and
  Spec 210 Orca/CLI runtime execution.

Spec 207 is still a target economic control plane. Existing credit code is not
evidence that multi-wallet routing, double-entry accounting, provider settlement
or Financial Calendar production behavior is complete.
