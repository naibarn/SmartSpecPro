# Section 04 — Inspector and Task/Mission links

- Requirement IDs: R1.19-4, R1.19-5, R1.19-8.
- Objective: project only real authorized execution facts and connect navigation to existing Task/Mission authorities where contracts exist.
- Owned scope: Core authorized read projection, Chat UI inspector, canonical link integration and relevant contract tests; no parallel stores.
- Prerequisites: event replay and artifacts sections; inspect SPEC-200, SPEC-294, SPEC-310, SPEC-318 contracts.
- Tests: available/unavailable fields, permissions, cross-tenant denial, links preserve canonical IDs, status refresh after reload/reconnect, no duplicate orchestration entities.
- Completion predicate: real source-backed metadata and links update consistently; missing authorities are explicitly marked partial with exact dependency.
- Fallback: leave navigation disabled or as accurate unavailable state until an authoritative API is available.
- Blocker strategy: do not invent a Run, Agent, Harness, executor or Mission ID.
