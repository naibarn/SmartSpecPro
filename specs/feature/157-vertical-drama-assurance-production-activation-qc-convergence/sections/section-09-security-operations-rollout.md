# Section 09 — Security, Operations, Migration, Rollout, and Incident Recovery

## Outcome and delivery boundary

This section makes the Feature 157 assurance path safe to operate for real
tenants and reversible without deleting accepted work, guessing financial
outcomes, or treating local tests as production proof. It consumes the durable
execution/attempt/event owner from Section 02, the provider-call and billing
contracts from Section 03, the runtime/flag semantics from Section 06, and the
additive API projection from Section 08. It does not create another runtime,
ledger, provider owner, status store, or creator-facing route.

The deliverable is complete only when tenant and role boundaries are enforced
at every lookup, production-safe metrics and alerts exist, additive migration
and proven-only backfill are rehearsed, every rollout flag remains dark until
its release gate passes, and an operator can inspect, reconcile, disable, and
recover the path using a reviewed runbook. Section 10 remains the owner of live
browser, deployed Node-to-Python, provider, migration, and production-canary
evidence and of the final decision to enable active traffic.

### Dependency contracts this section must not redefine

- `verticalDramaStoryGenerationRuns` remains the execution parent;
  `verticalDramaAssuranceAttempts` and `verticalDramaAssuranceEvents` are the
  immutable-attempt and ordered-event children defined by Section 02.
- `verticalDramaAssuranceRepository.ts` owns scoped reads, event append,
  leases/fences, projections, and finalization coordination.
- `verticalDramaAssuranceReconciliation.ts` owns repeat-safe stale and
  uncertain-side-effect classification. This section schedules, observes, and
  documents it; it does not add another reconciler.
- `verticalDramaAssuranceBilling.ts`, the existing `creditService`, and the
  existing media/provider task owner remain the only financial/provider
  authorities.
- `verticalDramaAssuranceAdapter.ts` and `runtimeSelection.ts` own the frozen
  runtime selection. Operational flags may select a supported mode but may not
  alter billing owner, hashes, provider-call identity, or a running attempt's
  immutable envelope.
- The client receives only the additive Section 08 projection. Operator-only
  evidence, provider correlation, and redacted traces are not added to normal
  creator responses.

## Blocking migration-number preflight

The current migration journal already contains
`0240_vertical_drama_draft_series_link` through
`0244_vertical_drama_prompt_expansion`. Therefore the provisional Section 02
filename `0240_vertical_drama_assurance_attempts_reconciliation.sql` conflicts
with an existing migration and must not be created, overwrite the existing
0240 file, or be inserted retroactively into the journal.

Before implementation, reconcile the Section 02 plan and use the next free
ordered migration in this checkout:

- `apps/web/drizzle/0245_vertical_drama_assurance_attempts_reconciliation.sql`;
- matching `idx: 231`, `tag:
  "0245_vertical_drama_assurance_attempts_reconciliation"` entry in
  `apps/web/drizzle/meta/_journal.json`; and
- matching Drizzle exports in `apps/web/drizzle/schema.ts`.

If another merged migration claims 0245 before implementation starts, stop and
select the then-current next free number by reading the journal and filesystem;
never renumber an applied migration. This consistency correction must also be
reflected in Section 02 during the mandatory cross-section review.

## Tests First

Write the following failing tests before operational code, scripts, or docs.
All provider, credit, queue, Redis, and secret dependencies are fakes in local
tests. No test in this section may call a live model/provider, mutate a real
tenant, or apply a migration to production.

### Tenant, authentication, role, and non-disclosure tests

Add
`apps/web/server/services/__tests__/verticalDramaAssuranceSecurity.test.ts`
and extend the focused router/repository suites to prove:

1. Missing `ctx.user` is `UNAUTHORIZED`; missing `ctx.tenantId` fails closed;
   neither condition reaches repository, runtime, credit, storage, or provider
   code.
2. Creator operations remain on `verticalDramaProcedure` and derive `userId`
   and `tenantId` only from authenticated context. Client payload, draft text,
   trace metadata, provider response, and media URL cannot override identity.
3. Execution, attempt, event, trace reference, repair, cancel, retry,
   candidate, provider-call, authorization, and reconciliation reads require
   tenant, user, and domain-owner scope. A valid opaque ID from another tenant
   or user returns `NOT_FOUND` and leaks no state, amount, provider, or owner.
4. Series-owned operations reuse `requireTenantId`, `seriesOwnershipWhere`, and
   `loadOwnedSeries` in
   `apps/web/server/routers/verticalDramaSeries.ts`. Pre-create Draft QC uses
   the owner-scoped draft ledger/repository methods rather than pretending a
   series exists.
5. Normal creators cannot read operator traces, invoke forced reconciliation,
   alter rollout evidence, or enable active flags through a Vertical Drama
   procedure.
6. `tenantFeatureFlagsRouter.updateFeatureFlags` preserves its existing RBAC:
   `domain_admin` is restricted to its DB-verified registered domain/tenant,
   and `admin` may target an explicit tenant. Feature 157 adds no broader role
   alias or bypass.
7. Enabling an active Feature 157 flag or disabling an asserted kill switch is
   rejected when release evidence is absent, stale, for another tenant/cohort,
   or for another release. Turning a kill switch on is always permitted.
