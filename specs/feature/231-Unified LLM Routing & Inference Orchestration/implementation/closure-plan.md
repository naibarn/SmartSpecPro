# Spec 231 — Remaining Work Closure Plan

**Status:** Plan only; implementation and external verification remain open.
**Branch baseline:** `codex/spec231-g3-integration` at `3cac585e65437420b4d1e8e9103f3e6b7eddb228`.
**Authority:** Normative Spec 231 R4 plus compatible R2/R3 clauses. Do not resolve the duplicate numeric ID by assumption; do not merge or deploy until the authoritative registry owner reserves the stable UID.

## Completion definition

Spec 231 is closed only when all of these are true:

1. Every active Web, Python, worker, API, and external inference caller is mapped to a runtime owner and is either migrated through the authorized shared contract or recorded as an approved, monitored exception.
2. Deterministic admission, capability/price/region qualification, consumer fidelity, credit settlement, state/stream semantics, durable jobs, media boundaries, privacy and recovery have source, schema, test and runtime evidence at their required levels.
3. Evaluation/replay/shadow/learning stays disabled until consent, purpose, lineage, ACL, retention/deletion, held-out data, sample and poisoning gates pass.
4. The rollout bundle is assembled from authoritative owners, not operator-entered placeholder identifiers. Its environment verifier proves the target DB/schema, keys, provider credentials, route manifest, billing/FX/safety policy, workers and rollback artifact.
5. The R2/R3/R4 acceptance inventory is traceable to named tests or signed runtime evidence; all 104 listed acceptance cases have an outcome and evidence reference.
6. PostgreSQL/credit/job owners pass clone, concurrency, failure, recovery and rollback checks; staging canary and rollback drills pass; Production adoption is incremental with per-consumer rollback and no unsupported global switch.
7. Spec identity and cross-spec contracts are reserved and compatible. Production readiness is asserted only from deployed revisions, authorized traces, provider receipts and owner evidence—not local source/tests.

## Current verified base

- First-party Web Chat policy-gateway path: local source and test evidence, including route handoff, real HMAC verification, tenant-scoped idempotency, durable response staging/recovery and fail-closed behavior.
- Disposable PostgreSQL 17.11 harness: 41 files / 281 tests passed after migrations 0353–0364.
- The direct static inventory covers 20 Web `executeWithFallback` calls / 18 source functions and 34 Python gateway/client/SDK calls / 23 files. It is not a complete dynamic or runtime inventory.
- TypeScript typecheck is `SKIPPED_POLICY`; pytest is unavailable, though the stdlib Python inventory assertion passed directly.
- No provider, browser-account, PostgreSQL 15, running-worker, staging, or Production proof is established by the above.

## Dependency-ordered work

| Wave | Concrete output | Local proof | External proof |
|---|---|---|---|
| 0 Identity | `spec-identity-resolution.md` and uniqueness CI gate | ambiguous UID fixtures fail; one reserved identity resolves consistently | authoritative registry and main/open-branch reservation record |
| 1 Callers | `consumer-adoption-inventory.json` with one row per statically detected caller and explicitly bounded owner/adoption evidence | Web/Python AST inventory tests enforce source-to-manifest parity; contract fixtures are still required per adopted adapter | runtime traces/routes/jobs confirm source-to-runtime closure |
| 2 R4 execution | versioned state, job, attribution, deadline, runner and asset contracts with additive migrations only where necessary | unit + PG concurrency/failure/recovery suites per slice | authenticated staging provider/gateway receipts and runtime job traces |
| 3 Evaluation | governance decision, lineage schema/retention contract, replay/evaluation runner kept disabled | consent/ACL/deletion/poisoning/unknown-counterfactual tests | signed consent/data-governance decision and approved evaluation dataset |
| 4 Admin | server-composed release draft, route inspector, readiness/canary/rollback UI | role/tenant tests, locale parity, accessibility and Playwright states | real target evidence sources and authorized browser account |
| 5 Compatibility | PostgreSQL 15 clone/restore and owner integration evidence | migration replay, schema compare, concurrency/failure/recovery tests | backup job/checksum/restore evidence; live credit/job/provider owners |
| 6 Release | complete 104-case traceability register and signed promotion package | all focused/local suites and two clean review rounds | staging chaos/rollback/canary then per-consumer Production evidence |

