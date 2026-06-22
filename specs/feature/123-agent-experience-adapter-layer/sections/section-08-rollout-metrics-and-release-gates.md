# Section 08: Rollout Metrics And Release Gates

## Objective

Operationalize rollout evidence, metrics, canary stages, waiver policy, doc-sync guard, reviewer signoff, and release artifacts.

## Dependencies

- sections 01-07 as applicable

## Scope

- Add or document parse/fallback/reconnect/approval/artifact/cost/debug/bridge metrics.
- Create release evidence artifacts.
- Add doc-sync guard or manual checklist.
- Add canary gate and waiver validation.
- Add launch decision log requirements.

## Files To Add

- `specs/feature/123-agent-experience-adapter-layer/release-evidence.md`
- `specs/feature/123-agent-experience-adapter-layer/rollback-drill.md`
- `specs/feature/123-agent-experience-adapter-layer/threat-model.md`
- `specs/feature/123-agent-experience-adapter-layer/launch-decision-log.md`
- `specs/feature/123-agent-experience-adapter-layer/performance-baseline.md`
- `specs/feature/123-agent-experience-adapter-layer/alert-triage-matrix.md`
- optional docs-contract validation script/test if implementation chooses executable doc-sync

## Required Metrics

- adapter parse success rate;
- adapter fallback rate;
- stream reconnect rate;
- time to first token/event;
- approval completion and expiry/abandonment rate;
- artifact open/download error rate;
- cost confirmation abandonment rate;
- debug inspector access denial count;
- Runtype bridge error rate when enabled.

Required performance baselines:

- adapter parse overhead;
- timeline append/update overhead;
- time to first token/event compared with existing surface baseline;
- shadow-mode overhead;
- artifact preview load behavior;
- debug inspector expansion cost;
- external renderer bundle impact when evaluated.

## Canary Stages

- `fixture_only`
- `shadow_internal`
- `preview_internal`
- `selected_tenants`
- `ramp_25`
- `ramp_50`
- `ramp_100`

Hard aborts:

- cross-tenant exposure;
- billing finalization from client state;
- approval accepted without backend confirmation;
- secret/signed URL leak;
- rollback failure;
- adapter parse success below gate.

Required surface adoption gates:

- fixture preview before shadow mode;
- shadow mode before live preview;
- live preview before default replacement;
- per-surface fallback to legacy/default UI;
- no default replacement in MVP unless a later decision log explicitly expands scope.

Required threat model coverage:

- malformed source streams;
- cross-tenant references;
- debug payload exposure;
- approval spoofing or replay;
- billing/cost manipulation;
- artifact XSS or privileged URL leak;
- external renderer supply-chain risk;
- fixture/log leakage;
- deferred page-action privilege escalation.

## UI/UX Contract

### Target User / JTBD

- Release owners need clear rollout, rollback, and evidence requirements before any Agent Experience surface becomes visible.

### Surface Inventory

- Rollout checklist.
- Metrics documentation.
- Future admin/customer preview enablement surfaces.

### Component Map

- No new component required in this section.
- Future rollout UI must reuse existing feature flag/admin controls.

### State Matrix

- all flags off;
- shadow mode only;
- internal preview enabled;
- canary enabled;
- rollback forced;
- metrics missing;
- acceptance evidence missing;
- existing Persona feature collision detected.

### Responsive Matrix

- No new layout required for documentation-only gates.
- Any future enablement screen must preserve existing admin responsive behavior.

### Accessibility Acceptance

- Rollout state and rollback status must be available as text.
- Metrics dashboards or admin controls must not rely on color-only status.

### Copy Contract

- Release copy uses `Agent Experience`.
- Existing product `Persona` terminology remains reserved for the current Persona feature only.
- No customer-facing `Runtype` naming unless approved in a later product decision.

### Browser Evidence Required

- Required before Stage 2 or Stage 3 visible preview rollout.
- Evidence must include mobile 390x844, tablet 768x1024, desktop 1440x900, disabled state, error state, and rollback state.

## Tests/Evidence First

- Test or checklist: release evidence fails if required command results are missing.
- Test or checklist: waiver without `waiver_id`, gate, reason, owner, expiry date, mitigation, revisit trigger, and impacted rollout stage fails.
- Test or checklist: expired waiver blocks stage progression.
- Test or checklist: waiver cannot bypass cross-tenant safety, approval integrity, billing authority, secret redaction, or rollback readiness.
- Test or checklist: doc-sync catches missing fixture inventory entries.
- Test or checklist: schema change without changelog is blocked.
- Test or checklist: doc-sync catches missing flag entries, waiver entries, dependency gate report, launch decision log, and section mapping.
- Test or checklist: surface adoption criteria are recorded before live preview.
- Test or checklist: compatibility coverage records streaming, tool calls, approvals, artifacts, themes, debug, credits, errors, mobile layout, access control, i18n, accessibility, rollback, and external bridge when enabled.
- Test or checklist: performance baseline exists before live preview.
- Test or checklist: alert/triage ownership exists before tenant beta.
- Test or checklist: launch decision log records stage, decision, owner, timestamp, next gate.
- Evidence: rollback drill records detect/decide/execute/verify.

## Acceptance Criteria

- Release artifacts exist or are marked not applicable for current stage.
- Waiver policy is enforceable.
- Canary gate criteria are documented.
- Reviewer/signoff model is recorded for beta/ramp stages.
- Tenant beta cannot proceed with missing doc-sync evidence.
- Tenant beta cannot proceed without threat model, rollback drill, performance baseline, alert/triage ownership, waiver status, and evidence-linked reviewer signoff.
