# Feature 152 Research Log

## Scope and method

The repository indexer requested by `AGENTS.md` (SocratiCode) is not exposed in
this session, so discovery used narrow `rg`, symbol reads, migration inspection,
and focused test-file inspection. Broad generated/build directories were
excluded. Existing dirty files were treated as user-owned and were not used as
evidence of this feature.

## Existing vertical-drama flow

- `apps/web/server/services/verticalDramaStoryBible.ts` owns story-bible,
  deep-draft, extension, and improvement generation. It already contains retry
  and quality logic, but the async job boundary is not a durable business run.
- `apps/web/server/services/verticalDramaStoryJobs.ts` stores job state in Redis
  with a six-hour TTL and uses BullMQ. Its status vocabulary is only
  `queued|running|succeeded|failed`; checkpoints are Redis JSON and are not a
  durable source of truth.
- `apps/web/server/routers/verticalDramaSeries.ts` queues and polls the jobs,
  then still has legacy partial-result and success paths. The API can therefore
  report transport success before the story has passed the final quality gate.
- Existing focused tests cover deep draft generation, dramaturgy skill
  activation, JSON planning retries, and the detail-page deep-draft flow. They
  do not cover durable resume, stale worker fencing, candidate versions, or
  unknown provider/credit outcomes.

## Existing quality and continuity contracts

- Feature 132's `verticalDramaQualityCriteria.ts` is the canonical criteria
  source and emits a `criteriaVersion` into quality scorecards/run artifacts.
- Feature 132 already has quality ledgers, scene contracts, multi-pass QC,
  targeted revision, and continuity contracts. Feature 152 must route accepted
  repairs through those existing functions instead of creating a second scoring
  system.
- Cross-episode and structural findings are approval-sensitive in Feature 132;
  they must not be silently widened by the new repair loop.
- The new flow needs immutable source/control snapshots and stable beat IDs so a
  retry cannot silently validate against a changed draft or changed feature
  flags.

## Existing persistence and runtime primitives

- `agentRuntimeTraces` and `agentRuntimeCheckpoints` already provide tenant-
  scoped trace/checkpoint storage suitable for Feature 151-compatible events.
- `verticalDramaEpisodeRuns`, `verticalDramaRunArtifacts`, and
  `verticalDramaApprovalCheckpoints` already model episode artifacts and human
  approvals. A single additive parent table is required to coordinate the
  complete story run; episode tables should be extended rather than replaced.
- Feature 151's `AgentTaskContract` contains versions, source revision,
  evidence policy, output contract, validation policy, side-effect policy,
  budgets, provider policy, rule packs, idempotency, and policy hash. The new
  contract should derive from it and preserve Node as the final authority.

## Credits and provider risks

- `deductCredits` supports idempotency keys through the credit transaction
  unique constraint.
- `createCreditReservation` currently deducts immediately and stores the
  reservation only in Redis; it does not accept an idempotency key. Redis loss
  can therefore make reservation recovery ambiguous.
- Story generation has direct credit paths in the story-bible service. All
  paths must use the run/attempt/unit idempotency key and a bounded reservation
  ceiling before parallel work begins.
- A late provider response must be reconciled by provider request/task ID, not
  by whichever worker happens to receive it after a retry.

## Official Agents SDK findings

The official OpenAI Agents SDK JavaScript guides were consulted:

- Guardrails: tool guardrails run for every tool invocation; agent input/output
  guardrails have chain-position semantics, so domain validation must remain in
  Node before and after handoffs.
- Schemas: structured output can be defined with Zod/standard schema. This is
  useful for candidate plans and repair proposals, but schema-valid output is
  not a substitute for deterministic story checks.
- Tracing: built-in tracing is useful only with sensitive-data redaction and a
  tenant/run correlation ID.
- Human-in-the-loop: approval pauses and resumes through serializable run state;
  the Node API must own approval authorization and freshness checks.
- Running agents: concurrency and turn limits are runtime controls, not domain
  completion criteria.

Official references:

- https://openai.github.io/openai-agents-js/
- https://openai.github.io/openai-agents-js/guides/guardrails/
- https://openai.github.io/openai-agents-js/guides/schemas/
- https://openai.github.io/openai-agents-js/guides/tracing/
- https://openai.github.io/openai-agents-js/guides/human-in-the-loop/

## Implementation implications

1. Build deterministic contracts, snapshots, ledgers, and final-gate behavior
   before enabling Agents SDK orchestration.
2. Persist the parent run and state transitions in Postgres; Redis/BullMQ is a
   delivery mechanism only.
3. Make every external side effect idempotent and reconcile unknown outcomes.
4. Keep legacy generation behind an adapter during rollout, with truthful API
   status and a feature flag for read-only, shadow, and active modes.
5. Use focused unit/integration tests plus replay fixtures before any browser or
   production proof is claimed.
