# Unified Thread Overview — additive cross-SPEC contract (2026-10-29)

This contract connects the existing SmartAIHub Chat, Task Control and Mission
Control authorities. It does not create a second task ledger, event store,
dispatcher, scheduler, approval authority or execution state machine. The
individual owner specifications remain authoritative; implementation and live
acceptance are separate claims.

## Surface ownership

| Surface                          | Owns                                                                                         | Consumes                                                                                |
| -------------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Chat — SPEC-198                  | Conversation and thread navigation, messages, user intent and links to work                  | Authorized thread projection and canonical job/result references                        |
| Task Control — SPEC-277          | Exact Job/Run/Attempt, approval, recovery, evidence and usage inspection                     | Canonical worker job, outbox, event, Runner and settlement authorities                  |
| Mission Control — SPEC-294       | Cross-project/agent/host correlation and operational overview                                | The same authorized task/thread projections and existing source events                  |
| Development execution — SPEC-224 | DevelopmentRun, phases, grants, budget, child authorization, dispatch and final verification | Optional conversation/thread correlation for origin and return navigation               |
| Harness adapters — SPEC-310      | Adapter-specific harness and harness-session capabilities                                    | Canonical job identity; optional Chat thread association where the producer provides it |

## Identity, relationship and cardinality

- A Conversation has one implicit legacy/main thread (`thread_id IS NULL`) and
  zero or more persisted child Threads. Existing messages and jobs without a
  Thread remain readable as main-conversation work.
- A Thread is a conversation/navigation context, not a Job, Run, Attempt, Goal
  or harness session. A Thread may reference multiple sequential canonical
  Jobs. A Job/Run may have multiple Attempts and subordinate harness sessions
  under its existing owner.
- The current web mapping is `conversation_threads.id` → `messages.thread_id`
  and `worker_jobs.thread_id`; SPEC-224 keeps `conversationId` and
  `chatThreadId` in the existing DevelopmentRun/job metadata. `worker_jobs`
  and existing Run authorities remain the durable execution source. No new
  thread-to-run ledger is required for this mapping.
- A child Thread's parent is immutable through the create API and must already
  belong to the same owner, tenant and Conversation. Retries reuse its scoped
  idempotency key. Harness-native session IDs remain separate; no session
  steering is implied by a Chat Thread link.

## Projection, status and durable replay

- Chat sidebar Thread rows and Task Control details are projections of the
  same authorized `worker_jobs` and existing event/evidence sources. Job
  creation time breaks equal-time ties with a stable job identity.
- `WORKING`, `WAITING_ON_YOU`, `READY_FOR_REVIEW`, `LANDING`, `IDLE`,
  `RESOLVED`, `UNKNOWN`, `STALE`, `UNAVAILABLE` and `ERROR` are derived display
  groups, never persisted job states. `WAITING_ON_YOU` requires an actual
  operator-review/approval action. `READY_FOR_REVIEW` requires a result
  reference, result text or evidence/artifact reference. Failed work is an
  error, not resolved; unknown states remain unknown.
- Task Control uses the existing scoped projection token and cursor. Tokens
  preserve tenant, actor, conversation, thread and filter scope; expired or
  mismatched cursors fail closed. Existing `created_at_watermark_live_state`
  snapshots explicitly describe their mutable-state limit; they are not
  immutable event history.
- Event delivery continues through existing canonical job/Runner event paths.
  The current Chat developer viewer deduplicates event IDs and polls a bounded
  event page. Cross-source immutable replay, explicit gap detection/recovery
  and shared event projection remain open acceptance work; this slice does not
  claim them. No new event ledger or unbounded polling loop is introduced.

## Authorization, routing and UI behavior

- Every list, create, message, job and evidence read rechecks authenticated
  tenant, actor/owner and Conversation/Workspace scope on the server. A foreign
  Thread or a job whose `thread_id` conflicts with its recorded conversation
  has no Chat link and returns no scoped data.
- Chat route `c`/`t` identifies the exact existing Conversation and Thread.
  Create/retry uses one stable idempotency key; navigation, reload, duplicate
  submit or closing the browser must not create or cancel execution.
- Task Control links back to the verified originating Conversation/Thread.
  Mission Control correlates the same canonical Job and may deep-link to these
  surfaces; it does not own execution, permissions, budget, status or dispatch.
