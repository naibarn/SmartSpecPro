# SPEC-289 — Adaptive Capability Routing, Backend Health & Agent-Reach Integration

**Version:** R1.3  
**Status:** PROPOSED — design reviewed in 20 cumulative document passes; implementation, repository compatibility and canonical number remain unverified  
**Target:** SmartAIHub platform, Agents, Skills, MCP, Desktop/Cloud Runners, Mini Apps  
**Principle:** Extend existing systems; never introduce a second orchestration/control plane.

## 1. Executive summary

A user or Mini App requests an outcome such as `social.search`, `web.search`, `video.transcript`, or `repository.search`. SmartAIHub resolves an authorized, operational backend from native API, MCP, Skill/CLI, optional Agent-Reach adapter, desktop browser session, or computer-use runner. The resolver makes cost-, quality-, latency-, environment-, and reliability-aware choices, can fail over safely, and records evidence. Agent-Reach is **optional**, never a mandatory core dependency.

**Non-goal:** Replace existing Capability Registry, Skill-first routing, orchestration, MCP gateway, runner control, or job control plane.

## 2. Authority, compatibility and dependencies

- **SPEC-256 (implemented):** existing capability discovery and intent routing is authoritative. Add a backward-compatible resolver extension/adapter, not a rewrite.
- **SPEC-269:** assistant delegates intent/capability, not backend implementation.
- **SPEC-276:** expose a compact relevant capability set; do not dump all backend tools into context.
- **SPEC-279:** command ingress and agent delegation authority remains in the existing gateway.
- **SPEC-267:** job lifecycle, queue, budget, retry and worker placement use the existing control plane.
- **SPEC-277:** status, intervention and evidence shown through Task Control Experience.
- **SPEC-224 (implemented):** development orchestration is unchanged; integrate only via stable contracts where appropriate.
- **SPEC-288:** optional portable backend contracts for Mini Apps; no assumption that an off-platform Mini App can access SmartAIHub-only providers.
- **SPEC-287:** UI/UX and Mini App governance; display capability status without bypassing UI policies.
- **SPEC-293/294/295:** verify actual titles, scope and authority in the canonical repository before assigning integration responsibilities. No invented cross-spec obligations.
- **SPEC-266:** where needed, reuse the existing evidence/data fabric rather than duplicate data stores.

**Conflict rule:** repository-verified canonical contracts override this proposal; create additive adapters or a follow-up amendment, never silently change implemented contracts. Verify that `289` is unallocated in the canonical spec index before adopting this identifier.

## 3. Goals and measurable success criteria

1. Stable capability interface independent of backend implementation.
2. Health and readiness differentiate registered, configured, authorized, reachable and operational.
3. Automatic fallback only for equivalent, authorized, policy-compliant backends.
4. Bounded execution, budget controls, idempotency, auditable outcome and explicit failure semantics.
5. Tenant/user/project scoped credentials and execution environments.
6. Works for platform-owned workflows, agent requests, Mini Apps and optional portable deployment.
7. No regression to existing SPEC-256 callers; migration can be feature-flagged and rolled back.

**Acceptance targets (to validate in staging, not current measured facts):** 100% policy-denied routes remain denied under fallback; 100% side-effecting requests do not auto-replay without verified idempotency/approval; zero credential values in logs/telemetry; >99% deterministic replay conformance in controlled tests; no unbounded fallback loops; failover improves completion rate against a no-fallback baseline in a representative failure-injection suite. Performance and cost targets must be baseline-measured before production promotion.

## 4. Canonical architecture

```text
User / Mini App / Agent / Workflow
                 |
      Existing command/intent ingress
                 |
        Existing Capability Registry
                 |
      Adaptive Resolver Extension (NEW)
       | policy + permission + budget
       | readiness + quality + placement
       | ranking + bounded fallback
                 |
         Existing Job Control Plane
                 |
       Existing Runner/Provider Adapters
       | Native API | MCP | Skill/CLI |
       | Agent-Reach (optional) | Browser |
                 |
       Normalized Result + Evidence Receipt
                 |
      Existing Task Control / Audit / Billing
```

Resolver is **not** an executor, durable scheduler, credit ledger, secrets vault or authorization authority. The underlying system remains the source of truth for each.

## 5. Contracts and schemas

### 5.1 Capability descriptor

```json
{
  "capability_id": "social.search",
  "contract_version": "1.0.0",
  "input_schema_ref": "schemas/social-search-input-v1",
  "output_schema_ref": "schemas/social-search-output-v1",
  "side_effect_class": "read_only",
  "data_classification": "public_or_user_authorized",
  "required_scopes": ["social:read"],
  "portable": true,
  "backend_ids": ["native.social", "mcp.social", "agent_reach.social"]
}
```

Use stable canonical identifiers and aliases in registry, not name-string guessing. Version contracts with semantic compatibility rules. Backends that cannot satisfy the normalized output contract must not advertise the capability as equivalent.

### 5.2 Backend descriptor

```json
{
  "backend_id": "agent_reach.social",
  "adapter_version": "1.0.0",
  "capability_ids": ["social.search"],
  "execution_modes": ["registered_desktop_runner", "sandbox_container"],
  "auth_modes": ["delegated_user_session"],
  "readiness_probe_id": "agent_reach.doctor",
  "supports_idempotency": false,
  "supported_regions": [],
  "cost_model_ref": "cost/agent-reach-v1",
  "policy_tags": ["third_party", "browser_session_possible"]
}
```

`execution_modes` are declared possibilities, not proof of readiness. Do not automatically route browser/session workloads to shared cloud workers. `supported_regions: []` means unknown/unverified, not worldwide authorization.

### 5.3 Request and decision

