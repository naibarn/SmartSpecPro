# R03 requirement mapping

| Requirement | UI surface / implementation | Evidence and limitation |
|---|---|---|
| UXR03-01 Shared shell | `WorkspaceAreaHeader` in Chat and both DEV prototypes; shared area navigation, theme/project slots, mobile controls | Focused route tests; visual captures. Chat runtime mount retained. |
| UXR03-02 Task workbench | Project/Goal/Task/Run tree, selected task, evidence tabs, attempt selector, inspector, output dock | Synthetic DTO-shaped fixtures; no real execution evidence. |
| UXR03-03 Mission fleet | Fleet overview, Harness/Agent/Runner grouping, sessions, active/waiting/history views, Mission hierarchy and inspector | Synthetic fixtures; no live dispatch, event stream, or runner health. |
| UXR03-04 Evidence views | Transcript, Tool Calls, Terminal, File/Diff, Tests, Artifacts, Decisions, Verification, Runtime and timeline | Fixture-only examples; usage/receipts/browser evidence remain unavailable where no source exists. |
| UXR03-05 Explicit routes | `/dev/mission-control-prototype`, `/dev/task-control-prototype`; `/chat?view=*` remains Chat | `App.test.tsx` proves query routes do not mount the prototype. Preview links are host-gated. |
| UXR03-06 Responsive | Desktop/tablet/mobile; adjustable desktop inspector; on-demand mobile navigation/detail drawers | Browser captures and no-horizontal-overflow checks at 1440×900, 820×1180, 390×844. |
| UXR03-07 Interaction scenarios | Project and execution selection, tabs, session switch, filter, attention, attempt, cross-area navigation, local loading/error | Vitest and browser interactions; all local/synthetic. |
| UXR03-08 Deliverables | Screenshots, this mapping, flows, inventory, evidence parity, runtime integration plan | See sibling deliverables and `screenshots/`. |

## SPEC-294 sections 61–65

- Section 61 remains normative for canonical ownership, identity, authorization, freshness, concurrency, actions, and runtime acceptance. This prototype does not close any of these obligations.
- Sections 62–65 define the full-page shell and implementation boundary. R03 implements a separately addressable DEV concept and corrects the route overlap; it does not substitute for live canonical Mission/Task surfaces.

## SPEC-277 Task Control

R03 provides a distinct project-first **concept** aligned with Project → Goal → Task → Run/Attempt and evidence inspection. Stage labels and execution evidence are fixture examples, not canonical workflow state. SPEC-277 lifecycle stages, permission checks, actions, freshness and data projections remain open for real runtime proof.

## SPEC-312

The UI is delivered by the Platform modular shell and shares the registered `modular-debian-dev` target. It does not alter the Core chat/worker/credit/auth contracts, DB schema, migration state, or Cloudflare production target. Shared shell navigation is presentation-only and does not grant access.