8. Automated reconciliation accepts only a server/worker-owned scope object
   and current lease/fence. No browser-callable procedure can manufacture a
   worker actor or fence token.
9. Cross-tenant failures are indistinguishable from missing resources in the
   public contract, while tenant-safe operator diagnostics retain only stable
   reason codes and correlation IDs.

### Prompt-injection, URL, storage, and resource-boundary tests

Extend
`apps/web/server/services/__tests__/agentRuntimeRedaction.test.ts`,
`agentRuntimeRequestBuilder.test.ts`,
`managedStorageAuthorizationService.test.ts`, and the Python Agent Runtime
security suites with these cases:

- retrieved HTML, uploaded documents, OCR, subtitles, transcripts, story and
  prompt text containing tool-like or instruction-like content remain labelled
  untrusted evidence and cannot change task kind, tool scope, tenant, output
  schema, required readiness, budget, provider, or side-effect policy;
- only server-issued evidence, claim, asset, segment, and context references
  survive output validation; invented IDs and unknown references are blocking
  findings and are never resolved by URL lookup;
- managed media must pass `canReadManagedStorageKey` and then use
  `resolveExternalMediaReferenceUrls` for a short-lived provider transport
  reference; provider URLs and signed broker URLs are never durable ownership
  evidence and are absent from traces/events;
- arbitrary `http`, loopback, RFC1918, link-local, metadata-service,
  credential-bearing, DNS-to-private, and redirect-to-private URLs are denied
  before fetch. Reuse `validateReferenceUrls`/the existing SSRF guards rather
  than adding a weaker Vertical Drama parser;
- Feature 157 manifests expose zero tools for the initial task budgets. Hosted
  web/file search, computer use, code interpreter, shell, remote MCP, and
  image/audio/video generation stay disabled unless a later reviewed manifest
  and section explicitly authorize them;
- Section 06 ceilings are enforced server-side: Draft QC/repair is at most 3
  turns, 0 tools, one parallel agent, 150 seconds, 24k input tokens, 6k output
  tokens, and one structural repair; the other task-family profiles retain the
  exact Section 06 limits. Client/Python values may narrow but never widen
  them;
- the current `MAX_DRAFT_BYTES = 160_000` Draft QC limit remains enforced,
  media/reference counts use their existing stage schemas, and per-tenant
  concurrency is acquired through `AgentRuntimeBackpressureController` before
  dispatch and always released after success, failure, cancellation, or timeout;
- malformed oversized input, queue pressure, budget exhaustion, and rate limit
  produce one stable `awaiting_action`/`retryable_failed` projection and do not
  recurse, reserve again, or hold the workspace locked.

### Secret and service-boundary tests

Extend
`apps/web/server/services/__tests__/agentRuntimeClient.test.ts` and
`python-backend/tests/api/test_internal_openai_agents_runtime.py` to prove:

- `AgentRuntimeClient` obtains the internal credential only through
  `getPreferredInternalToken`; no request body, durable attempt/event,
  checkpoint, metric label, or error details contain the credential;
- Python `_verify_internal_token` rejects missing/mismatched tokens with a
  constant-time comparison and fails closed when neither
  `SMARTSPEC_WEB_GATEWAY_TOKEN` nor `SMARTSPEC_PROXY_TOKEN` is configured;
- `x-platform-request-id`, `x-tenant-id`, runtime surface, manifest, request,
  attempt, and body identity must agree. Headers provide correlation, not
  authority to substitute a different tenant in the body;
- provider API keys remain in the existing provider/runtime configuration and
  are never copied into Feature 157 records. `redactRuntimeMetadata` and both
  Node/Python trace-redaction layers remove JWTs, bearer tokens, cookies,
  provider keys, signed URLs, private document fragments, prompt/story text,
  raw model output, and authorization headers;
- rotating the primary gateway token while retaining the compatibility token
  permits a bounded overlap and health check, after which the old token is
  rejected. Rotation does not change attempt or provider idempotency.

### Metrics, SLO, and alert tests

Add
`apps/web/server/services/__tests__/verticalDramaAssuranceObservability.test.ts`
and an HTTP metrics regression to prove:

- every metric uses bounded enum labels; tenant IDs, user IDs, execution IDs,
  attempt IDs, provider task IDs, source fingerprints, prompts, URLs, and error
  strings never appear as metric labels;
- `task_kind`, bounded `profile_id`, `assurance_mode`, `model_policy`,
  `provider`, `tenant_class`, and `release` are normalized to known buckets;
  unknown values become `other` rather than creating unbounded cardinality;
- transitions, terminal states, repair/recovery, stale runs, final-gate blocks,
  credits, provider uncertainty, reconciliation age, runtime calls, and
  duplicate-effect prevention update the expected counters/histograms/gauges;
- execution ID, attempt ID, provider-call ID, reservation ID, authorization ID,
  trace ID, and event cursor remain available only in the tenant-scoped
  durable event/trace record for correlation;
- `/metrics` continues to expose existing agent-registry metrics and adds the
  Feature 157 metrics without duplicate registration during hot reload/tests;
- a backlog snapshot is derived from durable repository state, not Redis-only
  records, and an empty/erroring snapshot cannot be mistaken for zero healthy
  work;
