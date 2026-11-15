# Accepted design scope — Mission Control UX prototype

This is a DEV UX validation prototype using the existing SmartSIHub Modular React/Astryx stack. It will appear only at `/dev/mission-control-prototype` on `aimarkethubs.com` and localhost; the route is not linked from production navigation and will reject other hostnames. Existing `/chat`, `/task-control`, and Mission Control behavior remain untouched.

The prototype is a full-page, responsive fleet workbench. A compact global header holds workspace/project and display controls. Navigation provides Overview, Harnesses, Agents, Runners, Active Work, Waiting / Attention, History, Mission Detail, and Execution Inspector. The desktop composition uses a narrow fleet/filter rail, a flexible central work surface, and a contextual inspector. Tablet and phone use on-demand, keyboard-accessible drawers and selected-execution focus instead of squeezed columns.

All data is deterministic local fixture data, visibly marked “DEMO · synthetic data · not live”. DTO-like Mission, Task/Job and event records use existing `@smartaihub/saas-contracts` types when available. View-only execution fixture metadata is a UI-only discriminated presentation type, not a production contract. Missing Agent/Run identity stays null and displays “Not reported”. All file, terminal, browser, usage, receipt and verification evidence not provided by a canonical backend is labeled unavailable. Actions are navigation or local presentation state only; no backend fetch, dispatch, approval, credit mutation, or fake successful operation.

Controls cover workspace/project, Agent/Harness/Runner/status filters, activity/name sort, selectable concurrent execution tabs, URL-restored selected execution, mission/job hierarchy, detail tabs, decision preview, related Chat/Task Control demo navigation and return. A scenario switch exposes loading, error, empty, offline, failed and unavailable states.

Themes are Light, Dark, and Balance; mode is Simple or Developer. Simple shows goal/status/next step/attention. Developer adds fixture IDs, event and source freshness details, and explicit null evidence without elevating privileges.

Acceptance proof: focused route/component tests, shell production build, and screenshots of desktop 1440×900, tablet 820×1180, and mobile 390×844. Documentation includes interactions, component inventory, requirement mapping to SPEC-294 §§61–65 / SPEC-277 / SPEC-312 R1.24, implementation gap matrix, and runtime integration proposal. The concept cannot close owner UAT, SPEC-312, SPEC-224, or actual Mission runtime acceptance.