**Candidate source ownership (verify before editing):** Wave 1 uses `server/services/inference/legacyLlmCallerInventory.ts`, its AST tests, `server/_core/llmRoutes.ts`, `server/services/llmRoutesHandler.ts`, and the Python API/service callers. Wave 2 centers on `chatInferenceGateway.ts`, `executionCoordinator.ts`, `automaticInferenceRequest.ts`, `llmRouterAttemptAdapter.ts`, `persistence.ts`, `jobExecutorRegistry.ts`, Feature 186 job/outbox owners, Python job adapters and authorized media/Runner owners. Wave 3 adds a separately reviewed evaluation package and schema only after governance approval. Wave 4 uses `server/services/inference/rolloutBundle.ts`, `llmProviders` procedures and `client/src/components/admin/AdminInferenceRolloutPanel.tsx`; do not expose publication/activation until authoritative assembly and readiness APIs are ready. Wave 5 reuses `apps/web/scripts/test-spec231-inference-postgres.sh` and adds a PostgreSQL 15-compatible clone harness without changing historical snapshots. Wave 6 adds the acceptance traceability register and evidence links; deployment/config files require platform-owner handoff.

### Wave 0 — Establish identity and release boundary

**Prerequisites:** access to the authoritative spec registry, `main`, open PRs and branch inventory.

**Actions:**

- Reserve the canonical `spec_uid` and reconcile the 231/232 numeric collision without merging or rewriting either topic by assumption.
- Pin the exact source baseline and migration ownership. Keep Spec 245 migrations 0350–0352 and the Spec 231 migrations 0353–0364 independently attributable.
- Record all current dirty paths and preserve the isolated branch; no broad add/reset/stash.

**Acceptance:** stable UID and revision appear consistently in spec, plans, evidence and generated artifacts; CI/reference checks reject ambiguous IDs; separate rollback domains remain intact.

**Gate owner:** spec registry/release owner. Until then: local isolated work only.

### Wave 1 — Close caller/runtime inventory before adopting more traffic

**Current local slice:** `consumer-adoption-inventory.json` records 18 Web function owners and 34 Python call targets (52 static rows). Web Vitest and Python stdlib-invoked inventory assertions enforce row parity and required classification fields. The manifest explicitly labels retired `orchestrator/` callers as `retired-do-not-extend`. This closes only static-manifest coverage; it does not close runtime ownership, dynamic call discovery, consumer fidelity, or adoption.

**Actions:**

- Expand the static inventory into one row per direct caller with source function, exact upstream route/job/worker owner, sync vs durable-job classification, tenant/principal source, purpose/task class, data sensitivity, surface/tools/stream behavior, budget and settlement owner, legacy fidelity contract, proposed adapter, status and rollback evidence.
- Trace indirect helpers, aliased/dynamic SDK access, Node↔Python RPC, scheduled/background entrypoints and external processes. Mark scanner coverage limits explicitly and keep an owner-confirmed runtime inventory separate from AST counts.
- Split text inference from embedding, moderation, audio and media calls; select contracts per surface rather than treating each SDK call as chat.
- Adopt consumers in dependency order: public/internal Web APIs; Python public/internal APIs; feature service boundaries; durable worker/job callers. Keep explicit locks, response shapes, tool/effect authority and failure semantics unchanged.
- Preserve a reviewed exception registry for callers that cannot yet supply trusted policy, qualification, reservation and attempt ownership. New direct provider callers fail CI unless assigned an owner and exception/adoption entry.

**Test design/acceptance:**

- Per consumer: compatibility fixtures for payload and output shape; spoofed tenant/principal/provider fields; model/provider lock; privacy and egress; idempotency/retry; timeout/unknown outcome; cancellation; tool-effect receipt; budget and settlement owner.
- Cross-process tests prove same owner/attempt and one economic settlement under retry.
- Static inventory tests detect new direct calls; separate runtime traces prove each production entrypoint is accounted for.
- No caller is declared adopted from an adapter unit test alone.

**Gate:** do not cut over a consumer until all its row fields have evidence and rollback tested.

### Wave 2 — Complete R4 execution contracts that have no end-to-end proof

Execute as separate slices; no caller adoption may depend on a slice until its gate passes.