```json
{
  "request_id": "uuid",
  "tenant_id": "tenant-ref",
  "principal_id": "principal-ref",
  "capability_id": "social.search",
  "contract_version": "1.0.0",
  "input": {"query": "example"},
  "policy_context_ref": "immutable-policy-snapshot-ref",
  "permission_snapshot_ref": "permission-ref",
  "budget_reservation_ref": "budget-ref",
  "deadline_ms": 30000,
  "idempotency_key": "request-scope-key"
}
```

The actual permission/budget/identity snapshots must be supplied and validated by their authoritative services; client-provided refs alone grant no authority. The decision includes ranked candidates, redacted exclusion reasons, policy version, scorer version, selected environment, deadline and audit trace ID.

### 5.4 Normalized result and evidence

`status: succeeded | partial | failed | denied | needs_auth | needs_approval | unavailable | timed_out | cancelled`; include source references, provenance, retrieval timestamp, data freshness, backend/version, runner identity reference, attempts, cost usage, schema validation, confidence **only if calibrated**, and redacted error category. Never invent evidence, source quality or confidence.

## 6. Resolver algorithm

1. Normalize intent to an existing capability and compatible contract version.
2. Validate tenant, principal, scopes, resource policy, geographic/data residency restrictions, user consent and request budget **before discovery**.
3. Retrieve only registered candidate backends matching required semantics and input/output schema.
4. Evaluate execution placement and secret/session availability without exposing credentials.
5. Apply hard filters: permission, policy, auth, environment, contractual quality, budget, deadline, provider terms and side-effect safety.
6. Rank remaining candidates using measured quality, recent success rate, latency, estimated total cost and freshness; distinguish unknown measurements from low values.
7. Dispatch via the existing job plane with lease/fencing, cancellation and idempotency as applicable.
8. Validate output schema, provenance, freshness and minimum evidence quality. A transport success is not automatically a task success.
9. On eligible failure, re-evaluate policy and choose a different eligible backend within bounded attempt, time and cost limits.
10. Emit final normalized outcome, evidence and billing reconciliation; make partial/failed status explicit.

**Scoring:** configurable weighted normalized utility, e.g. `w_quality*quality + w_reliability*reliability + w_freshness*freshness - w_cost*estimated_cost - w_latency*estimated_latency`; hard safety/policy constraints are never softened by score. Begin with deterministic rule-based selection; ML optimization only after reliable telemetry and offline evaluation.

## 7. Health contract

State model: `unregistered`, `registered`, `misconfigured`, `needs_auth`, `ready`, `degraded`, `unavailable`, `blocked_by_policy`, `unknown`. Separate platform/backend health from tenant-specific authorization and runner-local readiness. Probes include static validation, dependency availability, optional safe active read probe, credential metadata check (never expose token), quota/rate limit and real task success signals. Probe intervals, timeouts, exponential backoff, circuit breaker and TTL are configurable. Never use active probes that post, purchase, message or mutate user data. `doctor --json` from Agent-Reach may be parsed as a diagnostic signal, not accepted as a complete security or end-to-end capability guarantee.

## 8. Failure and fallback policy

| Failure | Default behavior |
|---|---|
| Network timeout / transient 5xx | Bounded retry or equivalent backend fallback |
| Provider rate limit | Respect retry-after, quota and cost ceilings; switch only if allowed |
| Backend unhealthy / unsupported | Select another compatible, ready backend |
| Needs authentication / expired session | Request authorized re-auth; do not bypass with another identity |
| Policy denied / region restricted | Stop; never route around the denial |
| Low-quality or malformed response | Validate and retry/fallback only when safe and within budget |
| Side-effect unknown completion | Reconcile authoritative state; no blind replay |
| User cancellation | Propagate cancellation and settle costs; no further fallback |

Limit attempts (initial default: 3 across all backends), total elapsed time, per-attempt timeout and maximum reserved spend. Use a dedupe key and fenced dispatch. Prevent cross-provider fanout without explicit task/policy allowance. Record original and fallback routes for audit and cost allocation.

## 9. Agent-Reach adapter (optional)

- Run behind the existing adapter/runner boundary, pinned to a reviewed version/commit and license/security assessment.
- Capability-by-capability allowlist, never expose raw arbitrary shell commands or full filesystem access.
- Map supported Agent-Reach commands to canonical input/output schemas; normalize citations, errors, health and usage.
- `doctor --json` integration is optional and version-tolerant: unknown fields are ignored safely; schema drift yields degraded/unknown readiness, not unconditional ready.
- External dependencies, browser login, cookies and third-party CLIs require per-environment installation/approval.
- No automatic scraping of private content, CAPTCHA circumvention, rate-limit evasion, access-control bypass or platform-terms violations.
- Do not assume each advertised platform/capability works without configuration or has a zero monetary cost.
- Feature flag `capability.adapter.agent_reach.enabled`, default **off** in production; kill switch and version pin.

## 10. Identity, session and security boundaries

Credential and browser-session access must be user/tenant-scoped, least-privileged, time-limited and executed in the correct trusted environment. A Desktop Runner must explicitly register capabilities, consent and session scope; cloud agents cannot copy desktop cookies or impersonate the user. Secrets stay in approved secrets infrastructure; only scoped short-lived handles are passed to runners. Require egress allowlists, command sandboxing, supply-chain checks, SSRF protection, PII minimization, audit logging and PDPA retention/deletion controls. Untrusted web content is data, never executable instruction or authorization. Approval requirements propagate unchanged across all fallbacks. Preserve permission ceilings during cross-provider delegation and runner handoff.

## 11. Placement, concurrency and economics

