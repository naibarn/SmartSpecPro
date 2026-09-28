# Spec 231 — Test-first implementation plan

## Test strategy

Use Vitest for shared Zod/TypeScript contracts, route eligibility, service orchestration and HTTP compatibility; use disposable PostgreSQL for migration, idempotency, budget, fencing, event/outbox and crash-recovery behavior; use Playwright for route/model-selection and Admin UI behavior; use pytest only for Python adapter compatibility. Do not call external providers from ordinary unit tests. External surface qualification runs only in an explicitly authorized staging probe with scoped credentials and redacted evidence.

Every behavioral change follows RED → GREEN → focused regression. Provider/Gateway semantics need recorded API revision, sanitized request/response fixtures, capability outcome and account/region context. Test fixtures must contain synthetic prompts or explicitly consented/redacted data.

## Wave 0 — Identity and baseline

- Test two `spec_uid` values can coexist while unqualified duplicate numeric references fail closed.
- Test stable UID+revision travels through plans and generated evidence.
- Test source reference scanner reports unresolved cross-spec UID/contract references.
- Capture focused baseline results for current router/catalog/routes tests and identify pre-existing diagnostics without changing them.

## Wave 1 — Contract and compatibility

- Test strict schemas reject missing, unknown, oversized, malformed and secret-like values.
- Test `tenantId`, `principalId`, provider account and price are server-resolved; conflicting client values fail.
- Test each selection mode and version negotiation against v1 callers, including unsupported high-risk fields.
- Test typed outcomes do not silently weaken privacy, surface, lock or fallback semantics.

## Wave 2 — Deterministic admission

- Test policy intersection order and each independent hard exclusion.
- Test private prompt does not reach classifier/semantic/evaluator before permitted egress.
- Test forbidden candidates cannot be re-added by score, learned rank, semantic hit or provider fallback.
- Test AUTO chooses a stable eligible candidate and returns typed no-route outcomes when none remain.
- Test MODEL_LOCK/PROVIDER_LOCK/LOCAL_ONLY/PLATFORM_ONLY and `none`/`ask`/pre-approved-equivalent fallback.
- Test cost/deadline/capability estimates are bounded and unknown/stale values fail closed.

## Wave 3 — Qualification and capabilities

- Test profile and deployment IDs are immutable/revisioned; alias drift quarantines a route.
- Test capability probe freshness, certification status, endpoint surface, modality, tool/JSON and continuation compatibility.
- Test tenant region/ZDR/retention constraints eliminate otherwise capable providers.
- Test stale/unknown prices are ineligible for automatic paid selection.
- Run staging qualification probes and store sanitized evidence; never assert provider fidelity from catalog values alone.

## Wave 4 — Plan, attempts and economics

- Test duplicate idempotency key returns the same logical plan and never reserves twice.
- Test concurrent requests cannot overspend a single canonical wallet/parent ceiling.
- Test transaction rollback leaves no partial plan/reservation/outbox sequence.
- Test timeout-before-submit, timeout-after-submit, late usage, retry, cancellation and `UNKNOWN_OUTCOME` reconciliation.
- Test only existing ledger settles; credit/provider invoice mismatch remains provisional/disputed and auditable.
- Test outbox event order/deduplication and canonical `worker_jobs` ownership under duplicate dispatch.

## Wave 5 — Surfaces, streams, state and local execution

- Test immutable Gateway route pin before dispatch and observed provider/model afterward; route repoint fails closed.
- Test cross-provider state transfer preserves IDs only for certified compatible continuation; otherwise return `CONTEXT_MIGRATION_REQUIRED`.
- Test stale attempt-owner epoch cannot dispatch, append stream chunks or settle.
- Test pre-commit fallback bounds; post-commit failure returns interruption and never silently restarts on another model.
- Test hierarchical deadline and cancellation; client disconnect does not create an untracked background job.
- Test duplicate Cloudflare Queue delivery attaches to the original durable job/attempt; `waitUntil` alone cannot prove completion.
- Test LOCAL_ONLY privacy, runner owner/tenant ACL, capacity, revocation/withdrawal and no cloud fallback.

## Wave 6 — Consumer adoption

- Test each consumer's legacy input maps to trusted intent without changing its feature-specific payload contract.
- Test consumer model/provider locks and response shapes remain backward-compatible.
- Test each legacy direct path either enters the shared admission service or is documented and monitored as an approved exception.
- Test tool effects use existing capability/approval authority and replayed effect IDs return their original receipts.

## Wave 7 — Evaluation and learning

- Test consent, purpose, lineage, retention, deletion and derivative tombstones for every dataset/eval/shadow artifact.
- Test unavailable counterfactuals remain unknown; no best-model-regret fabricated from selected-only observations.
- Test poison/outlier and minimum-sample gates before any learned score is activated.
- Test offline replay never forwards protected prompts without separate egress and evaluation consent.

## Wave 8 — Admin and user experience

- Test role/tenant authorization for profile qualification, policy edit, canary, rollback, emergency revocation and bundle activation.
- Test route Inspector shows trusted reason codes and evidence refs but no raw prompt, protected content or secret.
- Test default AUTO removes per-request technical confirmation while explicit lock/consent states remain understandable.
- Test responsive/accessibility states for no eligible route, lock conflict, route drift, pending consent and degraded service.

## Wave 9 — Release certification

- Implement the 30 R2, 38 R3 and 36 R4 specified acceptance cases, each traced to a named test and evidence source.
- Run staging failure/rollback drills for provider outage, billing authority outage, stale policy, route repoint, ambiguous submission, duplicate queue delivery, streaming disconnect, regional failover and bundle activation failure.
- Require signed rollout bundle and per-consumer canary gates; verify rollback keeps old in-flight plans pinned unless emergency fence is set.
- Production verification tests must use authorized credentials, synthetic/test tenants, rate/cost caps and trace IDs; source-level tests cannot mark production gates passed.
