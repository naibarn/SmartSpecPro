# Deep-Plan Interview Transcript

## Q1 — Scope and priority

**Question:** No additional domain question was required. The user explicitly requested a complete deep-plan for Spec 266, beginning with a research/provenance slice, then deep-implementing every section and performing at least ten post-implementation gap-review rounds.

**Answer:** The user's instruction is the scope contract. Proceed without pausing for routine technical choices.

## Auto-Decisions

- Preserve the Spec 266 R1.2 source text and the existing worktree's dirty files. Plan in the isolated Spec 266 branch/worktree.
- Treat existing 260/262 records as the current emergency/geospatial authority; implement only additive adapters/projections and never dual-write.
- Use PostgreSQL/Drizzle for canonical metadata and existing `worker_jobs` plus outbox for durable asynchronous work. Do not create another queue, scheduler, workflow engine, or job authority.
- Keep all external sources disabled until rights, endpoint, schema, freshness, placement, and attribution have server-owned approval evidence.
- Candidate parsing, model output, vector search, vendor traces, and artifact object references are not verification, authorization, canonical evidence, or rights proof.
- No database migration/schema edit while the checked-in `orchestra/.wave-active` indicates an active schema-owner wave. Implement schema-free code and record the dependent persistence work as blocked/deferred until the marker is cleared by its owner.
- Do not claim provider, migration application, deployment, runtime, or production proof without live evidence.
- Verification will be scoped to affected packages/files. Do not run repository-wide TypeScript typecheck under AGENTS.md.

## Unresolved Product Decisions

None found in the R1.2 spec that block local implementation planning. Operational/provider approvals remain external gates, not inferred product decisions.