Use existing SPEC-267 placement/control mechanisms: Cloudflare Worker for lightweight dispatch, Containers/Sandbox for supported isolated tool workloads, Desktop Runner for user-local browser sessions, external registered runner where authorized. Do not assume any workload fits Workers or any container has warm startup. Enforce per-provider and per-tenant concurrency/rate limits, circuit breakers, fair scheduling, lease expiry, graceful draining and retries without duplicated charges. Budget admission before dispatch, estimate worst-case fallback spend, reserve and settle through the existing credit ledger. Record infrastructure/runtime, provider/API and skill fees separately; preserve tenant/platform/plugin revenue attribution and sponsor/credit policies. Cost estimates are empirical and never treat browser-based access as literally free (CPU, maintenance, legal and reliability costs remain).

## 12. Mini App and portable deployment

Expose a stable capability client through existing authorized gateway interfaces; do not require a Mini App to embed Agent-Reach or carry provider secrets. Portable Mini Apps must declare required/optional capabilities, minimum versions, auth/scopes and execution modes. On external deployment, resolve against locally available compliant adapters or a user-approved remote SmartAIHub gateway; provide explicit `unavailable`/`needs_auth` when neither exists. No silent vendor lock-in or hidden dependency on SmartAIHub Cloudflare services. Preserve UI/UX governance and user-facing permission prompts.

## 13. Task Control and observability

Show capability requested, selected backend/environment, health, queue/running state, attempts, fallback reason, cost/credit estimate and actual, user action required, and evidence/source quality. Redact provider secrets and private URLs. Provide operator diagnostics: per-capability success/partial/denied rates, p50/p95 latency, fallback rate, cost per successful task, stale health ratio, circuit-breaker state, version drift and policy denial count. Keep cardinality bounded; do not log raw prompts or sensitive retrieved data by default. Tie to canonical job/task ID, immutable audit trail and trace propagation.

## 14. Implementation plan

**Phase 0 — Discovery and compatibility (required):** inspect canonical repo and spec registry; verify `289` availability; identify implemented SPEC-256 interfaces, registry DB, job-plane, runner, approval, secrets, billing, Task Control and tests. Produce contract mapping and explicit gaps. Do not assert that proposed fields already exist.

**Phase 1 — Contracts and shadow routing:** introduce versioned descriptors and normalized result/evidence adapter; collect metrics; run scorer in shadow mode with no execution change. Prove no regression for existing clients.

**Phase 2 — Health and policy gates:** implement layered readiness, cache/TTL, circuit breakers, permission/tenant/budget checks, diagnostics and test harness.

**Phase 3 — Safe fallback:** enable read-only equivalent backend fallback under canary feature flags; enforce global deadlines, spend, dedupe and cancellation.

**Phase 4 — Agent-Reach adapter:** pin audited version; implement minimal pilot capabilities (e.g. `web.search`, `video.transcript`, or `social.search` **only where verified supported**); test desktop/cloud placement, auth prompts, terms and evidence normalization. Do not expand platform support based on README claims alone.

**Phase 5 — Mini App/Task Control:** expose capability client and portable manifests; operator/user UI; rollout by tenant/capability with kill switch.

**Phase 6 — Production promotion:** comparative baseline metrics, policy/security signoff, controlled fault injection, migration safety and rollback rehearsal. No rollout if any hard gate fails.

## 15. Database and migration discipline

Prefer existing canonical capability/job/audit data structures. Any new tables or columns require ownership mapping, additive migrations, unique revision IDs, forward/backward compatibility, rollback or roll-forward plan, online index strategy, zero data loss, and tested dev/staging deployment ordering. Do not regenerate/overwrite historical migrations or revive retired workflow tables. Cloudflare production deployment and schema migration must be separately tracked with revision/commit provenance; block incompatible code rollout until migrations are verified. No new source-of-truth database unless justified by a documented gap.

## 16. QA matrix — minimum ten review passes

The following are **required validation passes**, not a claim that implementation tests have run:

1. Architecture ownership: no duplicate control plane or registry.
2. Capability contract equivalence and semantic version compatibility.
3. Tenant isolation, permission ceiling and approval propagation.
4. Credential, cookie, browser-session and secrets handling.
5. Health correctness: unknown/degraded/auth vs actually operational.
6. Retry/fallback: idempotency, cancellation, deadline, circuit breakers.
7. Quality/evidence: malformed, stale, incomplete and conflicting sources.
8. Economics: worst-case budget, credit settlement, revenue attribution.
9. Placement: Cloudflare, container, desktop and portable Mini App failure modes.
10. Deployment: migration ordering, multi-worker concurrency, rollback, feature flags.
11. Security: prompt injection, SSRF, arbitrary command execution, supply chain and egress.
12. Observability: audit trace completeness, sensitive-data redaction and actionable UI.

For each pass record `PASS | FAIL | BLOCKED`, evidence links, defects, fix commit, retest outcome and independent reviewer where available. Repeat until all release gates pass; do not label a document `10PASS` without executed and evidenced review passes.

## 17. Test cases and acceptance gates

- Contract tests: every backend passes canonical schema and error mapping; incompatible adapters excluded.
- Property tests: denied scope never reaches any executor; tenant credentials never cross tenant boundaries.
- Fault injection: first backend times out; second succeeds within global deadline and spend; evidence includes both attempts.
- Auth failure: no automatic fallback to another account or browser session.
- Side effects: unknown completion is reconciled, never blindly replayed.
- Parallel workers: duplicate dispatch, lease expiry and crash recovery settle exactly once at business-effect level where supported.
- Rate limit: `Retry-After` respected, no policy bypass.
- Partial evidence: result is `partial` rather than silently marked `succeeded`.
- Portable Mini App: works with local adapter; explicit actionable error without one.
- Feature flag: disabled extension preserves existing SPEC-256 behavior.
- Agent-Reach removed/unavailable: other backends continue operating.
- Production canary rollback: restore previous routing without schema/data loss.

**Release blockers:** any auth/tenant bypass, secrets exposure, unbounded spend, non-idempotent replay, broken cancellation, invalid migration, unsupported provider terms, or missing rollback. No “best effort” exception to these gates.

