# R03.4 — Harness Registry and Canonical Execution Correlation

## Objective

Connect the existing R03.2 Multi-Harness Mission UX and R03.3 authenticated LIVE route to real Runner/Harness and canonical execution records. This is additive read-only integration; it does not introduce a scheduler, job/event authority, or dispatch action.

## Verified source boundaries

- The Modular Core uses the shared PostgreSQL `smartspec` contract. Its current mission/task projections are `list_modular_chat_missions` and `list_modular_chat_task_control_projection` (migration 0441); these leave Agent/Harness/Runner/Run fields empty or only project Chat turns.
- SmartSpecPro's authenticated Runner authority is `runner_nodes`; explicit conversation-to-runner/workspace bindings are `spec224_conversation_workspaces`; durable Job-to-Runner/Session identity is `runner_execution_sessions`; Jobs, Attempts and events remain `worker_jobs`, `worker_job_attempts`, and `worker_job_events`.
- A Runner binary installation or stale inventory is not an online/dispatch-ready Harness. The reported local Runner observation in SPEC-277 is inactive/disabled with zero ready tools; this must be rechecked against runtime before any live acceptance claim.
- Core `environment_tenant_id` and legacy Runner `tenantId` are distinct. Scope joins must use the authenticated modular workspace/conversation binding and the binding's owning user/legacy tenant; tenant strings must never be substituted for workspace IDs.
- SPEC-310 is already canonically occupied by a separate gated native-Harness plan; SPEC-309 is not currently a published canonical Spec. R03.4 will document the boundary in SPEC-294 and submit only compatible identity crosswalk notes to the extant SPEC-277/310 contracts. It will not reopen SPEC-310's gated native-runtime implementation or claim a SPEC-309 reservation.

## Implementation decisions

1. Keep Runner registration, Harness instance, Agent, Session, Job, Run and Attempt as distinct identities. Existing Runner capability/driver fields do not define a Harness type or instance; do not derive one from those fields or binary presence. See [source-to-canonical-identity-map.md](source-to-canonical-identity-map.md).
2. Preserve the exact `spec224_conversation_workspaces` binding and canonical `runner_execution_sessions` → Job/Attempt foreign relationship. Do not infer a Mission relationship: current Mission projection covers modular Chat turn Jobs only. A producer-owned, authenticated identity/correlation binding is required before cross-runtime Mission association.
3. Implement bounded Core reads only for identity relationships that existing sources can prove. Any SECURITY DEFINER function must revalidate user, environment tenant, Modular workspace, owned conversation, legacy Runner tenant/binding and exact Job/Attempt/session relationships at query time. Unknown Harness identities remain unavailable; no fabricated empty-success association.
4. Preserve separate DEMO and LIVE routes. LIVE must never fall back to fixtures. Show Runner projections separately from Harness catalog records when only Runner identity is known.
5. Deploy only after the source can return a correctly scoped live read and its API tests pass, through the registered `modular-debian-dev` controller. Real-instance/E2E UAT is separate and pending if no authorized Runner execution or owner MFA browser is available.

## Plan sections

1. `section-01-db-correlation-read-model.md` — validate exact schema and implement protected, bounded read functions/projections over Runner bindings, sessions, canonical Jobs/Attempts/events.
2. `section-02-core-api-contracts.md` — typed contracts, authenticated workspace-scoped API routes, exact relationship revalidation, tenant-isolation tests.
3. `section-03-live-ui-integration.md` — adapt existing LIVE Mission Control tabs and Task Control deep links, with freshness/unknown states and context restoration; keep DEMO untouched.
4. `section-04-proof-deploy-handoff.md` — focused checks, dev migration, deployment and runtime verification; update canonical Spec evidence and handoff with separate implementation/runtime/UAT statuses.

## Acceptance boundaries

- Code/API acceptance can pass with an empty registry only after a live-backed source query is implemented and proves the authenticated empty state. A hardcoded empty response is not catalog implementation.
- `INSTANCE_DISCOVERED`, `EXECUTION_BOUND`, `MISSION_PROJECTION_VERIFIED`, `TASK_DEEP_LINK_VERIFIED`, and `DEV_DEPLOYED` require direct source/runtime evidence.
- The requested real vertical slice cannot be claimed from fixtures. If no online, authorized Runner execution exists in DEV, preserve that exact gap in the current handoff and leave `OWNER_UAT_PENDING`.
