# Spec 270 plan self-review — round 1

Reviewer stance: skeptical platform architect. Compared `claude-plan.md`, `claude-plan-tdd.md`, `claude-spec.md`, interview/research notes, source discoveries and repository restrictions.

## Findings and repairs

1. **Durability before DDL was underspecified.** `worker_artifacts` is job-owned with cascading lifecycle. Plan now explicitly blocks schema work until a non-job-owned artifact owner, backups/recovery, deletion and reference closure are demonstrated; adapter-only work may proceed.
2. **Provider work could overrun available proof.** Plan now scopes adapter verification to mocks, keeps all external flags false, forbids credential lookup/live calls, and labels provider certification external.
3. **Possible duplicate authority.** Plan names Spec 224, 256, 261 and 269 boundaries and forbids duplicate queues, approvals, capability registry or execution authority.
4. **UI plan needed implementation contracts.** UI contract now includes routes, ownership map, state/responsive matrices, localization, accessibility, Astryx constraints and browser evidence.
5. **Unclosed spec registry gate.** Repository has no canonical registry. Keep 270 provisional; local filename uniqueness cannot prove global uniqueness.

## Scorecard

| Category | Result | Evidence |
|---|---|---|
| Structural integrity | PASS | Seven gated phases and seven matching TDD phases |
| Completeness vs spec | PASS WITH EXTERNAL GATES | Native/provider-neutral, lineage, resolver, 224/256, UI and lifecycle included; schema ownership, registry and live-provider certification remain explicit gates |
| Implementability | PASS WITH G0 | Concrete boundaries, no DDL while owner is unknown, focused suite strategy |
| Internal consistency | PASS | Native-first, default-off flags and no-legacy constraints consistent throughout |
| Edge cases | PASS | Tenant isolation, stale evidence, cancellation, offline, recovery, rights and provider failures included |

## Decision

No unresolved implementation ambiguity justifies delaying native contract and resolver work. Storage migration, provider enablement and external certification stay blocked until their named evidence gates close.
