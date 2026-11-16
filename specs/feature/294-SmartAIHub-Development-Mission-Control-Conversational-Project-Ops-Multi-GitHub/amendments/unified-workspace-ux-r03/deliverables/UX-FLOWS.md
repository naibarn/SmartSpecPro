# Unified Workspace UX R03 — interaction flows

## Environment and data boundary

- All Mission/Task fixture data is synthetic and visibly labeled `DEV PREVIEW · DEMO DATA · NOT LIVE`.
- `/dev/mission-control-prototype` and `/dev/task-control-prototype` require the authenticated shell and are restricted to `aimarkethubs.com`, localhost, and loopback.
- `/chat` remains the existing authenticated Chat runtime. `/chat?view=missions`, `/chat?view=tasks`, and `/chat?view=task-control` are not intercepted by the prototype.
- Navigation between preview areas keeps the selected execution key in the URL. Chat navigation opens the real Chat route and does not claim canonical identity continuity.

## Task Control flow

1. Open the **Task Control** area from the shared header or directly at `/dev/task-control-prototype`.
2. Choose a demo project in the project selector. The project tree shows Goal → Task → Run/Attempt grouping.
3. Select a task/execution. The central workbench and shared inspector update to that selection; the execution key is retained in the URL.
4. Select **Work Plan**, **Transcript**, **Tool Calls**, **Terminal**, **Files / Diff**, **Tests**, **Artifacts**, **Decisions**, **Verification**, or **Runtime** to inspect labeled fixture evidence.
5. Expand a Tool Call to inspect its local fixture details. Switch between terminal and diff; use **Expand full width** or the bottom evidence dock for long evidence.
6. Switch the attempt selector. The UI explicitly labels which data is historical/current fixture data; it does not mutate a Job or Run.
7. Use the inspector to inspect canonical-shaped Mission/Job/Run/Attempt identities (all demo IDs), then return to Mission Control or Chat.

## Mission Control flow

1. Open **Mission Control** from the shared header or `/dev/mission-control-prototype`.
2. Select a project/workspace filter and a view: Overview, Harnesses, Agents, Runners, Active Work, Waiting / Attention, or History.
3. Harness, Agent, and Runner views group only by fixture identities actually present. Missing identities are grouped as `not reported` and are not inferred.
4. Select a concurrent session tab or a fleet row. The selected execution and inspector update without dispatch or mutation.
5. Inspect the Mission → Jobs → Runs hierarchy and activity timeline. Freshness and capability claims are marked as fixture-only/unavailable.
6. Open **Task workbench** to carry the selected demo execution across areas; return to **Mission Control** with the same execution key.

## Responsive interaction

- Desktop: persistent project/fleet navigation, central workspace, shared inspector; inspector width is adjustable.
- Tablet and mobile: **Menu** and **Details** open on-demand drawers. Scrims and close buttons dismiss them; center workspace remains the primary surface.
- Mobile drawers have dedicated screenshots (`*-mobile-menu.png`, `*-mobile-details.png`). The UI was exercised at 390×844; tablet at 820×1180; desktop at 1440×900.

## Interaction boundaries

Loading/error examples are local state only. No network call is made by Mission/Task mock interactions. The prototypes do not create, cancel, retry, approve, dispatch, or resume real work. Live action flows require canonical runtime integration and authorization.
