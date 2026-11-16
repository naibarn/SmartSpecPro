# Component inventory

| Component | Responsibility | Evidence/data boundary |
|---|---|---|
| `WorkspaceAreaHeader` | Shared brand and Chat/Task/Mission navigation; responsive project/theme/context slots | Only shows DEV preview links on allowlisted hosts; Chat remains the existing route |
| `MissionControlPrototypePage` | DEV-only route host, area selection, selection persistence, theme/mode and responsive drawer state | Synthetic fixtures only; no backend mutations |
| `TaskTree` | Project → Goals → Tasks → Runs/Attempts navigation | Demo DTO projection; unknown run identity remains unavailable |
| `TaskWorkbench` | Selected task context, status stages, evidence tabs and expandable output dock | Synthetic Work Plan/Transcript/Tool Calls/Terminal/Diff/Tests/Artifacts/Decisions/Verification/Runtime |
| `EvidenceContent` | Selects a typed evidence view for the active Task tab | Explicit DEMO content, redacted secret-bearing evidence |
| `MissionNavigation` | Fleet views and recent session picker | Demo view counts and selected session |
| `MissionFleet` | Harness/Agent/Runner grouping, concurrent sessions, attention, hierarchy and activity | Groups from present fields; missing identity is `not reported`; status is not live |
| `ExecutionButton` | Selectable execution row with Job/Run display | Synthetic identifiers labeled as demo |
| `ActivityTimeline` | Event timeline for selected execution | Canonical-shaped demo events only; no live stream/replay claim |
| `Inspector` | Shared contextual execution identity/evidence panel; adjustable on desktop, drawer on mobile | Marks absent facts unavailable; no synthetic action success |
| `Demo controls` | Local Ready/Loading/Error examples and Simple/Developer display lens | State changes do not call APIs or grant authorization |

The reusable views in this isolated prototype are not yet promoted to the production Chat or live Mission/Task runtime. The next integration should extract typed evidence components only after the canonical API DTOs and access policies are confirmed.
