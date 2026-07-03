# Plan To Spec Traceability Review

Date: 2026-07-02

## Verdict

The deep-plan is substantially aligned with `spec.md` and is implementation-ready after the updates in this review.

Material gaps found and fixed:

1. Billing/cost controls were present only indirectly. Added explicit billing, budget, and SLO requirements to `claude-plan.md` and Section 05.
2. Security/governance controls were present only indirectly. Added explicit security and governance requirements to Section 08.
3. Product metrics and environment/config release gates were under-specified. Added explicit gates to `claude-plan.md` and Section 09.
4. Shadow mode comparison metadata, preview token policy, and manually reviewed golden quality fixtures were not explicit enough. Added them to `claude-plan.md`, `claude-plan-tdd.md`, Section 02, and Section 09.

## Traceability Matrix

| Spec Area | Plan Coverage | Section Coverage | Status |
|---|---|---|---|
| Current state: simulated Redis/Agency flow | `claude-research.md`, `claude-plan.md` Objective | Sections 02, 03, 05 | Covered |
| OpenAI Agents SDK as primary runtime | Plan Waves 4-5 | Sections 04, 05 | Covered |
| Do not create second SDK bridge | Plan dependency policy | Section 04 | Covered |
| Chat-origin Hybrid independent from Agency | Plan Waves 3, 6, 8 | Sections 03, 06, 07 | Covered |
| Direct image/video/prompt-enhance routing wins | Plan Waves 1, 7 | Sections 01, 06, 09 | Covered |
| Stage executor registry | Plan Waves 1, 5, 9 | Sections 01, 05, 08 | Covered |
| Durable persistence beyond Redis | Plan Wave 2 | Section 02 | Covered |
| State machine/resume/cancel/retry | Plan Waves 3, 5, 8 | Sections 03, 05, 08 | Covered |
| Python adapter Hybrid surface and role graph | Plan Wave 4 | Section 04 | Covered |
| SDK version upgrade and exact pinning | Plan Wave 4 | Sections 04, 09 | Covered |
| Node/Python current/current-1 compatibility | Plan Waves 1, 4, 9 | Sections 01, 04, 09 | Covered |
| Neutral `/hybrid` workspace | Plan Wave 8 | Section 07 | Covered |
| Private chat / Work OS hidden states | Plan UI contract | Section 06 | Covered |
| Approval UX and durable checkpoint | Plan Waves 8-9 | Sections 07, 08 | Covered |
| Commit executor allowlist and idempotency | Plan Wave 9 | Section 08 | Covered |
| Billing and cost controls | Plan Wave 10 update | Sections 05, 07, 08, 09 | Covered after update |
| Security and governance | Plan Wave 10 update | Sections 04, 08, 09 | Covered after update |
| Product metrics and SLOs | Plan Wave 10 update | Section 09 | Covered after update |
| Shadow mode comparison metadata | Plan Wave 10 update | Section 09 | Covered after update |
| Preview token policy | Plan Wave 4 update | Section 02 | Covered after update |
| Manual golden quality review | Plan Wave 10 update | Section 09 | Covered after update |
| Replay/evaluation fixtures | Plan Wave 10 | Sections 01, 09 | Covered |
| Rollout, rollback, operator playbook | Plan Wave 10 | Section 09 | Covered |
| Definition of Done | `claude-plan.md` Section 13 | Section 09 gates | Covered |

## Remaining Non-Blocking Watch Items

1. Section 02 intentionally leaves the final choice between new `hybridExecutions` tables and mapping to existing generic runtime tables for implementation discovery. This matches the spec's open question and is acceptable.
2. First commit executor choice remains constrained to safe options but not fixed. This matches the spec's open question.
3. The plan does not yet create `rollout.md` or `operator-playbook.md`; Section 09 owns those during implementation.

## Handoff Quality Pass

Additional improvements applied after the traceability review:

1. Added `claude-plan.md` Section 14, a spec coverage and handoff matrix that maps product requirements to owning implementation sections and blocking gates.
2. Added `claude-plan.md` Section 15, an implementation risk register for routing false positives, SDK contract drift, durable store migration risk, duplicate side effects, shadow-mode safety, trace/privacy exposure, billing drift, and operator recovery gaps.
3. Added `claude-plan.md` Section 16, deep-implement readiness notes covering sequencing, non-parallelizable state-machine work, adapter reuse, direct-route release gates, executor security, and rollout artifact ownership.
4. Added `sections/index.md` spec coverage by section and sequencing notes so implementers can see evidence expectations before opening individual section files.

This closes the main handoff weakness from the first review: the plan now states not only what to implement, but also where each spec requirement is owned, what evidence proves it, and which risks must be watched during implementation.

## Checks Run

- `check-sections.py --planning-dir specs/feature/130-hybrid-flow-openai-agents-sdk-runtime`
- `check-ui-contracts.py --planning-dir specs/feature/130-hybrid-flow-openai-agents-sdk-runtime`

Both passed before this review file was written. The modified plan/section files are documentation-only changes.
