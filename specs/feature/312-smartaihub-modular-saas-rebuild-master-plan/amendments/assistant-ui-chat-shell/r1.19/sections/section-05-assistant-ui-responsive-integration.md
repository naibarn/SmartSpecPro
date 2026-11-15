# Section 05 — assistant-ui responsive integration

- Requirement IDs: R1.19-6, R1.19-8.
- Objective: integrate durable event/artifact/inspector states into existing assistant-ui shell and verify interactions without redesigning working chat flows.
- Owned scope: `modules/chat/src/ui/**`, module manifest only if runtime API changes require it.
- Prerequisites: Sections 02–04 API contracts.
- Tests: targeted interaction tests; desktop 1440x900, tablet 820x1180 and mobile 390x844 layout assertions/screenshots when browser tooling is available; themes/locale/attachments/history remain.
- Completion predicate: Chat history/send/preview/reconnect interactions use real APIs, accessible responsive layout is supported, no regression to queue-only flow.
- Fallback: polling remains available; artifact and inspector facts have honest unavailable/error states.
- Blocker strategy: distinguish fixture tests from authenticated rendered UAT and preserve BLOCKED when no authorized session exists.