- each hard-invariant alert is generated from a specific metric/repository
  condition and carries no tenant-private payload.

### Migration and proven-only backfill tests

Add
`apps/web/drizzle/__tests__/feature157VerticalDramaAssuranceSchema.test.ts` and
`apps/web/scripts/__tests__/backfill-vertical-drama-assurance.test.ts`:

1. The migration number is free, registered once, ordered after 0244, and does
   not alter the text or journal identity of migrations 0238–0244.
2. The migration is additive: no `DROP TABLE`, `TRUNCATE`, destructive column
   rewrite, or payload copy; new parent fields are nullable/versioned for old
   rows, and new attempt/event records enforce tenant scope and bounded
   reconciliation indexes.
3. Old Feature 152 inserts and reads work before and after migration. Existing
   Draft save/edit/status reads remain available with every Feature 157 flag
   off.
4. Dual-read projects a legacy row without inventing attempt, owner, score,
   readiness, accepted version, or recovered status.
5. Dual-write failure cannot make the legacy write appear successful in new
   state; the caller receives a typed persistence outcome and no half event.
6. Backfill defaults to dry-run, requires an explicit tenant scope for apply,
   uses a stable primary-key cursor and bounded batch size, and prints redacted
   imported/skipped/conflicting counts plus the next cursor.
7. A row is imported only when tenant, user, domain owner, source
   version/fingerprint, contract hash, attempt ID, and domain candidate/final
   reference agree with authoritative ledgers. Legacy success additionally
   requires accepted/finalization evidence; recovered additionally requires an
   exact current baseline.
8. Ambiguous or contradictory rows remain legacy with a stable
   `legacy_unproven_*` reason; rerunning the batch is idempotent and creates no
   duplicate attempt/event.
9. A lock timeout or process interruption leaves the current row/batch
   retryable. The migration/backfill never holds a transaction across model,
   provider, Redis, or object-storage calls and never blocks draft authoring
   for the duration of a batch.
10. App-level rollback reads old and new rows while leaving additive schema and
    imported evidence intact.

### Rollout, kill-switch, and runbook contract tests

Add
`apps/web/server/services/__tests__/verticalDramaAssuranceRollout.test.ts` and
tests for the operator script:

- all five canonical domain flags exist in `TenantFeatureFlags`,
  `ALLOWED_FEATURE_FLAGS`, `FEATURE_FLAG_DEFAULTS`, and
  `VERTICAL_DRAMA_ASSURANCE_FEATURE_FLAG_KEYS`, and default `false`;
- use `verticalDramaStoryAssuranceActive` as the canonical story/season key
  from Section 01/06. Do not register the earlier
  `verticalDramaStorySeasonOrchestraActive` alias;
- precedence is domain/global kill switch or
  `openAiAgentsRuntimeForceRollback` → legacy/fenced dispatch, then task-family
  active with generic prerequisites, then shadow with generic prerequisites,
  otherwise legacy;
- flag-store failure selects legacy for advisory work and cannot weaken a paid
  or export gate. The frozen attempt snapshot is unchanged by later flag drift;
- enabling shadow/active requires the correct release/cohort evidence and
  dependency phase. Enabling prompt/media before Draft QC or story/season
  before prompt/media is rejected;
- kill switch blocks new Agent dispatch/resume and unclaimed authorization but
  preserves accepted candidates, events, reservations, claimed/uncertain
  provider work, and the reconciler;
- the runbook/ops script is read-only by default. Mutating subcommands require
  `--apply`, exact tenant and execution/cohort scope, expected state version,
  and an idempotency key. Wildcard mutation is rejected;
- rollback and repeated incident commands are idempotent and never clear
  Redis, delete evidence, blind-refund, or resubmit.

## Security and tenancy implementation contract

### Data-plane roles

| Actor | Allowed | Explicitly forbidden |
| --- | --- | --- |
| Authenticated creator/editor | Existing owner-scoped start/status/history/repair/retry/cancel/inspect operations and editable draft/source/prompt UX | Supplying tenant/user identity, reading another owner, viewing raw traces/provider records, forcing reconciliation, changing rollout evidence |
| `domain_admin` | Existing `tenantFeatureFlagsRouter.updateFeatureFlags` for its DB-verified own tenant, subject to Feature 157 promotion gates | Cross-tenant flags, bypassing release evidence, changing attempts/credits/provider records directly |
| `admin` | Existing explicit-tenant feature-flag administration and tenant-safe operational inspection through the reviewed ops path | Bypassing ownership filters in creator routes, rewriting evidence, fabricating settlement, destructive schema rollback |
| Worker/reconciler | Scoped claim/renew/append/reconcile with current server-issued lease/fence and explicit tenant/domain owner | Browser delegation, identity inference, new paid submission during uncertain state, activation after fence loss |
| Agent/Python runtime | Bounded structured proposal/evaluation under the admitted manifest and read-only side-effect policy | DB/credit/storage/provider/publication authority, arbitrary URL fetch, owner inference, readiness or activation decision |

