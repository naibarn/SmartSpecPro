# Deep-plan Research — Feature 157

Date: 2026-08-23
Review mode: self_review

## Research decision

- Codebase research: required. This is an existing git repository with active
  Node/TypeScript, Python/FastAPI, Redis/queue, database, UI, and media paths.
- Web research: required for the OpenAI Agents SDK guardrail/structured-output/
  tracing behavior and for concurrency/queue references.
- Testing research: required. The repository already uses Vitest for web,
  Playwright for browser flows, and pytest with an 80% coverage threshold for
  Python.
- SocratiCode: unavailable in this session (no `codebase_status` tool exposed).
  Findings below use targeted `rg`/`sed` discovery and existing tests. The
  implementation plan must preserve this limitation in its verification notes.

## Codebase findings

### Runtime and assurance boundary

- Shared Node runtime contracts are in `apps/web/shared/agentRuntime`.
- `AgentRuntimeRequestSchema` already accepts an optional `assurance` envelope;
  `requestBuilder.ts` passes it through to the runtime request.
- Current shared Orchestra task kinds are `video_prompt`, `image_prompt`,
  `text_prompt`, `skill_execution`, `structured_generation`, and several
  specialized media/dialogue kinds. Vertical Drama task taxonomy therefore
  needs an explicit adapter mapping or a coordinated schema-version change.
- `skillRuntimeOrchestrator.ts` has `legacy`, `shadow`, and `active` modes. It
  runs the legacy path in shadow mode for comparison; active mode can throw on
  missing/incompatible manifests. Adapter-level fallback and billing policy
  must therefore be explicit.
- Python orchestration already performs deterministic preflight before the SDK,
  checks evidence/side-effect authorization, and synthesizes a provider-ready
  assurance result for a completed bounded adapter run. This is an integration
  seam, not a reason to create another runtime.
- Existing trace code redacts sensitive payloads and has stable event IDs based
  on request/idempotency/attempt context. Preserve these mechanisms and add
  production-context/fallback metadata rather than duplicating tracing.

### Vertical Drama profiles and media

- `VD_SERIES_PROFILE_IDS` currently contains thirteen profiles: six fiction
  profiles plus documentary, news report, location review, restaurant review,
  product review, software review, and hybrid documentary-drama.
- Shared visual source contracts use semantic roles including `scene_anchor`,
  `reference`, `b_roll_still`, and `b_roll_footage`; evidence statuses include
  `not_applicable`, `illustrative`, `needs_verification`, `partially_verified`,
  `verified`, `stale`, `contradictory`, and `blocked`.
- Existing visual-source snapshot services already expose revision/fingerprint
  concepts and tenant/series context. Feature 157 should compose/admit one
  production context around those snapshots, not replace them.
- Existing start-frame, video-motion-prompt, prompt-expansion, B-roll, source
  pack, and visual source services each have focused tests. The plan should
  extend those tests at their existing seams and avoid a parallel prompt path.

### Draft QC and the observed failure

- Draft QC has dedicated service, job, ledger, router, and UI seams with many
  focused tests already present.
- The UI currently carries legacy-compatible fields such as `failed`,
  `recoveredFromFailure`, previous result/history, candidate fingerprint,
  repair/cancel busy state, and max rounds. The implementation must migrate the
  projection additively rather than remove these fields in one release.
- Draft QC uses a durable draft ledger plus Redis job/progress behavior. Queue
  delivery is already configured conservatively for paid QC work; the plan must
  preserve that policy and add durable reconciliation instead of allowing queue
  retries to replay paid calls.
- Draft QC and prompt QC have different credit patterns: Draft QC uses
  reservation/draw/refund; prompt QC has direct deduction with idempotency keys.
  Feature 157 must choose one billing owner per adapter and test malformed,
  timeout, retry, and fallback calls separately.

### Testing and commands

- Web tests: `npm --workspace apps/web test -- <focused files>`.
- Browser tests: `npm --workspace apps/web run e2e:production-director-browser`
  or a focused Playwright file with the configured project.
- Web typecheck: `npm --workspace apps/web run check`; repository history warns
  that broad typecheck may be baseline-noisy/OOM, so focused tests and changed
  file diagnostics must be reported separately.
- Python tests: `cd python-backend && pytest <focused tests>`; the project
  config enables coverage and fails below 80%, so focused runs may need the
  existing project conventions or explicit test selection.
- Existing tests particularly relevant to the plan include Draft QC jobs,
  Draft QC service/ledger, Agent Runtime request/client/final-gate/replay,
  story-generation runtime/repair/contracts, visual source integration/core,
  prompt QC, prompt expansion, start-frame, video prompt, B-roll, and Python
  internal OpenAI Agents runtime/contract tests.

## Web research findings

### OpenAI Agents SDK

- Agents support structured outputs through `output_type`; this is useful for
  proposal/finding/repair-plan objects, but it does not replace domain
  validation or activation CAS.
- Output guardrails run on the final agent output and can reject it with a
  tripwire. Tool guardrails apply to function tools, but not every hosted or
  handoff path. Therefore Node/domain final gates must remain authoritative and
  tool permissions must be enforced outside assumptions about SDK guardrails.
- SDK tracing covers generations, tool calls, handoffs, guardrails, and custom
  events. Sensitive-data controls exist, but the application's tenant-scoped
  redaction policy must still be applied at the Node/Python boundary.
- SDK results may omit transport request IDs and raw usage unless configured;
  request/call IDs and cost reconciliation therefore need application-owned
  identifiers and optional raw usage capture, not SDK fields alone.

Sources:

- https://openai.github.io/openai-agents-python/agents/
- https://openai.github.io/openai-agents-python/guardrails/
- https://openai.github.io/openai-agents-python/running_agents/
- https://openai.github.io/openai-agents-python/results/
- https://openai.github.io/openai-agents-python/tracing/

### Queue and database recovery

- Redis Streams consumer groups track pending messages and require explicit
  acknowledgement; pending-message inspection/recovery is relevant to worker
  restart and reconciliation design. The existing application may use another
  queue primitive, so the plan must verify actual BullMQ/Redis behavior before
  prescribing Streams-specific code.
- PostgreSQL row locks and `ON CONFLICT` behavior can support bounded CAS and
  idempotent admission, but lock scope and transaction isolation must be
  tested so draft save/edit is not blocked by a long model call. Model/provider
  calls must remain outside long-held database transactions.

Sources:

- https://redis.io/docs/latest/develop/data-types/streams/
- https://www.postgresql.org/docs/current/transaction-iso.html

## Planning implications

1. Start implementation with a contract/impact inventory and focused regression
   tests around the observed Draft QC repair error, not with an Agent SDK
   rewrite.
2. Add a durable state/projection seam only after confirming Feature 151/152
   persistence ownership; use additive fields/migrations and preserve legacy
   UI data.
3. Keep model calls outside DB locks, use an application-owned attempt/call
   id, and fence activation with an authoritative CAS.
4. Treat Agent structured output and guardrails as bounded proposal validation;
   deterministic Node/Python domain checks remain the final authority.
5. Separate user UX continuity evidence, Agent-path evidence, provider evidence,
   and deployment/migration evidence in the plan and final verification.