## 18. Deliverables

1. Repository-verified dependency/authority matrix and canonical spec-number check.
2. Capability/backend descriptors and JSON schemas with examples.
3. Resolver extension and feature flags; backward-compatibility suite.
4. Health probe framework and operator diagnostics.
5. Safe fallback and budget/approval integration.
6. Optional Agent-Reach adapter with version pin, install and security documentation.
7. Mini App SDK contract and portable capability manifest.
8. Task Control UI integration and normalized evidence receipts.
9. Automated unit/integration/fault-injection/security/migration tests.
10. QA evidence report, rollout plan, rollback playbook and operational runbook.


## 19. Critical contract clarifications (R1.1 gap closure)

### 19.1 Capability semantics and honest degradation

Each capability must declare `operation`, `input/output schema`, `semantic_guarantees`, `coverage`, `freshness_sla`, `pagination`, `max_result_count`, `locale`, `source_provenance`, and `quality_floor`. Search, fetch, summarize, and authenticated read are distinct operations: never treat `web.search` as equivalent to `social.search`, or a cached excerpt as a full post. The router must return `partial` with machine-readable missing coverage when no backend meets the requested guarantees. Results must include canonical citation URLs where permissible, retrieval time, and source attribution; prohibit fabricated citations. When provider terms prohibit retention or redistribution, apply provider-specific constraints.

### 19.2 Policy decision binding and TOCTOU protection

Authorization is evaluated at ingress **and** immediately before every dispatch/fallback using the authoritative identity and policy services. Bind decision to `tenant_id`, principal, delegated authority chain, resource scope, provider account, runner identity, capability version, purpose, and policy revision; expire decisions and reject mismatched/changed snapshots. Cache health but never cache authorization as universal readiness. `needs_auth` is not permission to switch to another person's session. Approval must be bound to action payload hash, effect class, destination, and expiration; material changes require fresh approval.

### 19.3 Failure taxonomy and unknown outcome

Normalize errors into `transient`, `rate_limited`, `quota_exhausted`, `auth_required`, `permission_denied`, `policy_denied`, `unsupported`, `invalid_output`, `stale_result`, `side_effect_unknown`, `cancelled`, and `infrastructure_unavailable`. Maintain separate `transport_status`, `execution_status`, `semantic_status`. If the provider accepted a mutation but acknowledgment was lost, mark `side_effect_unknown`, reconcile via authoritative provider receipt or query, and **do not** fail over until outcome is known. Even read-only calls can incur cost and quota: do not fan out speculatively without reservation.

### 19.4 Budget reservation, retry envelope, and settlement

An execution envelope is mandatory: `deadline_at`, `max_attempts`, `max_total_cost`, `max_provider_cost`, `max_infra_cost`, `max_concurrency`, `rate_limit_scope`, and `cancellation_token_ref`. Reserve against the full permitted fallback envelope before dispatch or use incremental atomic reservations before each attempt. Enforce atomic ledger settlement and duplicate receipt handling across worker crashes. If no backend fits remaining budget, return `budget_exhausted`, not a silent overrun. Charge/refund according to actual billable provider usage; record estimated vs actual and currency/credit conversion version.

### 19.5 Distributed health and circuit breakers

Health is keyed by `(backend, capability, environment, region, tenant credential scope)` where appropriate; distinguish global outage from tenant-specific expired auth. Define probe ownership, TTL, staleness cutoff, per-provider quotas, hysteresis and half-open recovery. Multiple workers must not trigger a thundering herd of probes; use existing durable locks/leases. Circuit state must not override authorization. A backend marked `ready` by `doctor` is only *candidate ready*, not guaranteed task success.

### 19.6 Adapter trust and supply-chain lifecycle

Agent-Reach integration runs behind a narrowly scoped subprocess/container adapter with explicit command allowlist, pinned commit/release and checksum, dependency SBOM, vulnerability review, bounded stdout/stderr, time/memory/network limits, and no host shell interpolation. Record license and redistribution obligations for Agent-Reach and its transitive components; do not assume its third-party backend licenses/terms are identical. Version compatibility tests cover CLI arguments, `doctor --json` schema, login flows, and changed platform support. Disable the adapter on incompatible drift; never auto-install arbitrary tools on user devices.

### 19.7 Session isolation and remote execution consent

Desktop session credentials stay local and are never copied to cloud logs, R2, or another tenant. Runner registration declares supported browser profile, session owner, allowed domains, approval requirements, user presence, and revocation capability. If the desktop is offline or session revoked, return actionable `needs_runner`/`needs_auth` and route elsewhere **only** if identity/policy/semantics remain equivalent. Do not bypass anti-bot protections, paywalls, CAPTCHA, or access restrictions.

### 19.8 Portable Mini App compatibility contract

Portable manifest includes `required_capabilities`, `optional_capabilities`, semver ranges, `required_scopes`, `data_residency`, `offline_behavior`, `remote_gateway_opt_in`, and `fallback_user_experience`. The Mini App must work with a local compliant implementation or surface a capability-unavailable state. Export/import validation must detect SmartAIHub-only dependencies before deployment. API contract tests run both hosted and off-platform configurations; provider credentials are not packaged with exports.

### 19.9 Deployment, schema and authority ledger

Phase 0 must output an **actual repository evidence table**: canonical spec index entry, source owner, current API/DB schema, deployed commit, migration revision, feature flag owner, worker/runtime placement, and relevant Cloudflare service status. Unknown means `UNVERIFIED`, never `PASS`. Use expand → deploy compatible code → verify → contract migrations; keep existing SPEC-256 callers supported. Validate multi-worker races and regional rollout; support rollback of code and routing configuration without destructive DB rollback. SPEC-293/294/295 responsibilities are explicitly deferred until verified against repository content.