Do not add a generic `adminProcedure` endpoint to
`verticalDramaSeriesRouter` merely for convenience. Creator procedures remain
`verticalDramaProcedure`; operational reads/actions go through the CLI/service
boundary below and always require explicit tenant scope. If a future browser
operator surface is separately approved, it must reuse the existing admin RBAC
and return redacted projections only.

### Owner-scoped lookup contract

Every repository/service entry point takes a single explicit scope object and
never accepts optional tenant identity:

```ts
interface VerticalDramaAssuranceOwnerScope {
  tenantId: string;
  userId: number;
  domainOwnerType: "draft" | "series" | "episode" | "prompt" | "media_task";
  domainOwnerId: string;
}

interface VerticalDramaAssuranceOperatorScope {
  tenantId: string;
  actorUserId: number | null;
  actorRole: "admin" | "domain_admin" | "system_worker";
  reason: string;
}
```

Public lookups require `VerticalDramaAssuranceOwnerScope`. Operator scope does
not weaken SQL predicates: it changes the permitted operation and audit actor,
but the query still includes `tenantId` and the requested execution/domain
owner. A caller must prove the domain owner before following an execution,
attempt, event, trace, candidate, authorization, or provider-call reference.
Opaque IDs are correlation only.

### Trust and provider boundary

Build Agent input from server-captured `ProductionContextSnapshot` references
and bounded evidence summaries. Delimit all user/retrieved/provider content as
untrusted data and never interpolate it into system/tool instructions. Output
may refer only to the server-issued IDs in the admitted manifest; Node resolves
and validates those IDs again before a candidate, final gate, or provider
authorization can progress.

Media crosses an external provider boundary only after owner validation with
`canReadManagedStorageKey`. Use `resolveExternalMediaReferenceUrls` to issue a
short-lived broker URL when a provider needs bytes. Do not persist that URL in
assurance attempts/events and do not treat provider reachability as managed
storage durability. Raw arbitrary URLs are not an Agent capability in this
release.

### Secrets and retention

Reuse `getPreferredInternalToken` and Python `_verify_internal_token`; add no
Feature 157 API key. `SMARTSPEC_WEB_GATEWAY_TOKEN` is primary and
`SMARTSPEC_PROXY_TOKEN` is compatibility-only during rotation. Provider keys
stay with the existing runtime/provider configuration. Secret values and
headers are never copied into domain records, traces, metrics, fixtures, or
runbook output.

Retention classes are explicit:

- execution/attempt/event lineage and financial/provider correlation follow
  the existing ledger/legal retention and are never shortened by trace cleanup;
- redacted Agent runtime traces/checkpoints use the existing runtime retention
  policy and contain refs/hashes rather than story/evidence payloads;
- rejected candidate content remains only in its existing domain artifact
  owner, not duplicated into assurance events;
- short-lived broker URLs and internal headers are never retained;
- replay fixtures are redacted, tenant-neutral, network-disabled, and cannot be
  converted back into a paid request.

## Observability implementation

### Files and symbols

- Add
  `apps/web/server/services/verticalDramaAssuranceObservability.ts` exporting
  `recordVerticalDramaAssuranceAdmission`,
  `recordVerticalDramaAssuranceTransition`,
  `recordVerticalDramaAssuranceFinalGate`,
  `recordVerticalDramaAssuranceProviderCall`,
  `observeVerticalDramaAssuranceTerminalLatency`,
  `setVerticalDramaAssuranceBacklogSnapshot`, and
  `renderVerticalDramaAssuranceMetrics`.
- Use a dedicated `prom-client` `Registry` inside that module so hot reload and
  tests do not double-register global metrics. No new dependency is required.
- Update `apps/web/server/_core/index.ts` `/metrics` handler to concatenate the
  existing `renderAgentRegistryMetrics()` output with awaited
  `renderVerticalDramaAssuranceMetrics()` output. Existing agent-registry
  metrics must remain present.
- Reuse `persistAgentRuntimeTraceEvents`, `redactTracePayload`,
  `redactRuntimeMetadata`, the Section 02 ordered events, and Section 03 call
  records. Do not create a parallel durable telemetry table.
- Add a bounded backlog collector in
  `verticalDramaAssuranceReconciliation.ts` that returns aggregate counts and
  oldest ages from indexed durable fields. Metrics code receives aggregates,
  not tenant payloads.

### Metric contract

Use the `smartspec_vertical_drama_assurance_` prefix and these bounded series:

| Metric | Type | Required labels |
| --- | --- | --- |
| `admissions_total` | counter | task kind, profile ID, assurance mode, outcome, tenant class, release |
| `transitions_total` | counter | task kind, from state, to state, reason class, release |
| `terminal_total` | counter | task kind, terminal/actionable state, disposition, release |
| `terminal_latency_seconds` | histogram | task kind, assurance mode, outcome, release |
| `repair_total` | counter | task kind, requested/accepted/rejected/recovered outcome, release |
| `final_gate_total` | counter | task kind, required readiness, allow/block, bounded reason, release |
| `provider_calls_total` | counter | task kind, provider, call class, payer, outcome, release |
| `credits_total` | counter | task kind, payer, reserved/drawn/refunded/platform-shadow kind, release |
| `idempotency_conflicts_total` | counter | task kind, admission/event/settlement/authorization class, release |
| `nonterminal_runs` | gauge | task kind, state, tenant class, release |
| `oldest_nonterminal_age_seconds` | gauge | task kind, state, tenant class, release |
| `reconciliation_required` | gauge | task kind, provider, tenant class, release |
| `oldest_reconciliation_age_seconds` | gauge | task kind, provider, tenant class, release |
| `invariant_violations_total` | counter | invalid activation, duplicate credit, duplicate provider, tenant scope, missing final gate, release |