- The current implemented sidebar is a recent-thread list within the selected
  Conversation. Global project grouping, Mission Control Thread navigation,
  a complete three-pane Thread Inspector and immutable cross-source timeline
  remain separate acceptance gaps; this contract does not claim them deployed.
- Simple/Developer display choices change presentation only. They do not add
  authority or expose internal platform identity, paths, protected logs, model
  entitlements or other-tenant facts.

## API and migration contract

- Existing authenticated Chat and Task Control procedures are extended with
  optional `threadId`; omitted/null continues to mean the legacy/main thread.
  Task observation may bind `threadId` only with an authorized
  `conversationId`. Returned Chat links require a separately verified
  conversation owner/tenant binding.
- Additive schema: `conversation_threads`, nullable `messages.thread_id`, and
  nullable `worker_jobs.thread_id`, with lookup indexes and `ON DELETE SET NULL`
  for historical message/job continuity. Existing conversations are not
  backfilled or rewritten. Application rollback must retain null-compatible
  reads while the additive columns exist; destructive table/column removal is
  outside this contract and requires separate data-retention review.
- Apply migration through the canonical development migration runner after
  source integration. Verify exact target identity and schema before browser
  acceptance; production migration and release remain separately authorized.

## Follow-up implementation slice (2026-10-29)

- Chat and Task Control Developer views now consume one shared client hook over
  the existing owner-scoped `worker_jobs` / `worker_job_events` output query.
  Replay remains bounded and sequence-based; the client de-duplicates stable
  event IDs, fetches older pages after reconnect, and limits the visible window.
  Server filtering continues to exclude unsupported/private event kinds and
  redact sensitive text. No new event storage or execution authority is added.
- The existing Task Observability Monitor groups the authorized Jobs on the
  current snapshot page by verified Conversation/Thread and provides exact
  Chat and Job links. Opening a Job creates a fresh authorized projection
  instead of carrying a potentially expired snapshot token in the navigation
  URL. Pagination and the existing task snapshot remain authoritative.
- Thread titles are returned only when the Job owner, authorized Conversation
  and Thread binding agree, including tenant-admin projections. A mismatched
  association remains an unlinked Job with unknown conversation/thread labels.
- These changes improve same-Job continuity across Chat, Task Control and the
  Task Observability/Mission view. They do not close cross-source immutable
  replay/gap detection, global project grouping, full Inspector/result return,
  hosted authenticated browser acceptance, deployment, or real SPEC-224
  Child 1/2 live execution and Independent Final Verify.

## Acceptance and known limits

Focused evidence for this implementation slice must cover: legacy/main and
child-thread reads; owner/tenant rejection; idempotent create and retry; message
and job association; Task Control snapshot/cursor scoping; deterministic and
evidence-grounded status; Chat ↔ Task Control deep links; and existing
SPEC-224 Start/continuation regressions. Browser acceptance must verify reload,
mobile layout, keyboard navigation, Thai/English strings and one real execution
when an authorized runtime is available. Disposable PostgreSQL receipts do not
count as live Runner execution.

Not closed by this slice: project-wide paginated Thread Overview, cross-host
Mission Control UI, immutable durable replay across multiple producers,
complete run/evidence result delivery into the main transcript, full mobile
three-pane/inspector acceptance, real harness session steering, deployed
development UI, and SPEC-224 real Child 1/2 acceptance.

## Deferred visual-reference artifacts

Visual references remain logical artifacts under existing SPEC-224/277 receipt
and evidence storage; they are not a new byte store, scheduler or state machine.
Where a separate visual-reference intake slice is implemented, it should retain
reference identity/type, source hash, rights, storage link, viewport/state and
acquisition status; distinguish observed from inferred understanding with
confidence and citations; bind the UI blueprint and verification result to
reference IDs; and record comparison method, matching viewport/state, evidence
and unverified reasons. User-supplied images, video, URLs and OCR are untrusted
content, never execution instructions. URL capture must use existing safe
network controls, reject SSRF/private metadata targets and credential leakage,
and respect tenant storage/browser quotas. A blocked optional browser or
unsupported viewport is UNVERIFIED, not a fabricated observation or blanket
build failure. This visual intake and evaluation scope is not implemented by the
Thread/Task backlink slice and remains a separate P2 work item.
