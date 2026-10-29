# Unified Workbench UX — additive cross-SPEC amendment (2026-10-29)

This amendment continues `unified-thread-overview-r01.md` from canonical
`origin/main` at `415432bf556748a5a6ba762eb754da00cd2d7dff`. It describes an
incremental product experience on the existing Chat, Task Control, Mission
Control, Runner Registry and job/event authorities. It does not create a
second session store, job ledger, dispatcher, scheduler, approval authority,
budget or harness runtime.

## Current implementation boundary

| Phase | Already present in source | Still incomplete and not accepted |
| --- | --- | --- |
| 1. Chat sessions and threads | Chat sidebar has paginated conversation history, visibly named Chat sessions / Work threads navigation, child-thread creation, a recent-thread overview ordered by server activity, and conversation/thread URL identity. | Session history is not yet a project-first work navigator; global project grouping, full cross-source immutable replay and gap recovery remain open. Provider-native session resume is not implied by thread selection. |
| 2. Runner, Workspace and Harness choices | Task Control reads authorized Runner/Workspace registry data, capability ACK/readiness, discovered per-account model catalogs, and can choose Auto or one explicit supported Harness/model. Runner options explain display name, OS and online/waiting state; the selected device shows heartbeat, capability ACK and waiting reason. Simple mode hides machineName. Draft choices persist per user/conversation/thread. | Workspace/source provenance and some unavailable-state recovery still need a clearer, end-to-end presentation. A single Job/Goal has one selected Harness; the UI does not fan one Goal out across multiple harnesses. Concurrent multi-harness execution is not implemented or authorized by this amendment. Show multiple existing jobs/harnesses only when returned by canonical task projections. |
| 3. Unified Chat / Task Control / Mission Control | Chat links to exact task evidence; Task Control has a work overview and start form; Mission/Task Observability has paginated task snapshots, project/SPEC filters, thread backlinks and detail evidence. | There is no compact, discoverable project/session workbench tying the three surfaces together. Mission/Task views cover only the current authorized task snapshot page and existing projection sources. Full cross-project event replay/gap recovery, a complete result return to the transcript, hosted authenticated UAT, deployment provenance, and SPEC-224 genuine Child 1/2 receipts plus Independent Final Verify remain open. API 500 reports from an authenticated browser are not root-caused by available anonymous evidence. |

## Product contract

1. **Start from a recognizable place.** Chat history is the entry point for
   resuming a conversation; a visible Sessions/Threads navigation control and
   recent activity ordering make older work discoverable. Selecting a thread
   reopens its existing conversation/thread URL. New work remains an explicit
   action and does not mutate or resume a provider session implicitly.
2. **Explain the execution target.** Present Runner display name, OS/device
   context, online/freshness state and capability acknowledgment from the
   authorized read model. Present Workspace display name and project/source
   context only when authorized. Never derive identity or readiness from a
   display label. Simple mode uses customer-safe wording; Developer mode may
   reveal only authorized diagnostics.
3. **Make Harness choice truthful.** Offer Auto and each Harness supported by
   the fresh selected Runner/Workspace capability and account-verified model
   catalog. Keep model pinning and supported reasoning effort explicit. One
   Goal/Job uses one selected Harness unless a separate canonical owner
   contract later provides bounded multi-harness fan-out, per-child authority,
   budget and evidence. Multiple Harness jobs may be viewed together only
   through their canonical task records.
4. **Make work continuity visible.** Chat shows a concise current execution
   summary and links to exact Task Control evidence. Task Control shows the
   selected Session/Thread and canonical Run/Job state with direct return
   links. Mission Control groups only the authorized records returned by the
   current projection and provides exact Chat/Task links. Loading, stale,
   empty, unauthorized and failed states must be distinguishable and offer a
   safe refresh where applicable; errors must not be converted into empty
   success states.
5. **Preserve one authority per operation.** Chat owns Conversation/Thread
   navigation; SPEC-277 owns job evidence and operator decisions; SPEC-294
   consumes cross-project projections; SPEC-224 owns DevelopmentRun/Goal
   admission, budget, child phases, dispatch and final verification; SPEC-310
   owns adapter-specific harness lifecycle. No UI preference grants access or
   changes server authorization.

## Delivery phases and acceptance

### Phase 1 — Session and Thread navigation

- Keep existing conversation and thread records, pagination and authorization.
- Make session/thread navigation visibly named and preserve recent-active
  ordering from server timestamps; do not synthesize activity time.
- Make a selected item, empty state, loading state, retry state and active
  thread unambiguous; selection/reload must preserve `c` and `t`.
