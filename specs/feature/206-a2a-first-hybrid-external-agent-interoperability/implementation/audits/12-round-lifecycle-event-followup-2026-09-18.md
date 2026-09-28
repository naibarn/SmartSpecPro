# Spec 206 — 12-Round Lifecycle/Event Follow-up Audit

Date: 2026-09-18
Target: `specs/feature/206-a2a-first-hybrid-external-agent-interoperability/spec.md`
Method: targeted shell discovery because SocratiCode was unavailable in this session.
Scope: fresh lifecycle and event-contract re-audit after the previous follow-up, with current Feature 186/200 code as the authority.

## Independent rounds

| Round | Boundary checked | Evidence | Result and immediate action |
|---:|---|---|---|
| 1 | Revision/scope | Spec 206 header and baseline | Confirmed the spec remains planning-only and does not claim A2A runtime completion. |
| 2 | Remote completion transition | `CANONICAL_JOB_TRANSITIONS` in `jobControlPlaneTypes.ts` versus Section 23 mapping | Found `waiting_external → succeeded` was implied even though the current table does not allow it. Required `waiting_external → running` verification, then `running → succeeded|failed`. |
| 3 | Remote submission transition | Current `wait_for_external` command/status vocabulary versus A2A `TASK_STATE_SUBMITTED` | Clarified that `queued` is pre-send and remote acceptance uses the existing wait-for-external transition to `waiting_external`. |
| 4 | Agent event union | `AgentEvent.kind` in `agentControlPlaneContracts.ts` | Found the current union has no `input_required` or `auth_required`. Prohibited silent casts/union expansion and required versioned normalized interop events plus `worker_job_events` projection. |
| 5 | Input-required flow | Spec 206 shared UI/continuation and current job status | Confirmed interruptions remain `waiting_external` with an event/reference, not a new durable status. |
| 6 | Auth-required flow | Spec 206 Credential/Approval rules and current event boundary | Confirmed auth state is not authorization and must use the shared Credential/Approval flow without placing secrets in the current event payload. |
| 7 | Native parity | Spec 200 `AgentEvent`/adapter boundary and Spec 206 A2A/native parity | Confirmed native adapters remain unchanged; any Feature 200 event contract expansion requires explicit versioning and parity tests. |
| 8 | Attempt/lease fencing | `worker_job_attempts`, lease/fencing code and remote binding rules | Confirmed verification and late remote events remain attempt-scoped and cannot reopen terminal jobs. |
| 9 | Idempotency/reconciliation | `worker_job_events` sequence/idempotency logic and A2A reconciliation sections | Confirmed remote terminal evidence is deduplicated/reconciled before canonical completion. |
| 10 | Cross-spec ownership | Specs 199/200/204/205 headers and Spec 206 Sections 2/95 | Confirmed no lifecycle change creates a second queue, MCP gateway, Runner channel or Container scheduler. |
| 11 | Protocol/phase gates | A2A v1.0.0 references and Phase 0–5 gates | Confirmed the new lifecycle rules remain client/hybrid Phase 1–3 compatible and do not imply Phase 5 server-mode completion. |
| 12 | Integrity/retired paths | retired-system scan, selected `git diff --check`, Markdown fence count | No retired path was introduced; selected companion diffs and document structure remained valid. |

## Immediate repairs

- reconciled A2A terminal mapping with the actual canonical transition table;
- made remote acceptance and verification transition steps explicit;
- prohibited casting A2A input/auth states into the closed current `AgentEvent` union;
- required versioned normalized interop events and canonical `worker_job_events` persistence.

No runtime source file was changed. Remaining SDK, adapter, migration,
provider/TCK, Runner/browser/deployment and Phase 4–5 gates remain implementation
work.
