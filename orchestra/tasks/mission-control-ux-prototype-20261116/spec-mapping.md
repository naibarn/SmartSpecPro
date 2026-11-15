# SPEC requirement-to-UI mapping

| Requirement | Prototype mapping | Evidence / boundary |
|---|---|---|
| SPEC-294 §61.5 / REQ-294-MH-02 | Independently selectable executions; selected demo execution restored from URL query | Synthetic key only; no cancellation operation |
| SPEC-294 §61.5 / REQ-294-MH-03 | Activity / Events inspector tab renders ordered fixture events and cursor-shaped data | Freshness and durable replay are not claimed by fixture UI |
| SPEC-294 §61.5 / REQ-294-MH-06 | Fleet lists, Agent/Harness/Runner filters, attention reasons, responsive navigation | Demo has six entries; real 10+ concurrent capacity remains runtime acceptance |
| SPEC-294 §62 / REQ-294-UW2-01 | Full-page view, keyboard controls, Light/Dark/Balance themes, loading/error/empty/offline states | Authenticated route is DEV-only; existing Chat remains separate |
| SPEC-294 §62 / REQ-294-UW2-04 | Overview, Active Work, Waiting / Attention, History, Mission Detail, Inspector | Displays only synthetic fixtures, not authorized canonical runtime records |
| SPEC-294 §62 / REQ-294-UW2-05 | Inspector exposes all requested evidence tabs; absent evidence is labeled unavailable | No invented terminal/files/tests/browser/usage/receipts/verification claims |
| SPEC-294 §62 / REQ-294-UW2-07 | Route allowed on `aimarkethubs.com`, localhost, and loopback; source/deploy/UAT tracked separately | Prototype deployment does not imply owner acceptance or close SPEC-312 |
| SPEC-294 §63 / REQ-294-P0-WORKSPACE-03 | Desktop master/detail; tablet/mobile on-demand navigation and inspector drawers | Viewport screenshots and no horizontal overflow at agreed dimensions |
| SPEC-294 §63 / REQ-294-P0-WORKSPACE-04 | Agent/Harness/Runner/status filters; selection writes demo execution key to URL | Filters are local fixture projections, not live canonical Run filters |
| SPEC-294 §64 / REQ-294-OWNER-UX-02 | Harnesses, Agents, Runners, Active, Waiting/Attention, History views | Unavailable Harness and offline Runner are explicit demo examples |
| SPEC-294 §64 / REQ-294-OWNER-UX-04 | Local Ready/Loading/Error/Empty/Offline examples and drawer adaptation | No backend health state is inferred |
| SPEC-294 §65 (R1.22 tenant Mission read model) | Fixture Mission and Task DTOs use existing exported contract shapes; Job/Run/Agent/Artifact IDs are explicit, absent IDs null | UI-only `DemoExecution` joins fixtures; no production schema added |
| SPEC-277 Task Control | Task/Job distinction, canonical stage evidence posture, related Task Control preview | Preview does not mutate or claim stage completion |
| SPEC-312 R1.24 Chat Shell | Existing authenticated shell is unchanged; isolated lazy route and local navigation preview | No changes to Chat, worker jobs, credit ledger, database, queue, or runtime contracts |