`tenant_class` is one of `internal`, `canary`, or `standard`; it is not a
tenant ID. `profile_id` is restricted to the authoritative thirteen-profile
registry plus `unknown`. Provider/model policy and reason values are normalized
to reviewed enums. Correlation IDs belong in redacted tenant-scoped traces and
events, never metric labels.

### Reliability objectives and release-blocking alerts

The following are operational objectives for this feature, not promises about
creative quality:

1. 100% of synthetic and canary admissions reach a durable terminal or
   actionable waiting state within 10 minutes, and no admitted run remains
   unclassified beyond the existing `DRAFT_QC_STALE_AFTER_MS` 30-minute hard
   stale boundary.
2. At least 99% of production admissions reach a durable terminal/actionable
   state within 10 minutes over a rolling hour. Provider outage states count
   as safe terminal/actionable outcomes when correctly classified.
3. 100% of activation, paid-provider, assembly, export, and publish decisions
   have a current context fingerprint, final-gate event, and CAS or provider
   authorization result.
4. Zero invalid candidate activations, duplicate user deductions, duplicate
   paid provider submissions, or tenant-scope violations.
5. 100% of browser-visible failures have a stable error code and next action;
   runtime/provider availability is reported separately from correctness.
6. `reconciliation_required` receives an operator SLA of 30 minutes. Any item
   older than 30 minutes is P1 and blocks cohort promotion; 60 minutes is a
   critical page and requires incident ownership until resolved or explicitly
   handed off.

Any value above zero for the four zero-tolerance invariants pages immediately,
asserts the Feature 157 kill switch, freezes cohort promotion/backfill, and
starts the relevant incident branch. A canary run beyond 10 minutes warns; a
run beyond 30 minutes is P1. A missing/erroring metrics snapshot is
`observability_unknown`, never a healthy zero. Document these thresholds in
the runbook and the existing alerting/Grafana/Cloud Monitoring configuration;
do not claim an alert exists until its firing and recovery paths are tested in
staging.

## Feature flags and release control

### Canonical flags and precedence

Section 06 owns registration/defaults; this section owns production cohort
configuration and promotion gates. The canonical keys are:

- `verticalDramaAssuranceShadow`;
- `verticalDramaDraftQcOrchestraActive`;
- `verticalDramaPromptQcOrchestraActive`;
- `verticalDramaStoryAssuranceActive`; and
- `verticalDramaAssuranceKillSwitch`.

All default false. Active/shadow selection additionally requires the generic
`openAiAgentsRuntimeEnabled` and matching shared-skill shadow/active flag.
`verticalDramaAssuranceKillSwitch` or `openAiAgentsRuntimeForceRollback` wins
over every positive flag. A running attempt keeps its frozen selection, but an
asserted kill switch fences future Agent dispatch/resume and unclaimed paid
authorization. Claimed or uncertain provider work continues reconciliation.

### Release-control seam

Add
`apps/web/server/services/verticalDramaAssuranceReleaseControl.ts`, following
the fail-closed pattern of `browserPolicyReleaseControl.ts`, with:

- `getVerticalDramaAssuranceReleaseGateStatus({ tenantId, phase, release })`;
- `assertVerticalDramaAssuranceFeaturePromotionReady({ tenantId, flagName,
  nextValue })`; and
- stable `blockedChecks` covering schema, dual-read/write, security,
  redaction, focused tests, replay/crash suite, browser, provider, migration,
  rollback drill, and prior-phase completion.

Call this assertion from `updateTenantFeatureFlags` in addition to the existing
browser-policy check. It applies when turning shadow/active flags on and when
turning the kill switch off. Turning the kill switch on and turning active or
shadow flags off always remains available. Missing Redis/release evidence fails
closed for promotion but does not prevent rollback.

Add `apps/web/scripts/vertical-drama-assurance-ops.ts` and an npm script
`assurance:vertical-drama:ops`. Its default subcommands (`status`, `inspect`,
`scan-stale`, `rollout-status`) are read-only and redacted. Mutating
subcommands (`reconcile`, `set-phase`, `assert-kill-switch`,
`clear-kill-switch`) require `--apply`, exact `--tenant-id`, expected state or
release version, reason, and idempotency key. It calls the service/repository
contracts; it does not issue raw update SQL, alter credits, or submit providers.

## Migration and backfill execution

### Additive deployment order

1. Verify migration journal/order and schema ownership in a disposable database.
   Apply 0238 if absent, then the corrected successor migration. Do not edit an
   already-applied migration.
2. Deploy schema-aware readers and old/new projection compatibility with every
   Feature 157 flag off. Confirm old Feature 152 and Draft QC writes still work.
3. Deploy dual-write with no new model call or hard gate. A new-write failure is
   visible and retryable; it is not hidden behind a successful legacy result.
4. Run dry-run backfill and compare counts against authoritative source tables.
   Apply only bounded, proven rows for one tenant/cohort at a time.