1. **Conversation state and tool turns (R4.1):** implement the canonical redacted transcript/state manifest, provider-opaque state ownership, tool receipt mapping, continuation compatibility fixtures, and `PINNED` default. Cross-provider transfer is denied until lossless target-surface certification exists. Test privacy, TTL/deletion, replay, stale tool IDs, signed continuation, and context-loss/consent behavior.
2. **Durable admission and attempts (R4.2):** connect long-running work to existing `worker_jobs`/outbox, lease/fencing and existing canonical credit authority. No new job or wallet authority. Test duplicate queue delivery, restart, stale owner, cancellation, deadline, retry, budget outage and one provider submission.
3. **Actual provider attribution (R4.3):** persist planned-vs-executed provider/model, gateway request ID, route version/hash, account/credential binding reference and usage receipt where available. Detect mismatch and quarantine/reconcile without exposing credentials or prompt content. Test route repoint, fallback outside approved set, missing headers, invoice/usage mismatch and idempotent reconciliation.
4. **Deadline, local runner and media boundary (R4.4):** enforce hierarchical deadline/cancellation and runner capacity/ACL/revocation; use authorized asset references, MIME/magic validation and recipient-bound short-lived URLs. Test SSRF/redirect denial, cross-tenant asset access, disconnect behavior, no implicit cloud fallback and retention cleanup.

**Acceptance:** each slice has contract, DB/concurrency/failure tests as applicable, observed actual execution proof in an authorized non-production target, and a recovery procedure. Local mock evidence is labeled separately.

### Wave 3 — Govern evaluation and learned routing before building promotion controls

**Owner prerequisite:** written approval from product and data governance for data sources, purpose, consent, ACL, retention, deletion, derivatives and external egress.

**Actions after approval:**

- Define immutable dataset/observation/evaluation lineage with tenant ACL and derivative tombstones.
- Separate selected-model observations, paired replay results, evaluator estimates and unknown counterfactuals; never impute unobserved outcomes.
- Add held-out temporal, tenant, language, modality and risk slices; confidence intervals, effective sample thresholds, poisoning/outlier controls, evaluator disagreement and consent revocation tests.
- Implement replay/shadow as side-effect-free, opt-in, capped-cost jobs on canonical `worker_jobs`/outbox; never forward protected prompts without separately authorized egress.
- Keep classifier/semantic/learned signals advisory and disabled until offline metrics and controlled low-risk canary gates are signed.

**Acceptance:** missing/revoked consent, wrong purpose, ACL mismatch, deletion and derivative cleanup all deny; low sample/poisoning/unknown counterfactual cannot promote; deterministic route remains available through evaluator outage.

### Wave 4 — Make Admin operations usable without manufacturing readiness

**Prerequisites:** authoritative APIs/owners for all bundle fields and a target-environment readiness verifier. The verifier currently defaults to deny; keep that behavior.

**Actions:**

- Add server-side bundle-draft assembly from live canonical policy/profile/certification/route/pricing/FX/guardrail/rollback/environment records. Reject missing or inconsistent source records; do not accept free-form references as proof.
- Add route inspector showing eligible/excluded deployments, trusted reason codes, actual-vs-planned attribution and evidence references, never prompts, secrets or cross-tenant data.
- Add readiness and activation states, immutable diff, canary cohort, staged promotion, drift alerts, emergency fence and paired rollback of model registry + Gateway route.
- Complete responsive, keyboard/accessibility, localization and role/tenant isolation coverage for no-route, stale evidence, keyring unavailable, readiness denied, route drift, canary pause and rollback.

**Acceptance:** UI cannot bypass server activation checks; operator sees precisely which evidence blocks promotion; bundle authoring cannot sign placeholder evidence; browser tests cover Admin and first-party Chat flow at supported viewports and roles.

### Wave 5 — Prove schema, credit, job and provider behavior on compatible targets

**Owner prerequisites:** authorized encrypted backup destination, isolated clone, provider test credentials/budget, live billing/job owners and PostgreSQL 15 plus required extensions.

**Actions:**

