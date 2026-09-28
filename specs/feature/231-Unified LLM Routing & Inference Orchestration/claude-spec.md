# Spec 231 implementation brief (derived, not a replacement for `spec.md`)

## Goal

Build the SmartAIHub policy-first hybrid LLM router and inference execution control. Existing traffic remains on its established path until each consumer independently passes a release gate. Routine `AUTO` selection is automatic among qualified, authorized candidates; it does not require the user to pick a provider for each request.

## Authority boundaries

- Spec 220: identity, policy, privacy, locality, credential ownership and revocation.
- Spec 222: advisory historical effectiveness and learning; never eligibility authority.
- Spec 224 plus PostgreSQL `worker_jobs`/outbox: durable development lifecycle and long-running execution owner.
- Spec 229: retrieval/evidence only.
- Existing SmartAIHub credit service: reservation, debit, credit conversion and settlement.
- Spec 231: inference intent, eligible route planning, model/deployment qualifications, attempt evidence, provider adapters, inference-specific evaluation and route operations.
- Separate provisional Redis migration topic is not an LLM route and is not migrated/promoted by this feature.

## Required behavior

1. Apply emergency revocation, platform policy, tenant/provider/residency, principal lock/credential owner, workflow sensitivity, capabilities/surface, qualification/health, deadline and budget as hard filters before any third-party call.
2. Use strict `SAH-INFERENCE-2` contracts with trusted principal/tenant binding, bounded payloads, USD micro-cost ceilings, explicit endpoint/tool/modality needs, request idempotency and version negotiation.
3. Produce an immutable plan tied to `spec_uid`, policy, registry, model/deployment, API surface, credential binding, pricing/FX, route manifest and rollout bundle revisions.
4. Distinguish intended and observed model/provider/deployment, committed stream output, actual usage/charge and uncertainty. Unknown execution/charge is not treated as success or zero cost.
5. Preserve explicit model/provider/local/platform selection. Automatic fallback only uses explicitly preapproved equivalent candidates and is blocked after stream/effect commit unless a certified state handoff is supported.
6. Route inline and durable work with one execution owner. Durable jobs use canonical `worker_jobs`/outbox, never a new queue or ledger authority.
7. Make evaluation/shadow/training separately consented and lineage-tracked; never expose protected content to a second model without its own egress authorization.
8. Keep a deterministic certified baseline, typed failure outcomes and rollback/incident controls. Advanced learned routing remains off until comparative gates pass.

## User-authorized operating expectation

The user has authorized the implementation team to choose routine architecture, technical approach and route policy without asking for confirmation at each step. This means normal route decisions should be automatic, explainable and bounded by pre-approved policy. It does not authorize bypassing security, spending beyond a budget, changing an explicit model lock, moving private data to a new recipient, or executing a high-risk tool effect without its existing required consent/approval.

## Non-goals

- Replacing or cloning Spec 220 authorization, Spec 222 learning authority, Spec 224/`worker_jobs`, Spec 229 retrieval, the credit ledger, tool execution/approval, external harness selection or local Runner ownership.
- Global route cutover in one release.
- Turning on classifier/semantic/learned routing or shadow replay before consent, provenance, evaluation and cost gates pass.
- Claiming provider account capability, live migration, production readiness, or production cutover from local code/tests.

## Source of detailed requirements

The immutable source is `spec.md` R4 Sections 69–88, together with compatible R2/R3 Sections 28–68 and the baseline sections they supersede only where no conflict exists. R4 prevails over older contradictory content.