5. Enable shadow only after schema, backfill, redaction, and rollback-drill
   evidence is attached to the release gate.
6. Keep nullable/versioned compatibility fields and the old reader until all
   legacy leases, reservations, and provider reconciliations are terminal. Any
   removal is a later reviewed migration, not part of Feature 157 activation.

The migration adds metadata-only nullable columns and new child tables/indexes.
It must not add a non-null column with a table-rewriting default to the existing
execution parent. Set a bounded lock timeout in rehearsal and abort/retry the
deployment rather than waiting while authoring traffic is blocked. Create the
new active-scope index before considering the old Feature 152 partial index;
do not drop the old index in the same migration.

### Proven-only backfill

Add `apps/web/scripts/backfill-vertical-drama-assurance.ts` and npm script
`backfill:vertical-drama-assurance`. It is dry-run by default and supports
`--tenant-id`, `--after-id`, and `--limit` (maximum 500). `--apply` requires an
explicit tenant and refuses a wildcard. Output is a redacted JSON summary with
source range, imported, already-imported, skipped-by-reason, conflicts,
failures, and next cursor.

Import from `vertical_drama_story_generation_runs` and exact owner/domain
ledgers only under the Section 02 proven-only rules. Do not infer ownership from
series/draft content, infer a fingerprint from mutable current content, or
fabricate status, score, accepted version, recovery, credit, provider, or trace
facts. Ambiguous rows stay readable through the legacy projection and are
reported for manual review. Backfill has no model/provider/credit calls and is
safe to stop and rerun.

Rollback is application/flag-level. Additive tables and imported evidence stay
in place; do not run a destructive down migration.

## Rollout plan and promotion gates

Each phase requires the prior phase's evidence, no open zero-tolerance
invariant, no reconciliation older than 30 minutes, and an assigned operator.
Low organic traffic is supplemented with redacted synthetic fixtures; synthetic
proof does not replace authenticated browser or real provider proof.

| Phase | Flags/cohort | Minimum observation and exit gate |
| --- | --- | --- |
| 0 — dark schema | all domain flags false | migration rehearsal, old/new reads, dual-write/replay parity, security/redaction tests, rollback drill |
| 1 — internal shadow | shadow true for explicit internal tenant/series cohort; active false | at least 24 hours and 50 admitted comparisons; zero user credit/domain/provider side effects; no unexplained baseline/hash divergence |
| 2 — internal Draft QC active | Draft active for explicit internal cohort only | at least 24 hours and 50 Draft QC/repair runs; observed recovery regression, restart/Redis expiry, exact credits, stable UI actions, kill-switch drill |
| 3 — Draft QC tenant canary | allowlisted canary tenants, then 5%, 25%, 100% of eligible tenants | at least 24 hours at 5% and 48 hours at 25%; SLOs and hard invariants pass before each promotion |
| 4 — prompt/media canary | prompt active only after Section 07 chain and Section 10 provider proof | enable the whole fingerprinted frame/reference/video/B-roll chain; `provider_ready`, authorization, storage, rights, and reconciliation gates pass |
| 5 — story/season canary | story/season active last | Feature 152/153 parity, all-profile matrix, cross-stage fingerprint, browser, provider, and production evidence pass |

Do not enable video prompt in isolation against legacy/stale visual inputs. Do
not count legacy fallback continuity as Agent-active proof. Record active,
shadow, legacy, and fallback evidence separately by release and cohort.

## Rollback and incident recovery

### Standard rollback

1. Assert `verticalDramaAssuranceKillSwitch` for the affected tenant/cohort;
   for systemic runtime risk also assert `openAiAgentsRuntimeForceRollback`.
2. Disable task-family active and shadow flags. Do not clear queues or Redis.
3. Verify no new Agent dispatch/resume or unclaimed provider authorization is
   created after the switch timestamp.
4. Keep the reconciler running for claimed/accepted/uncertain provider calls
   and existing reservations. Never refund or resubmit from timeout/absence.
5. Verify creator edit/save/inspect and supported deterministic fallback paths,
   and verify unsafe paid/export transitions remain blocked.
6. Inspect nonterminal/uncertain attempts by exact tenant/execution and wait for
   terminal reconciliation or transfer incident ownership.
7. Roll application traffic to the previous compatible revision only after
   confirming it can read the additive schema. Do not remove the schema or
   accepted domain versions.
8. Record timestamps, flags, affected cohorts, outstanding reconciliations,
   and verification evidence in
   `implementation/section-09-operations-evidence.md`.

### Incident branches

