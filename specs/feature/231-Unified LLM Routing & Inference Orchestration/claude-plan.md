# Spec 231 — Implementation plan for usable policy-first inference routing

## Outcome

Make one server-owned inference decision path usable by existing SmartAIHub consumers. Routine requests automatically select and execute a route under policy; callers do not need to approve every technical selection. Route selection is auditable and bounded. Existing user locks, security consent, budget, tool approvals and high-risk human gates retain their explicit contracts.

This plan implements Spec 231 R4 Sections 69–88 additively and follows the compatible R2/R3 contract. It does not assert production certification or a registry number allocation. `spec_uid` is the identity; the working number remains unresolved until the authoritative registry can be queried and reserved.

## Architectural invariants

1. Resolve trusted identity, authorization, privacy/locality, consent and emergency revocation before any external classifier, provider, gateway, evaluator or shadow call.
2. Candidate set is the intersection of platform, tenant/project, caller, credential owner, task, data-sensitivity, modality/endpoint, model qualification, health, deadline and budget policy. Soft scores cannot re-add filtered candidates.
3. Default `AUTO` deterministically chooses an eligible route and pre-approved fallback. A locked model/provider is preserved; an unavailable locked choice returns the caller's specified `none`/`ask` outcome, never an invisible substitution.
4. Plan, attempt, actual provider/model, stream commit, cost reservation/settlement, effect references and deployed route bundle are distinct evidence. Missing observations stay `UNVERIFIED`/`UNKNOWN_OUTCOME`.
5. Existing Spec 220 is the policy/credential authority, Spec 222 is advisory effectiveness, Spec 224 plus `worker_jobs`/outbox owns durable execution, Spec 229 owns retrieval, and the credit service owns charge/settlement.
6. No retry after ambiguous submission unless the provider's idempotency/replay contract is certified. No provider/model switch after committed stream output or committed tool effect without a valid state handoff.
7. Production promotion remains blocked by unresolved spec registry allocation and any missing credentials, migrations, provider surface, route pin, privacy consent, backup/recovery or external certification evidence.

## Initial repository file boundaries

The following are proposed owned paths for this plan. Confirm no newer implementation exists before each wave; do not replace the existing legacy path until the adapter tests pass.

| Contract / concern | Initial path | Existing boundary reused |
|---|---|---|
| V2 schemas, IDs and typed outcomes | `apps/web/server/services/inference/contracts.ts` | Zod and `llmProviderCatalog.ts` schemas |
| Trusted context and version negotiation | `apps/web/server/services/inference/compatibility.ts` | authenticated `llmRoutesHandler.ts` request context |
| Policy intersection, eligibility and reasons | `apps/web/server/services/inference/policyResolver.ts` | Spec 220 authority adapter; existing `providerHealth.ts` |
| Deterministic candidate selection | `apps/web/server/services/inference/planner.ts` | catalog/price projection; legacy `llmRouter.ts` behind an adapter |
| Plan/attempt storage and outbox | existing `apps/web/server/services/inferencePersistence.ts` or a focused `inference/` persistence module after schema inspection | Drizzle `schema.ts`, `worker_jobs`, `worker_job_outbox`, existing credit ledger |
| Route surface adapters | `apps/web/server/services/inference/adapters/` | existing provider implementations and Cloudflare runtime boundary |
| Chat compatibility integration | `apps/web/server/services/llmRoutesHandler.ts`, then route-specific callsites | `apps/web/server/_core/llmRoutes.ts` |
| Catalog and Admin operations | `apps/web/server/routers/llmProviders.ts`, `apps/web/client/src/pages/AdminLLMProviders.tsx` | existing admin permission and provider catalog |
| Pure/contract tests | `apps/web/server/services/inference/__tests__/` | Vitest |
| Disposable DB migration tests | adjacent `apps/web/drizzle/*` tests | repository disposable PostgreSQL integration setup |
| Caller/UID gate | focused `scripts/spec231/` or existing spec validation workflow after CI ownership audit | existing spec validation scripts/workflow |

### Contract boundary for the first implementation slice

`InferenceIntentV2` SHALL include the required §30 fields: contract/version, request/trace, trusted tenant/principal, consumer/run/task/purpose, input/output modalities, bounded token reserve, required features/tools, language, privacy/residency/ZDR, quality/risk/deadline, USD-micro maximum, selection lock, retrieval summary, policy revision, budget scope and idempotency key. Add R4 identity (`specUid`, `specRevision`), rollout bundle reference, logical call ID, owner epoch, parent ceiling, overall deadline, residency snapshot and router feature provenance to the immutable plan, never trust client values for these authorities.

