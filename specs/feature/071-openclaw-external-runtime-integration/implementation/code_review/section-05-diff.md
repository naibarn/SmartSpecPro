# Diff Notes: Section 05 - Scheduler, Billing, and Artifact Publication

- Added `workerBillingService` for reservation and reconciliation with the new `worker_runtime` credit source type.
- Added `workerSchedulerService` with capability-aware OpenClaw routing, tenant rollout gating, and an operator kill switch.
- Added `workerArtifactService` for validated artifact publication into SmartSpecPro-owned library/indexing flows.
- Wired worker job terminal events into billing reconciliation and artifact publication from the worker registry service.
