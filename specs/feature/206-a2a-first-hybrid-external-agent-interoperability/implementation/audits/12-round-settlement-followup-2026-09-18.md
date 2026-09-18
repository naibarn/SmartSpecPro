# Spec 206 — 12-Round Settlement Follow-up Audit

Date: 2026-09-18
Target: `specs/feature/206-a2a-first-hybrid-external-agent-interoperability/spec.md`
Method: targeted shell discovery because SocratiCode was unavailable in this session.
Scope: fresh settlement-path audit against the current Feature 186 job-control implementation and companion specs.

## Independent rounds

| Round | Boundary checked | Evidence | Result and immediate action |
|---:|---|---|---|
| 1 | Spec scope/revision | Spec 206 header and repository baseline | Confirmed the document remains planning-only and no runtime A2A implementation is claimed. |
| 2 | Canonical transition table | `jobControlPlaneTypes.ts` | Confirmed the generic table permits `waiting_external → running|failed|cancelled|expired`, but not an unguarded success transition. |
| 3 | External wait entry | `jobControlPlane.ts::waitForExternal` | Confirmed external provider work releases the lease and records operation metadata before entering `waiting_external`. |
| 4 | External resume path | `jobControlPlane.ts::resumeExternal` and job-control routes | Confirmed the verification/reconciliation path can reacquire the job and continue through the canonical running/completion lifecycle. |
| 5 | Provider settlement exception | `jobControlPlane.ts::completeExternal` | Found a guarded provider-poller path that settles `waiting_external` directly to `succeeded`. Updated Spec 206 to name this exception instead of incorrectly forbidding every direct settlement. |
| 6 | Settlement guards | `operationKey`, provider poll lease assertion, bounded result reference and expected status/attempt checks | Confirmed the spec now requires every guard and idempotent `COMPLETED` event for that exception; raw status updates remain prohibited. |
| 7 | A2A result trust | Spec 206 result-trust and verification sections | Confirmed remote A2A `TASK_STATE_COMPLETED` alone remains insufficient for SmartAIHub verification; normal A2A flow uses resume/verification. |
| 8 | Event compatibility | `AgentEvent.kind` current union and Spec 206 normalized-event boundary | Confirmed A2A input/auth states remain versioned interop events and are not silently cast into the closed current union. |
| 9 | Durable identity/idempotency | Worker jobs/events/attempts/outbox schema and settlement event rules | Confirmed operation/task/attempt correlation and idempotent event evidence remain required. |
| 10 | Cross-spec ownership | Specs 199/200/204/205 and Spec 206 ownership sections | Confirmed settlement clarification does not create a second MCP gateway, native-agent queue, Runner channel or Container scheduler. |
| 11 | Protocol/phase acceptance | A2A v1.0.0 baseline and Phase 0–5 gates | Confirmed the settlement exception is an implementation adapter detail and does not imply Phase 4/5 completion. |
| 12 | Retired paths and integrity | prohibited-system scan, Markdown fence count and selected companion checks | No retired system was introduced. A pre-existing trailing-space warning in a dirty Spec 205 line was observed; it was preserved as unrelated worktree content. |

## Immediate repair

Replaced the overly broad “no direct settlement” statement with the exact
two-path contract: normal A2A verification uses resume/complete, while only the
existing guarded `completeExternal` provider-poller settlement may bypass the
generic transition table. Remote completion alone remains non-authoritative.

No runtime source file was changed. SDK, adapter, migration, provider/TCK,
Runner/browser/deployment and Phase 4–5 gates remain implementation work.