The first policy resolver is pure and requires caller-supplied trusted authority snapshots. It has no provider I/O, DB writes, retries or fallbacks. Missing/stale authority produces a typed rejection. This makes it safe to integrate behind an opt-in, server-only rollout after its boundaries are verified.

### Request-to-receipt data flow

```text
authenticated consumer + bounded request
  -> compatibility adapter validates contract and resolves trusted scope
  -> Spec 220 / budget / caller policy snapshots
  -> pure policy resolver emits eligible candidates + exclusion reasons
  -> deterministic planner emits immutable plan + rollout/policy/registry pins
  -> canonical credit reservation + plan/attempt/outbox transaction
  -> exactly one execution owner dispatches the admitted surface
  -> adapter reports provider request + intended/observed identity + stream/effect state
  -> attempt owner fences terminal write; canonical credit service settles/reconciles
  -> consumer receives normalized output or typed uncertainty/degradation outcome
```

No external model/classifier/provider call occurs before policy admission and required budget reservation. If any owner is unavailable, its mandatory boundary returns a typed fail-closed result. Provider timeout after dispatch becomes `UNKNOWN_OUTCOME` unless a certified idempotency/query contract proves whether work ran.

### Persistence and rollout constraints

- Proposed logical tables are `model_profiles`, `model_deployments`, `router_policy_versions`, `inference_plans`, `inference_attempts`, `inference_evaluations` and `model_certification_runs`; each table is created only if an existing canonical table does not already own the same data.
- Add R3/R4 fields to existing plan/attempt records; use unique idempotency/logical-call keys and `(plan_id, ordinal)` attempt identity plus optimistic owner epoch/revision fencing.
- Never persist prompt, retrieved source, secret, signed URL or raw media bytes in plan/attempt/evaluation rows. Store scoped evidence refs, hashes and minimized reason codes.
- Migrations use additive expand/backfill/validate/activate phases. Old readers remain compatible until caller adoption; no destructive schema contraction in the first release. Test migration, lock behavior and rollback on a disposable DB clone with a verified backup.
- Admission/backpressure considers current tenant slots, expected queue wait, provider p95 and overall deadline. Planning/classifier calls are rate-limited and budget-capped to prevent cost amplification.
- Database/provider/credential/Cloudflare control-plane failures retain typed status and correlation ID; no token, raw provider response or protected prompt enters generic logs.

## Workstreams and dependency order

### Wave 0 — Identity, ownership and baseline freeze

- Inventory all LLM entrypoints, direct provider calls, caller task classes, current model/provider locks, request-body feature fields, billing hooks, streamed output and tool surfaces.
- Add stable immutable UID/revision references to all new Spec 231 artifacts and CI/reference checks that reject unqualified ambiguous `Spec 231` references.
- Preserve both LLM-routing and Redis-migration topics. Do not assign the Redis topic number 232 without live registry/branch/PR verification and one reviewed reservation transaction.
- Record an implementation baseline of focused router/catalog/routes tests and the repository's relevant TypeScript diagnostics under policy. Do not conflate baseline failures with new regressions.

**Exit:** consumer/source map; source-of-truth/owner map; UID/reference validator locally tested; external registry gate remains explicit.

### Wave 1 — `SAH-INFERENCE-2` contract and compatibility adapter

- Implement strict, bounded schemas for `InferenceIntentV2`, `InferencePlanV2`, attempt receipt, R4 extension, selection modes, typed failure outcomes and version negotiation.
- Resolve `tenantId`, `principalId`, caller, credential and pricing only from trusted server context. Reject conflicting client claims, secret-like content in evidence, unknown required R4 fields, unsupported v2 features and unbounded payloads.
- Define compatibility adapters for current chat/agent/workflow/provider calls. Preserve v1 fields and report unsupported v2 requirements; high-risk callers fail closed instead of being silently weakened.

**Exit:** contract tests for missing/unknown/oversized/conflicting values, legacy compatibility matrix and tenant binding.

### Wave 2 — deterministic admission and candidate selection

- Implement policy intersection in the specified order: emergency revocation; Spec 220 platform legal/security/privacy; tenant/project locality and provider allowlist; principal credential/model lock; run/workflow/skill policy and sensitivity; model/deployment qualification and capability; health; deadline; cost reservation.
- Normalize requests into trusted intent with bounded token/media estimates and required feature/surface constraints.
- Implement deterministic candidate elimination and scoring. Add reason codes for every eliminated candidate. Classifier, semantic, Spec 222 learned signal and experiment can only rank eligible candidates.
- Define exact AUTO, MODEL_LOCK, PROVIDER_LOCK, LOCAL_ONLY and PLATFORM_ONLY outcomes. Enforce pre-approved-equivalent fallback rules.