### 19.10 Deterministic routing, privacy and operator controls

Store routing decision reason codes, policy/scorer versions, sanitized candidate scores, request correlation IDs and evidence hashes. Provide deterministic replay with recorded inputs/health snapshots; replay must not execute live side effects. Enforce data minimization, retention periods, subject deletion propagation, encrypted telemetry and per-tenant access to logs. Operator controls include dry-run, shadow-mode comparison, backend quarantine, per-tenant kill switch, circuit override **without policy override**, and emergency rollback. Show users a clear distinction between `completed`, `partial`, `waiting for login`, `waiting for runner`, and `blocked`.

## 20. Additional executable acceptance scenarios

| ID | Scenario | Required assertion |
|---|---|---|
| A01 | Two tenants share backend | Session, data, cache and telemetry never cross tenant boundary |
| A02 | Policy changes after ranking | Dispatch denied on fresh policy evaluation |
| A03 | Browser session revoked mid-job | No credential reuse; explicit auth/runner state |
| A04 | Two workers see unhealthy backend | Probe deduplicated; circuit breaker consistent |
| A05 | First backend returns 200 with wrong data | Semantic failure, not `succeeded`; safe bounded fallback |
| A06 | First provider charged but timed out | No double billing; actual usage reconciled |
| A07 | Mutation acknowledged late | No automatic second mutation or cross-backend replay |
| A08 | User cancels during fallback | No new dispatch; receipts settled |
| A09 | Agent-Reach CLI/doctor changes schema | Adapter quarantined; native routes unaffected |
| A10 | Mini App exported without gateway | Required capability failure explicit; no secret export |
| A11 | Region and data residency conflict | All noncompliant backends filtered even when fastest |
| A12 | All routes unavailable | Stable normalized failure and next-action guidance |
| A13 | Rollback during concurrent jobs | In-flight jobs fenced; no data loss or orphan charges |
| A14 | Prompt injection in retrieved webpage | No tool invocation or authority escalation from page text |
| A15 | Source citation absent or stale | `partial`/failed quality gate; no invented evidence |
| A16 | Rate-limit failover | Respect provider policies; no evasion via alternate accounts |

All A01–A16 must have automated test identifiers and reproducible evidence before production promotion. Add load tests for 1k+ simultaneous *requests* as a target only after measuring the existing control plane; no unsupported claim of 1k concurrent external browser sessions. Document SLO baseline, p95 latency, success rate, and cost-per-success for a representative workload before setting improvement thresholds.

## 21. Ten-pass document review record (R1.1)

This is a **design-document review**, not execution of code tests or repository validation. Each pass identified a specification ambiguity and introduced a required contract or test:

| Pass | Review dimension | Gap closed in R1.1 | Document status |
|---|---|---|---|
| 1 | Semantic equivalence | Operation/coverage/freshness contract | ADDRESSED |
| 2 | Authorization | Dispatch-time policy recheck and bound approvals | ADDRESSED |
| 3 | Side effects | Unknown-outcome reconciliation | ADDRESSED |
| 4 | Economics | Atomic fallback envelope and settlement | ADDRESSED |
| 5 | Distributed readiness | Scoped health, probe lease and hysteresis | ADDRESSED |
| 6 | Third-party supply chain | Pin/SBOM/license/CLI drift policy | ADDRESSED |
| 7 | Desktop identity | Consent, revocation and local session isolation | ADDRESSED |
| 8 | Portable Mini Apps | Export and offline contract | ADDRESSED |
| 9 | Cloudflare deployment | Authority ledger and migration rollout | ADDRESSED |
| 10 | Observability/PDPA | Replay, retention, operator controls | ADDRESSED |

**Outstanding external blockers:** canonical SPEC-289 number availability; actual SPEC-256 API/schema compatibility; actual 293/294/295 ownership; deployed Cloudflare and database state; Agent-Reach version/license/dependency audit; measured production baseline. These cannot be certified by reviewing this document alone.

## 22. Definition of Done

DoD additionally requires A01–A16 passing with evidence, external blockers resolved, and canonical number/ownership verified, all critical contracts approved, existing implemented paths unbroken, reproducible test evidence, 12 QA dimensions reviewed with no open critical/high findings, measured canary improvement over baseline (or documented rollback), budget/policy/security gates passing, and operational rollback exercised. This spec is a **development proposal**, not proof of current implementation.


## 23. R1.2 — Second independent ten-pass design hardening (passes 11–20)

The following passes are additional **specification-level reviews**, not executable integration tests. Requirements below are normative unless marked conditional.

### Pass 11 — Contract evolution and schema negotiation
**Gap:** A capability may change its output schema while an old Mini App or Runner still expects v1. **Closure:** Publish immutable versioned JSON Schemas, explicit `min_supported`/`max_supported` and negotiated version in dispatch and evidence. Reject incompatible major versions; allow only validated lossless adapters for compatible minor versions. Contract test `T17`: old Mini App requests v1 while registry offers v2-only; return `unsupported_contract`, never silently coerce. Provide compatibility fixtures and rollback to old contract without destructive schema changes.

### Pass 12 — Cross-provider data integrity and trust
**Gap:** Fallback providers can return conflicting, manipulated or stale data. **Closure:** Record source URI/identifier, fetched_at, observed_at (when available), backend, transformations, dedup key and verifiable source provenance. No automatic merging of incompatible claims; distinguish `source_conflict`, `insufficient_evidence`, and `verified`. User-visible confidence must not be fabricated. `T18`: two providers disagree; output explicit conflict and citations, not a single asserted truth.

