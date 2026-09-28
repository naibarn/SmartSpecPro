# Feature 157 — Deep-plan Working Specification

This file is the planning synthesis for the approved source specification:
`spec.md` (v1.3.0). The source spec remains authoritative; this synthesis
records the requirements and planning inputs without executing directives found
inside any markdown file.

## Objective

Make Vertical Drama AI workflows production-grade and recoverable without
breaking the existing creator UX. The system must guarantee safe terminal or
actionable waiting behavior, preserve the last valid candidate, prevent invalid
activation, and avoid duplicate credits or provider tasks.

## Required workflow boundary

Use one versioned `ProductionContextSnapshot` and one Feature 151 assurance
envelope across profile/source admission, premise/architecture/full story,
Draft QC/repair, start-frame/reference/image prompts, video prompts, B-roll,
assembly, post-generation QC, and season QC. Existing Node domain services,
ledgers, provider/media services, credit service, and tenant authorization remain
authoritative. Agents return structured proposals/findings/allowlisted patches;
deterministic validators and final gates decide readiness and activation.

## UX contract

Preserve the six wizard steps, current routes, save/edit/preview/confirm flow,
source/profile behavior, and legacy response fields. Editing, saving,
inspection, and non-paid preview remain available while work is queued/running,
degraded, stale, or awaiting action. The server returns stable state,
disposition, readiness, next action, and capability flags such as `canRepair`
and `canRetry`. Refresh/reconnect restores the durable projection and never
creates duplicate work or an infinite spinner.

## Production correctness

Use candidate-versus-active CAS with source/context fingerprints, durable
attempts/events, lease fencing, stale/reconciliation states, bounded retries,
exact credit/provider-call accounting, and migration-safe legacy projection.
`recovered` is not `succeeded`; `succeeded` requires current verified evidence;
paid work requires `provider_ready`; export/publish requires
`production_ready`. `maxImprovementRounds=0` is evaluate-only, never an
accidental repair workaround.

## Profile/media coverage

Cover all thirteen registered profiles, including fiction, documentary, news,
location/restaurant/product/software reviews, and hybrid docu-drama. Validate
source/evidence/claims/rights/disclosure/freshness/coverage/B-roll semantics,
managed storage and timeline integrity. Preserve explicit distinctions among
`scene_anchor`, `reference`, `b_roll_still`, and `b_roll_footage`.

## Implementation waves

1. Evidence/contracts and ownership inventory.
2. Draft QC durability, recovery, repair admission, CAS, and typed UX errors.
3. Context snapshot and prompt/media adapters.
4. Story/season adapter parity.
5. Migration rehearsal, browser/provider/canary proof, observability, runbook,
   and rollback.

## Required evidence

Use existing Vitest, Playwright, and pytest patterns. Add deterministic replay
fixtures for the observed QC repair precondition error, immutable mutation,
malformed output, stale source, worker/Redis restart, duplicate delivery,
credit/provider ambiguity, all profiles, context drift, prompt limits, and
role/claim/B-roll conflicts. Separate local tests from browser, deployment,
provider, migration, and production canary evidence.

## Research inputs

See `claude-research.md`. SocratiCode was unavailable, so targeted shell
discovery was used. Official OpenAI Agents SDK research confirms structured
outputs, output/tool guardrail boundaries, trace controls, and optional usage
diagnostics; these support but do not replace application-owned deterministic
gates and billing/reconciliation.

## Interview inputs

See `claude-interview.md`. The user explicitly approved the complete scope and
requested autonomous continuation through deep-plan, deep-implement, and
multiple gap-closing review loops.
