# Synthesized Specification — Spec 278 R1.4

## Goal

Implement the SmartAIHub Durable Runner Execution Sessions & Recovery Fabric described in the source `spec.md`, with restart-safe local execution, truthful continuity classes, crash-safe persistence, secure recovery/fencing, ordered control, resource-aware placement, provider adapters, Task Control projections, and commercial execution evidence integration.

## Authorities and invariants

- `worker_jobs` remains canonical for job identity, lease, attempt, cancellation, approvals, and terminal settlement.
- Durable execution sessions are linked projections with append-only events and explicit session generations, authority epochs, placement epochs, continuity class, execution location, desired/observed state, and `job_control_revision`.
- Only reconciled and current authority may resume mutation. Recovery/adoption must be linearizable across control-plane instances.
- Local manifests, grants, receipts, checkpoints, and event outbox are durable, bounded, integrity checked, secret-free, and outside mutable workspace control.
- Session Host owns child process/PTY/stream mechanics, not scheduling, job completion, billing, approval, or authority renewal.
- Input ownership is explicit; output is bounded; updates negotiate required safety features before reattachment.
- Capability advertisement separates resource reservation from enforcement strength and driver continuity certification.
- Cloudflare Container/Sandbox snapshots can reconstruct filesystem state but cannot preserve live process memory; claims must remain bounded to certified behavior.
- Spec 280/ledger retain commercial decision and balance authority. Runner only emits verifiable metering evidence bound to pinned release and invocation lineage.

## Scope

Cover milestones M0–M8 and R1.4 commercial amendments in source Spec 278, including schema, local Rust Runner, Web control plane, migration, tests, and relevant Task Control projection. Implement incrementally and preserve existing ephemeral execution compatibility. Do not apply migrations to production or claim certification absent the prescribed environment-specific evidence.

## Required acceptance

Meet AC-01 through AC-40 in the source spec to the extent locally implementable. External certification tiers, provider guarantees, production deployment/DR, and multi-tenant release remain gated by real evidence; source-only substitutes do not close those gates.

## User direction

User requests the complete deep-plan followed by implementation of all generated sections, then at least ten explicit gap-review iterations. Every confirmed in-scope gap must be fixed immediately and reviewed again.
