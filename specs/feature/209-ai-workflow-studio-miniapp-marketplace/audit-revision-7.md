# Spec 209 Fresh Cross-Spec Audit — 2026-09-19

The fresh 20-round audit across Specs 207–210 is recorded in
`orchestra/spec-audit-207-210-2026-09-19.md`.

Immediate Spec 209 repair:

- Updated Revision 8.
- Expanded the repository baseline from `workerJobs`/outbox/dispatches to the
  complete current `workerJobs`, `workerJobAttempts`, `workerJobEvents`,
  `workerJobDispatches`, `workerJobOutbox` and `workerJobSettlements` contract.
- Explicitly retained the rule that Workflow Studio owns neither a queue, lease,
  event, settlement nor finality source of truth.

Current implementation remains partial; workflow persistence, compilation,
Marketplace and production mixed-version evidence remain release gates.
