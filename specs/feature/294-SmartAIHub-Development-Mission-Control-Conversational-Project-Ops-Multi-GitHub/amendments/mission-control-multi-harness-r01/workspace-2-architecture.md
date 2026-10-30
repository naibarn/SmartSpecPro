# SmartAIHub Workspace 2.0 screen architecture

## One shell, three views

The primary `/chat` route is a full-page `AppShell`; `/chat-legacy` preserves complex prior controls during migration. The top navigation switches between Chat, project-centric Task Control and Harness-centric Mission Control. Query parameters keep conversation/thread identity when switching modes; Mission Control additionally accepts the canonical job ID. Legacy Browser/Finance/other panel deep links retain their old behavior through `/chat-legacy`.

```text
AppShell
├── Top navigation: Chat | Task Control | Mission Control | Simple/Developer | Advanced
└── Active mode
    ├── Chat: persisted sessions/threads | conversation canvas | thread/run inspector
    ├── Task Control: project list | lifecycle projection | actual Goal/Job evidence
    └── Mission Control: Harness/Runner fleet | independently selected execution tabs | live output/detail
```

## Data contracts

- Chat history and thread navigation use existing conversation/thread APIs and IDs.
- Task Control and Mission Control use the same `workerJobs.observability` authorized snapshot. Harness, agent, model, project, stage and job identity come from the list projection; no per-row detail fanout is introduced.
- Mission Control Runner health uses the authorized Runner registry. Trust, status, snapshot freshness, capability ACK, last heartbeat and dispatch readiness remain separate.
- Selected live output uses the existing durable Harness event hook. Detailed evidence links to the canonical observability detail page.
- Targeted Harness selection returns through existing Goal admission. The selected adapter is accepted only when the chosen workspace's fresh catalog contains it; existing Runner, source, approval, budget and lease validation remains authoritative.
- No recorded lifecycle stage is displayed as `Not recorded`; no API error is converted into empty success or synthetic activity.

## Responsive and presentation behavior

Use Astryx `AppShell`, `TopNav`, `Layout`, `LayoutPanel`, `LayoutContent`, `HStack`, and `VStack` primitives with the repository's active neutral theme. The shell uses independent fill-height regions. Panel navigation is keyboard accessible and labeled. Simple mode keeps goal/status/attention/result visible; Developer adds model, attempt, machine evidence and event output. The Chat mode retains the existing three-pane conversation components. Smaller widths use Astryx's responsive shell behavior; legacy controls remain directly reachable for capabilities not yet migrated.

## Milestone trace

| Milestone | Delivered surface | Evidence / remaining boundary |
|---|---|---|
| M1 | Full page, persistent mode navigation, shell inspector and legacy access | Focused shell tests; runtime responsive UAT pending |
| M2 | Session/thread sidebar, Chat canvas, run inspector, URL context | Uses existing canonical conversation UI; browser-session action remains on legacy path |
| M3 | Project grouping and lifecycle status/evidence | Uses authorized job projection; richer Goal/WorkPackage lifecycle APIs remain unavailable where unrecorded |
| M4 | Harness groups, Runner health facts, concurrent selectable session views | Uses recorded Harness identity; no fake harnesses or dispatch; targeted create returns to admission |
| M5 | Live Harness output and canonical evidence drilldown | Existing event source/detail route; populated real-run evidence requires a live execution |
| M6 | Development-only runtime publication and owner UAT | Not claimed until target runtime is identified and verified; production is explicitly excluded |