**Exit:** table-driven eligibility tests; privacy-before-classifier proof; no policy-bypass negative tests; deterministic repeatability and explanation receipt.

### Wave 3 — versioned model/deployment qualification

- Extend existing catalog instead of duplicating it: immutable model profile, provider deployment, endpoint surface, capabilities, credential owner, region/retention/ZDR, pricing snapshot/FX, certification state, route-manifest hash and health snapshot.
- Probe the provider API surface using authorized credentials in non-production/staging. Test actual structured output, tools, modalities, context, streaming, reasoning continuation and actual model attribution.
- Exclude unqualified, stale-price, unsupported-surface, unknown-owner or unhealthy profiles from AUTO routes by default.

**Exit:** per-model/deployment qualification evidence keyed to immutable revisions; exact endpoint/fidelity compatibility tests; no claims inferred from marketing catalog metadata.

### Wave 4 — immutable plan, attempts and canonical economics

- Persist inference plan/attempt and rollout-bundle evidence additively, reusing existing schema where it truly owns the same contract. Migration is additive, bounded-lock and backward-compatible; test on disposable DB first.
- Reserve a single parent cost ceiling through the existing credit authority before dispatch. Use integer USD micro-units plus versioned FX and canonical credit conversion; unknown prices are not zero.
- Record each attempt with one logical call, owner epoch, idempotency key, deadline, provider request IDs, stream sequence, actual identity, usage/charge evidence and typed terminal status.
- Reconcile timeout-after-submit/late usage as provisional or disputed; never double-capture, silently refund unknown liability or retry an ambiguous provider submission.
- Emit required durable events through the existing outbox. Do not add a second queue or finality state machine.

**Exit:** parallel admission cannot overspend; retry/idempotency and rollback tests; exact ledger/outbox links; crash/late-result reconciliation verified.

### Wave 5 — provider surfaces, route pinning and stateful handoff

- Add the Cloudflare AI Gateway adapter for compatible, authorized cloud routes and retain direct/native providers where required. Add Local Runner only through registered/authenticated capacity and owner/tenant capability snapshots.
- Bind each plan to a rollout bundle and prove Dynamic Route identity at dispatch and after execution. If exact immutable pin cannot be proved, return `ROUTE_PIN_UNAVAILABLE` and use only an authorized single-model/direct route where policy allows.
- Define state manifests for reasoning continuations, tool IDs/results, committed effect receipts, approvals, owner binding and model/provider portability. Only certified same-provider/surface migrations are automatic.
- Enforce stream ownership and hierarchical deadlines. Before first committed output, bounded certified fallback may be allowed. After commit, interruption is explicit; never silently restart the conversation on another model.
- Inline Worker streaming remains inline. Long-running inference goes through canonical `worker_jobs` plus outbox; Queue is transport, never a new job authority.

**Exit:** surface/route-pin tests; cross-provider continuation negative tests; stale epoch/replay/tool-effect tests; duplicate Queue delivery returns the same logical attempt; Worker crash/recovery proof.

### Wave 6 — consumer convergence and feature-specific routing

- Integrate one compatibility adapter at a time: public chat, internal chat, workflow/agent inference, RAG consumers, provider-specific JSON/image/audio/video tasks and external harnesses where the harness exposes a governed model call.
- Respect user model/provider lock and existing task-specific feature fidelity. Never reinterpret external harness selection as permission to move execution to a model API.
- Add per-consumer shadow comparison only for synthetic/redacted or explicitly consented samples. No raw protected prompt or evidence goes to a second model without independent egress authorization.
- Keep feature-specific providers and existing successful behavior until acceptance gates pass; no global cutover.

**Exit:** all source-level entrypoints mapped; every enabled consumer either routes through the shared contract or carries an approved, documented exception; no bypass caller remains unowned.

### Wave 7 — evaluation, learning, privacy and counterfactual correctness

- Build versioned golden datasets by language/task/modality/risk. Track actual outcomes separately from paired replay, judge estimates and unknown counterfactuals.
- Bind every eval/shadow/training artifact to tenant/user consent, purpose, source revision/ACL epoch, recipients, redaction, expiry/deletion and derivative tombstone policy.
- Add poison/outlier controls and minimum effective sample thresholds before Spec 222 or learned signals affect route scores. Learned router remains disabled unless it beats deterministic baseline on held-out strata and confidence bounds.

**Exit:** deletion/tombstone tests, consent enforcement, no invented counterfactual labels, offline comparison reproducible; no shadow leakage.