### Pass 13 — Rate-limit fairness and provider policy
**Gap:** Routing across multiple accounts can unintentionally circumvent quotas or starve tenants. **Closure:** Provider-scoped rate budgets, account ownership checks, tenant fair-share, cooldown windows, `Retry-After`, and rate-limit propagation into existing SPEC-267 controls. Do not switch accounts to bypass provider limits or terms. `T19`: provider returns 429; compliant wait/eligible alternative only, with no quota evasion. Account pools are opt-in, independently authorized, and never cross tenants.

### Pass 14 — Deterministic state transitions and recovery
**Gap:** Retry decisions after crash may be made twice or against a changed registry. **Closure:** Persist `routing_decision_id`, candidate-set hash, policy/version hash, execution lease, attempt sequence and settlement state via existing durable job authority; use compare-and-swap fencing. Recovery revalidates authorization and resumes the recorded state machine rather than blindly re-executing. `T20`: crash between dispatch and receipt yields exactly one reconciled logical outcome; unresolved side effects remain `unknown_outcome` pending reconciliation.

### Pass 15 — Security of untrusted tool output
**Gap:** Tool output may contain prompt injection, malicious URLs, HTML/script or credential exfiltration instructions. **Closure:** Treat all backend output as untrusted data; strip executable content for UI, isolate document rendering, disallow instructions from content changing tool authority, enforce egress allowlists and SSRF protections, cap payload size, sanitize logs. `T21`: adversarial retrieved content cannot trigger a new privileged action, access localhost/cloud metadata, or leak secrets. Apply tenant-specific retention and redaction before indexing in SPEC-266.

### Pass 16 — Human approval, delegated identity and revocation
**Gap:** Consent/approval granted for one backend may be reused in another environment. **Closure:** Approval token is short-lived and bound to principal, tenant, capability, target resource, side-effect class, runner trust tier, backend and request hash. Reauthorize on backend switch and before execution; revoke on logout, policy change, runner disconnect or user cancellation. `T22`: approval for desktop read-only search does not authorize cloud authenticated browser or write operation.

### Pass 17 — Observability without cardinality/cost explosion
**Gap:** Per-request identifiers in metrics or full source bodies in logs can cause runaway telemetry cost and privacy leakage. **Closure:** Use bounded-cardinality metrics labels (capability, backend class, environment, error class), request IDs only in trace/audit storage with TTL; sampling and per-tenant budgets; privacy-safe evidence pointers; redact tokens/cookies/PII. Required SLI definitions: eligible request success, quality-valid success, fallback recovery, p95 end-to-end latency, cost per successful request, unknown-outcome age, false-positive readiness. `T23`: high-volume tracing remains within configured retention and cost ceilings.

### Pass 18 — Deployment choreography and safe disablement
**Gap:** Rolling updates may mix resolver/adapter/worker versions and leave jobs stranded. **Closure:** Feature flags per tenant/capability/backend, shadow-only phase, staged canary, compatibility matrix for active runner versions, migration expand→backfill→verify→switch→contract, rollback rehearsals, and immutable deployment manifest linking commit, image digest, schema revision and routing policy version. SPEC-293/294/295 ownership must be confirmed in repo. `T24`: mixed-version fleet and forced rollback preserve existing jobs and avoid duplicate settlement.

### Pass 19 — Browser and Agent-Reach operational limitations
**Gap:** A healthy CLI does not prove logged-in platform access; platform ToS or CAPTCHA may prevent reliable operation. **Closure:** Separate `binary_ready`, `provider_reachable`, `session_authorized`, `capability_verified` and `policy_permitted`. Never automate CAPTCHA bypass or anti-bot circumvention; require user-managed session where allowed. Pin Agent-Reach release and dependency digests after license/security review; use subprocess sandbox with timeout, CPU/memory/output limits, restricted filesystem and egress, and no ambient environment secrets. `T25`: CLI doctor passes but login expires; backend is unavailable for authenticated request and alternative route is evaluated safely.

### Pass 20 — Economics, adoption and stop/go evidence
**Gap:** A high architectural score does not establish real-world ROI. **Closure:** Measure representative baseline before rollout, compare shadow/canary against current routing on the same workload and policy. Report incremental engineering/maintenance cost, adapter failure rate, operational overhead, actual paid API cost, quality-valid completion, and p95 latency. Promotion requires no regression in policy/security/data integrity and documented measurable benefit in at least one of completion rate, cost-per-quality-success or operational toil. Stop or disable Agent-Reach integration if incremental maintenance outweighs measured benefit. `T26`: canary report provides baseline, sample size, cohort, confidence/limitations and rollback decision.

## 24. Required state and error contracts (R1.2)

- **Decision states:** `requested → policy_checked → candidates_filtered → reserved → dispatched → validating → succeeded|partial|failed|denied|cancelled|unknown_outcome`. `retry_pending` and `approval_pending` are durable intermediate states; no transition may bypass policy or budget checks.
- **Canonical errors:** `unsupported_contract`, `no_equivalent_backend`, `auth_required`, `approval_required`, `policy_denied`, `rate_limited`, `budget_exhausted`, `deadline_exceeded`, `backend_unhealthy`, `output_invalid`, `source_conflict`, `insufficient_evidence`, `unknown_outcome`, `cancelled`. Map backend-native errors to these without losing sanitized diagnostic detail.
- **Fallback eligibility:** `read_only` or provably idempotent actions only by default. Any non-idempotent/unknown-outcome operation requires authoritative reconciliation or explicit new approval before another attempt.
- **Health TTL:** readiness is advisory, not authority. Recheck security and budget at dispatch. Use separate transient health expiry and longer audit retention, both configurable and privacy-reviewed.
- **Failure handling:** If every candidate fails hard constraints, return an actionable normalized failure; never silently downgrade requested coverage, freshness, data residency, or security.

## 25. Release gates and evidence requirements (R1.2)

