# Section 02 — SSE replay and canonical job correlation

- Requirement IDs: R1.19-2, R1.19-7.
- Objective: publish persisted job/message status events through authenticated SSE with replay cursor and polling fallback; never cancel durable work on disconnect.
- Owned scope: Core Chat routes/services/repository and Chat Worker proxy/runtime adapter, with focused tests.
- Prerequisites: Section 01 event repository contract.
- Tests: ordered event delivery, Last-Event-ID replay, reconnect, duplicate handling, terminal states, interrupted stream, poll fallback and no duplicate dispatch.
- Completion predicate: authorized clients replay canonical persisted events and recover job/message state; queue delivery/credit/fencing behavior remains unchanged.
- Fallback: if deployment proxy cannot sustain SSE, use reconnectable bounded long-poll backed by the same durable cursor and retain the same API semantics.
- Blocker strategy: do not claim token streaming; provider response currently completes within queued worker path.