- Restore a fresh Production-like backup into an isolated clone; verify checksums, schema, extension versions, migration journal and G2/credit/job data.
- Apply 0353–0364 once to a disposable PostgreSQL 15 clone using the real migration runner; capture locks, duration, rollback/recovery and schema diffs. Never edit historical snapshots or production DDL to evade collisions.
- Test credit create/mirror/settle/refund/reconcile against the actual canonical ledger and Redis config, including crash windows and duplicate keys.
- Prove the scheduled Feature 186 settlement sweep is registered, enqueued, leased, executed and observed; verify restart/retry and dead-letter/manual-review paths.
- Run authenticated provider qualification for baseline, context/output limits, price, region/retention, tools/JSON, streams, cancellation, media and continuation; keep candidates ineligible where a capability is unproven.

**Acceptance:** restore verified; migration replay and recovery meet owner-approved lock thresholds; cross-store reconciliation cannot overcharge or expose unsettled content; all live provider receipts bind to the correct profile and route; no secret/prompt appears in evidence.

### Wave 6 — Certification, staging recovery and incremental rollout

**Actions:**

- Convert all 30 R2 + 38 R3 + 36 R4 release cases into a traceability register: requirement, exact test, environment, run ID, owner, result, evidence URI, expiry/freshness, residual boundary.
- Build the release bundle from authoritative sources; verify signature/keyring rotation and cross-instance compatibility; environment readiness checks actual deployment revision, DB/schema, routes, credentials, pricing, safety, workers and rollback artifact.
- Run staging chaos/recovery drills: provider outage, billing authority loss, stale policy, route repoint, ambiguous submit, duplicate queue, hung stream, regional failover, Worker crash and Redis migration overlap.
- Canary one approved low-risk consumer. Compare task success, p95/TTFT, cost per success, fallback, policy exclusion, tenant/language/modality slices and actual billing. Set thresholds from baseline before the run.
- Promote consumers incrementally. Keep old route available until its successor's acceptance and rollback gates pass; in-flight plans stay pinned except emergency revocation.
- Only after owner authorization and every Production gate passes, collect deployed revision, authorized trace, provider receipt, caller telemetry, rollback proof and post-open verification per consumer.

**Acceptance:** all 104 release cases have evidence or explicit signed exception; no Critical/High/Must-fix gaps; two clean review rounds after final fixes; measured rollback succeeds; no global cutover; Production claims match deployed evidence.

## Parallel execution rules

Can run in parallel after Wave 0: (a) Web/Python caller inventory refinement, (b) disposable PostgreSQL 15 setup/migration rehearsal, and (c) release-evidence schema/traceability mapping. Keep file ownership separate. After prerequisites are met, provider-surface tests and Admin UI build may run in parallel, but UI cannot ship activation affordances until authoritative source APIs exist.

Must remain sequential: spec UID reservation before merge/deploy; caller contract before adoption; reservation/job authority before durable consumer adoption; data-governance approval before evaluation data capture; canonical field assembly before bundle publication; target readiness verifier before activation; restore/migration proof before staging; staging recovery before Production.

## Stop and recovery policy

- When an owner/evidence dependency is missing, continue independent local work and keep affected consumers or promotion disabled. Do not replace missing evidence with placeholders.
- Every failed gate has an owner, artifact needed, command/test, and resume point. Retry a deterministic failing gate at most three times; after that investigate the environment/owner rather than repeat the same run.
- After any schema, security, route or API fix, invalidate affected downstream evidence and rerun from the earliest dependent wave.
- Never state “Spec 231 complete” while any mandatory wave, required acceptance case, registry reservation, security/financial gate or Production evidence remains open.

## Owner action packet needed to unlock external waves

1. Canonical Spec registry access/owner to reserve the stable UID and resolve the number collision.
2. PostgreSQL 15 clone and durable encrypted backup/restore target owned by the DB team.
3. Provider owners to authorize test accounts, endpoint/region policy and bounded probe budget; credentials remain in Secret Manager.
4. Billing/job owners to expose a safe staging ledger and confirm the live Feature 186 worker schedule/runtime.
5. Product/data governance owner to approve evaluation consent, data lineage, retention/deletion and egress policy.
6. Platform/release owner to supply staging revisions, route manifest, keyring distribution proof, environment evidence verifier and rollback target.
7. Authorized Beta/Admin browser sessions for browser evidence; no credentials or session state are shared in chat or Git.