| Gate | Evidence artifact | Owner to confirm in repository | Fail condition |
|---|---|---|---|
| G0 canonical authority | spec registry collision report, dependency mapping | spec integration owner | 289 collision or unresolved authority |
| G1 compatibility | SPEC-256 API diff, schema fixtures, Mini App contracts | capability owner | breaking change to implemented callers |
| G2 safety | threat model, permission matrix, injection and isolation tests | security owner | high/critical finding |
| G3 correctness | T01–T26 test logs, retry/recovery and reconciliation traces | orchestration owner | duplicate side effect, lost settlement |
| G4 platform | CF/runner mixed-version canary, migration plan, rollback drill | platform owner | unrecoverable job/schema state |
| G5 economics | measured baseline and canary comparison, cost ceiling | product/ops owner | unjustified regression or cost |
| G6 operations | dashboards, alerts, runbook, incident and disable procedure | operations owner | no safe disable/rollback |

`T01–T16` refer to acceptance scenarios A01–A16 in section 20; `T17–T26` are specified in section 23. Each test must have an automated ID, fixture, assertion, execution environment, timestamp, commit/version reference and evidence link. The release is **BLOCKED** until G0–G6 are evidenced; document review alone does not mark these gates PASS.

## 26. Review ledger — additional 10 passes (R1.2)

| Pass | Gap identified | Closure | Status |
|---|---|---|---|
| 11 | version negotiation | immutable schema and T17 | SPEC ADDRESSED; TEST PENDING |
| 12 | source conflicts | provenance and T18 | SPEC ADDRESSED; TEST PENDING |
| 13 | quota fairness | provider limits and T19 | SPEC ADDRESSED; TEST PENDING |
| 14 | crash replay | durable routing state and T20 | SPEC ADDRESSED; TEST PENDING |
| 15 | prompt injection/SSRF | untrusted-output boundary and T21 | SPEC ADDRESSED; TEST PENDING |
| 16 | approval portability | bound approval and T22 | SPEC ADDRESSED; TEST PENDING |
| 17 | telemetry growth | metrics discipline and T23 | SPEC ADDRESSED; TEST PENDING |
| 18 | rolling deploy | version matrix and T24 | SPEC ADDRESSED; TEST PENDING |
| 19 | false health | verified auth/session and T25 | SPEC ADDRESSED; TEST PENDING |
| 20 | uncertain ROI | measurable canary gate and T26 | SPEC ADDRESSED; TEST PENDING |

**Current status:** R1.2 is a strengthened development specification. There is no claim of repository validation, automated test execution, Agent-Reach compatibility certification, or production readiness. Any future document review should preserve the cumulative ledger and record concrete new findings rather than incrementing a PASS counter without evidence.


## 27. R1.3 — Third ten-pass design review (passes 21–30)

This review is a document-level adversarial walkthrough against the R1.2 contracts, not an executed repository or production audit. All clauses in this section are normative additions; where an earlier clause is less restrictive, this section governs pending canonical-owner reconciliation.

### Pass 21 — Distinguish discovery, authorization and invocation
**Gap:** Registry visibility could be mistaken for a right to execute. **Requirement:** Separate `discoverable`, `eligible_for_principal`, `invocable_in_environment`, and `authorized_at_dispatch`. Search/discovery must not expose tenant-private backend names or credential metadata. Cache keys must include tenant, principal scope, policy epoch and environment. **T27:** two tenants query the same capability; neither discovers the other's private backend, even after cache warmup.

### Pass 22 — Backend semantic equivalence and pagination
**Gap:** Providers with the same nominal capability can differ in language coverage, search operators, ranking, pagination, timestamp meaning, and result count. **Requirement:** Define a per-capability semantic profile with required/optional fields, filters, supported locales, coverage guarantees, maximum page size, cursor provenance and freshness semantics. Reject fallback if mandatory semantics cannot be met; explicitly label partial coverage when caller opted in. Cursors must be opaque, tenant-bound, backend-bound and expire; never replay cursor on a different provider. **T28:** mid-pagination fallback must restart a new query with dedup and visible continuity warning or fail explicitly, never mix incompatible cursors.

### Pass 23 — Hedging, racing and cancellation
**Gap:** Parallel candidate execution can multiply spend and side effects. **Requirement:** Disable hedged requests by default. Permit only read-only, policy-approved, bounded fanout with one global deadline, one budget reservation envelope, per-attempt cost accounting and cancellation propagation. Winner selection requires validated output; losers are cancelled and their late receipts still reconciled. **T29:** two hedged reads return at different times; no untracked spend, late evidence or orphan worker remains.

### Pass 24 — Credential and session lifecycle
**Gap:** Credential expiry, rotation, runner loss or tenant deletion can leave durable jobs holding stale authority. **Requirement:** Store only scoped secret references; fetch at dispatch with just-in-time authorization; never persist cookies, tokens or decrypted values in queue payloads, traces, evidence or agent-visible responses. Invalidate health, cached authorization and active leases on credential revocation or tenant suspension; running side effects obey cancellation/reconciliation policy. **T30:** revoke a credential between reservation and dispatch; request is denied without using cached permission.

### Pass 25 — Data governance across execution locations
**Gap:** Routing from local browser to cloud or third-party API may silently move personal/confidential data across trust boundaries. **Requirement:** Every candidate declares processing region, subprocess/network egress, retention, data classification ceiling and subprocessor. Policy evaluates input *and* expected output sensitivity before transfer; residency and consent are hard filters, not score weights. Include redaction/minimization before dispatch and data-deletion workflow for cached payloads/evidence with legally required audit retained separately. **T31:** EU/Thai residency constrained request cannot fail over to an ineligible region even when it is the only healthy backend.