| Incident | Immediate containment | Recovery rule |
| --- | --- | --- |
| Suspected cross-tenant access | Global/domain kill switch, stop backfill and cohort promotion, preserve events/traces, page Security | No resume until scoped-query and log review proves affected tenants; do not expose existence through creator APIs |
| Invalid candidate activation or missing final gate | Kill switch affected task family, fence active attempts, preserve accepted/current versions and candidate evidence | Repair through domain ledger/CAS; never overwrite a newer user edit or delete evidence |
| Duplicate/uncertain credit | Stop new user-paid admissions for task family; query call/reservation/`credit_transactions` by idempotency/settlement key | Settle/refund exactly once only from authoritative evidence; estimates are not debits |
| Duplicate/uncertain provider submission | Stop new authorization/submission, keep polling/reconciliation | Attach recovered provider task to original call; never rotate provider or resubmit while acceptance is uncertain |
| Worker restart or Redis loss | Keep authoring available; inspect durable lease/event projection; run bounded reconciler | Fence stale worker, resume existing attempt or classify stale/recovered/reconciliation-required; never readmit from missing Redis alone |
| Migration lock/failure | Abort migration on lock timeout, leave flags off, confirm old reads/writes and journal state | Fix forward and rerun on disposable/staging first; never edit an applied migration or execute destructive rollback |
| Agent runtime/provider outage | Kill/disable Agent active path as needed; preserve legacy advisory flow | Paid/export boundary fails closed unless deterministic path independently proves every gate; availability failure must not corrupt state |
| Secret exposure | Assert kill switch, rotate `SMARTSPEC_WEB_GATEWAY_TOKEN`, retain bounded compatibility only during verification, audit traces/logs | Confirm old token rejection and Node/Python health before clearing kill switch; do not change logical idempotency |
| Metrics/trace blind spot | Freeze promotion and treat health as unknown | Restore exporter/trace persistence and replay the alert test; absence of data is never a pass |

## Operator runbook and evidence files

Add `docs/runbooks/vertical-drama-assurance.md`. It must contain prerequisites,
role/access boundaries, exact safe commands, expected output, decision trees,
rollback triggers, incident ownership, and an evidence checklist for:

- inspecting one execution/attempt/source/context/candidate/final-gate chain;
- checking lease/heartbeat/event cursor and recovering worker/Redis expiry;
- confirming whether a recovered Draft QC result is current and repairable;
- reconciling model usage, reservation/draw/refund, provider authorization, and
  provider task without blind side effects;
- inspecting all stale/reconciliation items for one tenant in bounded pages;
- applying and verifying migration 0245 in a disposable/staging database;
- dry-running and applying one bounded proven-only backfill batch;
- setting shadow/canary phases, asserting/clearing the kill switch, and rolling
  back one task family;
- rotating the internal Node/Python token without writing it to command output;
- separating local, migration, browser, deployment, provider, and canary proof.

The runbook uses `assurance:vertical-drama:ops` rather than ad hoc update SQL.
Read-only status is the default. Every mutation example includes `--apply`,
tenant scope, expected state/release version, reason, and idempotency key, and
states whether the action is reversible. Commands never print secrets, story
text, prompt text, signed URLs, or private evidence.

Record implementation evidence under the feature planning directory:

- `implementation/section-09-security-evidence.md`;
- `implementation/section-09-migration-rehearsal.md`;
- `implementation/section-09-operations-evidence.md`; and
- Section 10's separate browser/provider/canary/deployment evidence files.

An empty or “not run” evidence file is not a pass. Each item records environment,
release/revision, tenant class (not raw tenant data), command category, start/end
time, result, skipped checks, and artifact reference.

## TDD implementation sequence

1. Correct the migration-number contract and add migration/journal/schema tests.
2. Add tenant/role/non-disclosure and secret/provider-boundary tests; close any
   fail-open repository or router seam before operational activation work.
3. Add observability metric and redaction tests, then implement the dedicated
   registry/exporter and durable backlog snapshot.
4. Add rollout/promotion/kill-switch tests, then implement release control and
   integrate it into `updateTenantFeatureFlags` without changing unrelated flag
   behavior.
5. Add backfill planner tests, then implement the dry-run-first bounded script
   and rehearse it against fixtures/disposable Postgres.
6. Add ops-script tests, then implement read-only inspection and explicit
   mutation subcommands over the existing repository/reconciler/flag services.
7. Write the runbook, walk every command in a non-production environment, and
   capture migration/rollback/alert evidence.
8. Rerun focused Node/Python/security/migration suites and hand the remaining
   live evidence gates to Section 10. No active production flag is enabled by
   this implementation commit.

## Concrete verification commands

Run focused local proof from the repository root:

```bash
npm --workspace apps/web test -- \
  shared/__tests__/verticalDramaAssuranceFeatureFlags.test.ts \
  server/services/__tests__/verticalDramaAssuranceSecurity.test.ts \
  server/services/__tests__/verticalDramaAssuranceObservability.test.ts \
  server/services/__tests__/verticalDramaAssuranceRollout.test.ts \
  server/services/__tests__/agentRuntimeRedaction.test.ts \
  server/services/__tests__/agentRuntimeTraceService.test.ts \
  server/services/__tests__/agentRuntimeClient.test.ts \
  server/services/__tests__/managedStorageAuthorizationService.test.ts \
  server/services/__tests__/tenantFeatureFlagsUpdate.test.ts \
  drizzle/__tests__/feature157VerticalDramaAssuranceSchema.test.ts \
  scripts/__tests__/backfill-vertical-drama-assurance.test.ts

cd python-backend && pytest \
  tests/api/test_internal_openai_agents_runtime.py \
  tests/unit/test_openai_agents_trace_redaction.py \
  tests/unit/test_openai_agents_adapter.py \
  tests/security/test_openai_agents_subagent_security.py
```

Run the migration against a disposable/staging database only, never an
unreviewed production URL:

