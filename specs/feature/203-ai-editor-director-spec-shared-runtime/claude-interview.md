# Deep-plan interview transcript — Spec 203

This plan follows the user's explicit request to complete the plan and
implementation, then run at least ten review rounds and fix discovered gaps.
The existing Spec 203 contract and current repository state supply the domain
answers that are not otherwise available.

## Q1 — Which system owns project and execution truth?

**Answer / applied decision:** Spec 203's server-authoritative ProjectRevision,
TimelineRevision, ProjectExecutionSnapshot, and canonical `worker_jobs` plus
outbox own truth. Web and Worker are clients/execution agents, not authorities.

## Q2 — How should degraded evidence be treated?

**Answer / applied decision:** Diagnostic and visible, but not approved,
executable, or render-ready. Promotion requires full evidence and freshness
checks; an explicit future human override must record actor, reason, warning,
and provenance.

## Q3 — What proof is required before claiming parity?

**Answer / applied decision:** Focused contract and integration tests are
necessary but insufficient for browser, Windows Worker, deployment, or
production claims. Those require their respective environment evidence and are
kept as release gates.

## Auto-decisions

- Preserve the existing shared media protocol and extend it versionedly rather
  than create a second job envelope.
- Use tenant-derived authorization, signed asset references, bounded retries,
  and idempotency for all server writes.
- Keep unsupported composition scan on the Node adapter until a real Worker
  executor and exact claim capability are implemented and tested.