### Wave 8 — operator and user experience

- Admin UI manages versioned profiles, qualification, policy rollout, route bundle, drift/incident status and canary gates. It must show why candidates are included/excluded without raw prompt content.
- User UI defaults to AUTO and explains actual selected route according to privacy settings. Explicit model/provider choice maps to stable lock semantics and avoids per-call confirmation for normal eligible routes.
- Promote, rollback, emergency revoke, inspect and recovery actions are permissioned/audited. Changes are atomic bundle activations; old in-flight plans retain pinned bundle unless emergency fence applies.

**Exit:** UI/API authorization, tenant isolation, accessible responsive states, audit surfaces and route-reason tests.

### Wave 9 — certification, rollout and operational readiness

- Build the full conformance suite: R2 30 + R3 38 + R4 36 cases plus consumer-specific regression. Gate by `spec_uid` and contract revision.
- Exercise staging failover, billing authority loss, stale policy, Gateway route repoint, provider ambiguity, Worker timeout/crash, duplicate Queue delivery, stream interruption, regional route loss and rollback.
- Publish a signed rollout bundle with policy, model/deployment, certification, route manifest, FX/pricing, guardrail, contract versions and rollback artifact. Run deterministic baseline first, then one low-risk canary.
- Expand consumers incrementally only when all release gates for that consumer pass. Keep independent Redis migration and RAG index promotions separate.

**Exit:** independently reviewable staging/production evidence; no unresolved release-blocking test; rollback/recovery exercised; provider/account/admin owners approve the operational release package.

## Cross-cutting acceptance gates

- Security/privacy/locality/capability/budget constraints are hard filters before any external call.
- AUTO selects automatically when there is one or more qualified candidate; when there is none, it returns typed `NO_ELIGIBLE_ROUTE`/`POLICY_NOT_READY` rather than asking the user to choose a prohibited path.
- Explicit locks remain binding. Fallback never leaves the admitted equivalent set; compatibility loss requires consent or a typed refusal.
- Every planned route is immutable and every execution receipt reports intended and observed provider/model/deployment separately.
- Every paid attempt has an idempotent parent budget cap and traceable provider invoice evidence; unknown provider/usage remains provisional or disputed.
- Tool effects are authorized and committed by existing capability/approval authorities; inference replay returns an existing receipt rather than repeating side effects.
- Long-running work belongs to existing `worker_jobs`/outbox, and client disconnect does not create hidden background work.
- No raw prompt/source/asset/secret appears in route telemetry. Evaluation data requires separate consent and lifecycle evidence.
- No production-ready/cutover claim without live provider/API, database, route, billing and operational evidence.

## Prioritized implementation ledger

| Priority | Work | Current disposition |
|---|---|---|
| P0 | Spec UID/collision-safe plan and owner map | Start locally; live number reservation is external-gated. |
| P0 | `SAH-INFERENCE-2` schemas, trusted intent and strict version negotiation | First implementation wave. |
| P0 | Deterministic hard-filter admission and route reason receipts | Implement before feature routing or classifier. |
| P0 | Credential/tenant/price ownership, credit reservation and ambiguous-attempt correctness | Reuse existing owners; integration requires DB/provider proof. |
| P1 | Model/deployment qualification + route pin + actual provider attribution | Source work can proceed; provider verification is external-gated. |
| P1 | Stateful handoff, streams, deadlines, Worker/Queue continuation | Depends on canonical runtime and provider surfaces. |
| P1 | Consumer source map and controlled adapter adoption | Incremental; preserve current behavior. |
| P2 | Admin Inspector, rollout bundle, canary, incident/recovery drills | Requires contract/persistence. |
| P2 | Shadow, evaluator cascade, learned router, randomized experiments | Disabled until consent, corpus and measured-value gates pass. |

## External gates and ownership

- **Registry owner:** authoritative Spec UID/number reservation, branch/PR/worktree collision search and atomic alias migration.
- **Platform security owner:** live Spec 220 policy, credential ownership, tenant data classifications and emergency revocation snapshot.
- **Provider account owners:** scoped credentials, account entitlement, legal/data-region settings, invoice evidence and staging probe authorization.
- **Cloudflare owner:** AI Gateway route/version support, logging settings, route alias immutability and deployment/API credentials.
- **Database/release owner:** backup/restore evidence, disposable migration DB, lock/rollback plan, rollout/rollback bundle and production migration proof.
- **Evaluation/data owner:** consent scope, lawful use, retention/deletion and approved golden corpus.

No owner response is needed to continue repository-local contract/test work. External gates stop only the affected promotion, not unrelated implementation waves.
