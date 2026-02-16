# Section 08: Rollout SLO Gates, Rollback, and Operational Runbooks

## Objective
Define and operationalize phased rollout controls for the funnel dashboard with measurable SLO gates, clear rollback triggers/actions, and explicit owner response expectations.

## Scope
- Define go/no-go rollout gates for latency, error rate, and reconciliation mismatch.
- Define phased enablement sequence from internal admins to domain admins.
- Define rollback triggers, action ordering, and post-rollback verification checks.
- Define operational ownership and escalation windows for critical alert classes.
- Codify canary validation and fallback anomaly review before scope expansion.

## Out of Scope
- Implementing core router/service logic.
- Implementing dashboard UI components.
- Writing final comprehensive verification suite (section 09).

## Dependencies
- section-05-admin-dashboard-route-tabs-and-export-ux
- section-06-backfill-checkpointing-reconciliation-and-consistency-gates
- section-07-security-rbac-tenant-scope-and-privacy-controls

## Implementation Tasks
1. Codify rollout phases and environment-specific feature-flag enablement policy.
2. Attach explicit numeric/qualitative thresholds for API p95 latency, error rates, and reconciliation drift tolerance.
3. Build canary validation checklist and required evidence artifacts per phase.
4. Create rollback playbook with trigger matrix and immediate mitigation actions.
5. Define post-rollback verification steps covering auth, credit, chat, and scope-safety smoke checks.
6. Record owner assignments and response windows for reconciliation mismatch, leakage, and SLO breach alerts.
7. Require fallback anomaly review completion before domain-admin rollout expansion.

## TDD-First Test Stubs
- Test: rollout gate evaluator blocks phase advancement when any threshold fails.
- Test: rollback workflow disables flag and halts backfill in correct order.
- Test: phase promotion requires completed canary validation artifact set.
- Test: domain-admin rollout cannot proceed without fallback anomaly review sign-off.
- Test: alert policy metadata includes required owner and response window fields.

## Risk Controls
- Prevent manual override of failed gates without explicit documented exception path.
- Keep rollback actions simple and executable under incident pressure.
- Ensure runbooks are versioned alongside feature artifacts.

## Deliverables
- Rollout gate policy and phase-by-phase runbook.
- Rollback and post-rollback verification playbook.
- Operational ownership/escalation matrix tied to critical alerts.

## Done Criteria
- Rollout and rollback procedures are explicit, testable, and reviewable.
- Alert classes have owners and response windows.
- Canary and fallback review gates are enforceable before expansion.

---

## Implementation Summary

### Files Created
1. `apps/web/server/services/funnelRollout.ts` - Rollout phases, SLO thresholds, gate evaluation, rollback logic (315 lines)
2. `apps/web/server/services/funnelRollout.test.ts` - Tests for gate evaluation and rollback triggers (16 tests)
3. `docs/runbooks/funnel-dashboard-rollout.md` - Comprehensive rollout runbook with phase procedures, checklists (377 lines)
4. `docs/runbooks/funnel-dashboard-ownership.md` - Operational ownership matrix with alert response procedures (433 lines)

### Files Modified
- `apps/web/server/routers/funnelAnalytics.ts` - Added feature flag integration with `isFunnelEnabled()` check

### Rollout Configuration
**Phases Defined**:
- Phase 0: Disabled (pre-rollout)
- Phase 1: Internal (canary - admins only)
- Phase 2: Domain Admin (admin + domain_admin)
- Phase 3: General Availability (all users)

**SLO Thresholds**:
- Canary: p95<3s, error<5%, drift<10%, cache>60%
- Production: p95<2s, error<1%, drift<5%, cache>70%

**Rollback Triggers** (5 defined, prioritized):
1. Cross-tenant exposure (IMMEDIATE)
2. SLO breach 3+ gates (IMMEDIATE)
3. Reconciliation divergence (HIGH)
4. Export abuse (HIGH)
5. Cache stampede (MEDIUM)

### Operational Ownership
**Alert Classes Defined**: 8 alert classes with owners, response windows, and escalation paths
- Cross-tenant exposure: 15min response
- SLO breach: 30min response
- Reconciliation drift: 1hr response
- Export abuse: 2hr response
- Cache issues: 4hr response

### Test Coverage
- **Unit Tests**: 16 tests (gate evaluation, threshold validation, rollback triggers)
- **Integration Tests**: Deferred (would require complex mocking)
- **Total**: 16 tests passing

### Code Review Findings Addressed
- ✅ Made `executeRollback()` functional (P0)
- ✅ Added feature flag integration to funnel router (P0)
- ✅ Added error handling for rollback failures (P0)
- ⏸️ Monitoring/metrics automation deferred (requires infrastructure team)
- ⏸️ Automated gate evaluation deferred (depends on metrics)
- ⏸️ Integration tests deferred (complex mocking)

### Scope and Limitations
- **Implemented**: Policy definitions, procedures, reference code, rollback execution
- **Deferred**: Full monitoring automation, metrics collection, automated gate evaluation
- **Rationale**: Section-08 focuses on defining policies and procedures. Automation can be added incrementally during rollout phases.

### Rollout Readiness
- ✅ Phase definitions with clear exit criteria
- ✅ SLO gates defined and testable
- ✅ Rollback procedures documented and functional
- ✅ Ownership matrix complete with response windows
- ✅ Canary validation checklist (30+ items)
- ✅ Fallback anomaly review template
- ⏸️ Metrics collection (manual for Phase 1, automate during Phase 2)
- ⏸️ Monitoring alerts (configure during Phase 1)