- Acceptance: focused tests cover session selection, child-thread selection,
  URL preservation, ordering from server data, empty/loading/error, keyboard
  operation and tenant/owner isolation through existing query tests.

### Phase 2 — Execution target and Harness selection

- Keep Runner and Workspace selection backed by existing authorized registries.
- Label each choice with human-readable name plus permitted platform/device
  context; show online state, heartbeat freshness, capability ACK and exact
  waiting reason as separate facts.
- Keep verified Harness/model/reasoning choices selectable in both Simple and
  Developer modes. Simple mode may choose Auto when the user makes no explicit
  selection; it must preserve explicit choices and never silently substitute.
- A single Goal/Job remains single-Harness. Multi-harness fan-out is deferred
  until a canonical runtime contract exists for child authorization, workspace
  isolation, lease/fencing, settlement and independent verification.
- Acceptance: tests prove only authorized fresh registry/catalog options are
  shown, stale/unknown facts remain non-ready, user choices survive refresh and
  reopening the same draft, and disabled reasons are actionable.

### Phase 3 — Unified Workbench and result continuity

- Expose the same Conversation/Thread identity and exact Job links across Chat,
  Task Control and Mission Control without creating a parallel task model.
- Use readable task labels first and IDs only as secondary Developer details.
- Distinguish in-progress, waiting, review, complete, failed, stale and
  unavailable. Provide refresh/retry for recoverable query failures while
  retaining an error signal; never map query failure to “no work”.
- Keep raw Harness events, paths, receipts and settlement evidence behind the
  existing authorized Developer/Task Control boundary.
- Acceptance: focused surface tests cover exact backlink identity, scope
  mismatch, retry, stale projection recovery, mobile layout, keyboard and
  Thai/English labels. Hosted authenticated acceptance and genuine SPEC-224
  execution remain separate runtime evidence and cannot be inferred from
  component tests.

## Non-goals and explicit open decisions

- No one-Goal multi-Harness fan-out, Native Harness enablement, provider session
  steering, new orchestration engine, speculative parallel execution or new
  approval/billing model.
- No new event store or claim of immutable replay. Cross-source event
  reconciliation and explicit gap recovery remain separate open requirements.
- No production deployment or claim of hosted behavior without an immutable
  serving identity and authenticated runtime evidence.
- Existing authenticated browser 500s for `chat.getMessages` and
  `workerJobs.observability` remain an unresolved runtime defect until
  authenticated service logs/request correlation establish the first failing
  boundary. Anonymous 401 responses do not reproduce or explain those 500s.
- SPEC-224 remains incomplete until actual authorized Child 1 and Child 2
  Runner receipts, settlement, automatic continuation and Independent Final
  Verify are captured.

## Ownership crosswalk

| Concern | Canonical owner | Change allowed here |
| --- | --- | --- |
| Conversation list, messages, thread selection | SPEC-198 | Additive UI consumption; no alternate conversation store. |
| Task/attempt evidence, retry and operator decisions | SPEC-277 | Read through existing scoped projection; do not take over its pending provider-receipt/outbox work. |
| Cross-project overview and event correlation | SPEC-294 | Consume authorized paginated projections; immutable multi-source replay remains open. |
| Goal, child authorization, leases, budget, continuation | SPEC-224 | No semantic changes or simulated live evidence. |
| Harness/model adapter and native lifecycle | SPEC-310 | Existing verified external harnesses only; Native Harness remains off pending its own gates. |

This amendment is additive. It does not change canonical lifecycle status or
close any requirement row by itself. Implementation status and actual runtime
evidence must be recorded in the existing SPEC-294 handoff and owner handoffs.

## 2026-10-29 implementation delta

The reviewed source change removes client-side status regrouping from the
recent-thread list so newest verified activity remains first across statuses;
adds plain-language session/thread hints; improves Runner option labels while
keeping machine names out of Simple mode; localizes the single-Harness Goal
contract; and adds explicit retry for failed Task Control observation, Chat
session history, and thread overview queries. Selected threads are now visibly
marked and navigable by keyboard. These are partial UX improvements, not full
acceptance of any phase. Focused component verification passed 57/57 tests and
Chat locale-key coverage is 100% (384/384 keys in English and Thai).
Authenticated browser verification did not start: the isolated UAT web server
exits with a named-export error for `./_core/env` before browser assertions.
See `uwac-r06/implementation/review-loops-20261029.md` for the ten review
passes, follow-up regression pass, evidence and remaining gaps. No hosted
deployment or SPEC-224 live execution is claimed.