### Pass 26 — Health poisoning and feedback loops
**Gap:** A malicious or noisy worker can report false health and distort ranking; router may oscillate between providers. **Requirement:** Health signals are signed/attributed to trusted probes, scoped by region/account/session, bounded in age, and weighted by actual validated outcomes. Use minimum sample counts, hysteresis, circuit breaker half-open probe limits and independent quarantine on suspicious divergence. No backend may self-certify permission or bypass a hard filter. **T32:** forged healthy report and flapping provider cannot trigger unauthorized selection or endless oscillation.

### Pass 27 — Agent-Reach dependency and feature compatibility
**Gap:** Upstream releases can rename commands, alter JSON output or pull unsafe dependencies. **Requirement:** Define a pinned adapter compatibility manifest (`adapter_version`, `upstream_commit_or_release`, `supported_commands`, `output_schema_hash`, `runtime_os_arch`, `license_review`, `security_scan_digest`). No implicit install/update from user request; admin-approved staged updates only. Prefer structured outputs; treat stdout/stderr as untrusted, sanitize, cap size and map exit codes. Unsupported platform/capability is `unavailable`, not silently substituted. **T33:** incompatible upstream output is rejected and isolated while native/MCP paths remain operational.

### Pass 28 — Reproducible decisions and audit minimization
**Gap:** Mutable weights and model-based rankings make post-incident decisions impossible to reproduce. **Requirement:** Persist algorithm version, feature flags, hard-filter outcomes, candidate hashes, normalized score components, health snapshot timestamp and tie-break rule; redact sensitive provider metadata from user-visible evidence. For any stochastic scorer, pin model/version and record its decision inputs in privacy-safe form; deterministic rules must be the default. **T34:** replay the same frozen policy/candidate/health snapshot and obtain identical selected backend and reason codes.

### Pass 29 — Availability and disaster recovery
**Gap:** Registry/health store outage could stop all capabilities even though existing direct integrations still work. **Requirement:** Define explicit fail-closed for new privileged or sensitive operations. For eligible read-only calls, permit a short-lived, signed, policy-bound last-known-good route only when authorization can be freshly verified; otherwise return a normalized unavailable error. Preserve existing SPEC-256 direct path behind feature flags; rehearse control-plane outage, stale cache, regional failover and durable recovery with RPO/RTO owned by platform operations. **T35:** registry outage never causes unauthorized fallback, and disablement restores the pre-extension path without corrupting jobs.

### Pass 30 — Migration, adoption and governance of contract owners
**Gap:** Multiple specs may claim responsibility for retries, billing, permissions and deployment. **Requirement:** Before implementation produce a repository-derived authority matrix mapping each contract to exactly one canonical owner and one integration seam. No new billing ledger, job state store, permission system, secret vault or deployment dashboard in SPEC-289. Require existing baseline measurement, tenant opt-in, support runbook, documentation for SDK/Mini App authors, deprecation policy and acceptance signatures from security, platform and capability owners. **T36:** contract ownership review identifies no competing writer of economic settlement or job terminal state.

## 28. R1.3 — Executable acceptance additions and release criteria

| ID | Automated fixture / assertion | Required evidence |
|---|---|---|
| T27 | tenant-separated registry and cache | isolated discovery traces |
| T28 | incompatible pagination cursor during fallback | no cursor mixing; explicit restart/failure |
| T29 | bounded hedged read and late receipt | complete cost/attempt reconciliation |
| T30 | credential revoked after reservation | dispatch denied; no secret leak |
| T31 | data residency / egress constraint | ineligible backend excluded |
| T32 | forged probe and health flapping | quarantine and stable selection |
| T33 | Agent-Reach output schema drift | adapter isolated; core unaffected |
| T34 | frozen-decision deterministic replay | exact backend and reason-code match |
| T35 | registry outage / rollback | fail-closed or permitted signed LKG |
| T36 | ownership conflict scan | single-writer contract map |

**Release gate amendment:** G0 requires repository-confirmed SPEC-289 identifier and authority matrix; G2 includes T27/T30/T31/T32; G3 includes T28/T29/T34; G4 includes T33/T35; G5/G6 include T36 and measured operational ownership. All T01–T36 must be traceable to CI test IDs and retained evidence before a production PASS claim. Prior A01–A16 and T17–T26 remain required. If the repository has different canonical interfaces, update this proposal's adapter seams rather than modifying implemented owners by assumption.

## 29. R1.3 — Review ledger and unresolved external blockers

| Pass | Finding | Spec change | Validation status |
|---|---|---|---|
| 21 | discovery leaks authorization metadata | scoped discovery/cache | SPEC ADDRESSED; TEST PENDING |
| 22 | semantic and pagination mismatch | semantic profiles and cursor binding | SPEC ADDRESSED; TEST PENDING |
| 23 | parallel fallback cost/side effects | bounded hedging | SPEC ADDRESSED; TEST PENDING |
| 24 | revoked credential replay | JIT secret references | SPEC ADDRESSED; TEST PENDING |
| 25 | cross-region privacy exposure | residency hard filters | SPEC ADDRESSED; TEST PENDING |
| 26 | poisoned/flapping health | trusted probes and hysteresis | SPEC ADDRESSED; TEST PENDING |
| 27 | upstream CLI drift | pinned compatibility manifest | SPEC ADDRESSED; TEST PENDING |
| 28 | non-reproducible ranking | decision snapshots | SPEC ADDRESSED; TEST PENDING |
| 29 | control-plane outage | safe degraded mode | SPEC ADDRESSED; TEST PENDING |
| 30 | overlapping contract owners | authority matrix | SPEC ADDRESSED; TEST PENDING |

**Still open (external evidence):** actual repository spec registry/number collision check; code-level compatibility with SPEC-256 and all deployed services; verified scope of SPEC-293/294/295; Agent-Reach upstream license/version/security review; real Cloudflare/runner capability; CI tests T01–T36; security and economics canary; migration/rollback drill. **No production or implementation PASS is claimed.**
