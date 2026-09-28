# Feature 196 implementation evidence

## Section status

- section-01-contracts-and-command: implemented provider-neutral command, Goal, capability, plan, approval and Job-definition contracts.
- section-02-goal-plan-persistence: not activated; no generic Goal/Plan persistence was added because the current schema does not expose a confirmed shared persistence mapping. This remains a migration/product integration gate.
- section-03-capability-resolution: implemented the provider-neutral offer shape and policy input boundary; existing capability catalog remains the source of catalog data.
- section-04-planner-policy-and-approval: implemented deterministic plan hashing, policy decisions and stale approval rejection.
- section-05-gateway-and-ui: implemented the server-side gateway handoff; the inline Task Control tab in the app-wide `AI Chat & Feedback` surface safely returns tasks to the existing Chat composer, while `/chat` remains the full-page entry. Generic Goal/Plan persistence and visual plan/approval cards still require endpoint/runtime integration evidence.
- section-06-cross-spec-release: implemented the contract-matrix test and release boundary documentation.

## Evidence

Focused orchestration suite: 4 tests passed. Handoff calls the existing
`createControlPlaneJob` gateway and never submits directly to a provider.

## 2026-09-18 implementation audit corrections

- Capability Offers now carry an explicit `offerId`, and compiled Plan Steps
  preserve `selectedOfferId` through the canonical Job input for provenance and
  policy evaluation.
- Multi-step submission derives a distinct idempotency key per step and maps
  Plan step dependencies to predecessor Job IDs before admission.
- Plan hash is revalidated at approval and Job-definition construction; policy
  cost is calculated only from the selected Offers.
- Malformed page context and plan metadata are rejected at the contract
  boundary. Goal/Plan durable persistence and visual UI evidence remain
  integration gates as stated above.
