# Section 08 — Reconciliation, targeted repair, and finale gate

## Scope

Extend quality-ledger reconciliation and Feature 152 validation/repair with
relationship-graph consistency and repair impact, central mystery closure,
cast/guest, world, wardrobe, and final causal checks.

## Owned paths

- `apps/web/server/services/verticalDramaQualityLedgerReconcile.ts`
- `apps/web/server/services/verticalDramaStoryGenerationValidation.ts`
- `apps/web/server/services/verticalDramaStoryGenerationRepair.ts`
- `apps/web/server/services/verticalDramaStoryBible.ts`
- relationship graph validator/repair service
- Feature 152 quality-loop/applySeasonCritique interception paths

## Design

Relationship validation includes inverse/symmetric rules, parent-cycle checks,
family-side and timeline consistency, disclosure/known-by alignment, and
provenance for derived in-law edges. Repair impact must use the reverse
dependency index and include immediate recap/cliffhanger/knowledge neighbors;
missing index coverage blocks repair. The finale gate checks graph closure in
addition to mystery, thread, cast, world, and wardrobe closure.

Deterministic checks run before skill critics. Relationship findings include
edge contradictions, invalid family side, disclosure/knowledge mismatch,
timeline impossibility, and unsupported derived kinship. Findings produce the
smallest graph-aware impact closure: affected nodes/edges, dependent episodes,
dialogue/knowledge/memory fields, and adjacent recaps/cliffhangers. Finale
blocks on unresolved central mysteries, orphan threads, unearned guests,
invalid world rules, look drift, source mismatch, safety, relationship graph
contradictions, or credit/provider uncertainty. Repairs create child candidates
and require fresh validation/approval semantics.

Run anti-drift reconciliation over the accepted horizon: repeated objectives,
cliffhangers, tactics, locations, low-curiosity hooks, and uneven character
agency become repair findings even when each individual episode passes schema
validation.

Activation must include a durable post-write read-back. If active status,
coverage, component/policy fingerprints, graph dependency index, memory
checkpoint, finalization key, credit reconciliation, or the benchmark result
fingerprint/reviewer-adjudication reference disagree, suppress success and
leave the candidate `awaiting_reconciliation`.

When the horizon is extended, create a new candidate and re-plan terminal
closure, affected arc exit states, and payoff windows before admitting new
blocks.

## TDD acceptance

- Episode-1 clue to finale answer passes only with evidence and consequence.
- Unresolved central mystery blocks.
- Guest payoff and late-cast causality are checked.
- Cross-episode repair validates neighbors without rewriting the whole season.
- Relationship graph repair proves every dependent episode and dialogue state is
  rechecked before candidate activation.

## UI/UX Contract

### Target User / JTBD

N/A — final-gate decision service; findings are displayed in Section 09.

### Surface Inventory

N/A.

### Component Map

N/A.

### State Matrix

N/A — gate outcomes use the existing server status taxonomy.

### Responsive Matrix

N/A.

### Accessibility Acceptance

N/A — no browser surface is changed here.

### Copy Contract

N/A.

### Browser Evidence Required

N/A — deterministic/service proof is sufficient for this section.

## Implementation notes

`evaluateLongFormClosure()` and reverse-index repair impact now block missing
episode coverage, unresolved mysteries/threads, unearned guests, world/look/
relationship findings, anti-drift findings, and missing benchmark finalization.