```bash
npm --workspace apps/web run db:migrate
npm --workspace apps/web run backfill:vertical-drama-assurance -- \
  --tenant-id=<staging-tenant> --after-id=0 --limit=100
npm --workspace apps/web run assurance:vertical-drama:ops -- \
  rollout-status --tenant-id=<staging-tenant>
```

Then run changed-file formatting/diagnostics, the Section 02/03/06 focused
regressions, and:

```bash
git diff --check -- \
  apps/web/drizzle \
  apps/web/shared/featureFlags.ts \
  apps/web/server/services/verticalDramaAssuranceObservability.ts \
  apps/web/server/services/verticalDramaAssuranceReleaseControl.ts \
  apps/web/server/services/tenantFeatureFlagService.ts \
  apps/web/scripts/backfill-vertical-drama-assurance.ts \
  apps/web/scripts/vertical-drama-assurance-ops.ts \
  docs/runbooks/vertical-drama-assurance.md
```

`npm --workspace apps/web run check` is a separate broad diagnostic and may be
baseline-noisy/OOM in this checkout. Report focused failures, changed-file
diagnostics, and broad baseline failures separately. Local tests do not prove
the deployed migration, alert delivery, authenticated browser behavior,
Node-to-Python networking, live provider accounting, secret rotation, or
production canary; Section 10 must record those checks explicitly.

## Rollout/rollback acceptance criteria

- Every creator read/mutation is authenticated, tenant/user/domain-owner
  scoped, and fail-closed on missing identity; cross-tenant opaque IDs reveal
  nothing and trigger no downstream side effect.
- Role behavior is explicit: creators operate only on owned data,
  `domain_admin` only promotes its verified tenant through the existing flag
  router, `admin` targets an explicit tenant, workers require fences, and Agents
  have proposal-only authority.
- Untrusted story/evidence/provider content cannot widen instructions, tools,
  URLs, budgets, identity, or side-effect scope. Managed media and SSRF checks
  use existing authoritative services.
- Internal/provider secrets never enter request bodies, durable records,
  metrics, traces, fixtures, errors, or runbook output; Node/Python token
  rotation and old-token rejection are tested.
- Migration 0238 remains immutable, existing 0240–0244 migrations remain
  untouched, and the corrected next migration is additive, journaled once,
  dual-readable, and rehearsed without blocking authoring.
- Backfill is dry-run-first, tenant-bounded, cursor-based, resumable,
  idempotent, and proven-only; ambiguous ownership/status/acceptance remains
  legacy and auditable rather than fabricated.
- Metrics expose all required correctness, latency, cost, runtime, and
  reconciliation signals with bounded labels and redacted correlation; alert
  firing/recovery and missing-data behavior are verified in staging.
- All five canonical flags default off, use Section 06 precedence, and cannot
  be promoted without phase/release evidence. Kill switch assertion is always
  available and preserves durable/financial/provider evidence.
- Shadow creates no user charge or domain/provider side effect. Active phases
  advance only through the documented cohort gates; prompt/media and
  story/season cannot leapfrog prerequisites.
- Rollback stops new Agent work without deleting accepted candidates, clearing
  queues, reverting user drafts, blind-refunding, or resubmitting uncertain
  provider tasks. Old/new readers remain compatible while outstanding work
  reconciles.
- The runbook can inspect one exact chain, recover stale work, reconcile
  uncertain effects, run migration/backfill safely, operate flags, rotate the
  internal token, and distinguish local from live evidence.
- Focused Node/Python/security/migration/script tests and `git diff --check`
  pass. Browser, deployment, provider, migration-application, alert-delivery,
  and production-canary claims remain pending unless Section 10 supplies
  environment-specific evidence.

## Safe implementation boundary

The Section 09 commit may contain only migration-number correction required by
the current journal, security/tenant hardening directly required by Feature
157, observability/exporter code, release-control integration, bounded
backfill/ops scripts, runbook/evidence templates, and focused tests. It does not
enable a production flag, deploy, run a production backfill, rotate a live
secret, change provider selection, alter unrelated admin role semantics, or
stage unrelated dirty-worktree files.

## UI/UX Contract

### Target User / JTBD

Creators continue working during a safe rollout while operators identify tenant-scoped failures and roll back without a confusing dead end.

### Surface Inventory

Existing creator statuses remain stable; operator dashboards/runbooks expose only redacted metrics, cohorts, flags, and reconciliation evidence.

### Component Map

Flags and operational states feed the shared projection; no creator control can self-escalate a mode.

### State Matrix

Flag off, shadow, active, kill switch, migration pending, and reconciliation-required are distinct operational states with safe next actions.

### Responsive Matrix

Creator status works at 390x844 and 768x1024; operator evidence wraps or scrolls semantically at 1280x800 and 1440x900.

### Accessibility Acceptance

Flag/incident state is text-labelled, sensitive fields are redacted, and operator actions are keyboard-accessible with explicit feedback.

### Copy Contract

Creator copy is actionable and non-technical; operator copy uses stable reason/correlation identifiers and never secrets or raw prompts.

### Browser Evidence Required

Section 10 proves flag-off compatibility, canary enablement, kill-switch rollback, tenant isolation, and worker/Redis recovery.
