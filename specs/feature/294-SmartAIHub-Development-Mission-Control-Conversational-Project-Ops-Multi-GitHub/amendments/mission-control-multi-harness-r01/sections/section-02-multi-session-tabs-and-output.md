# Section 02 — Project Task Control and Harness Mission Control

- **Requirements:** REQ-294-UW2-03, REQ-294-UW2-04, REQ-294-UW2-05.
- **Objective:** Add project/lifecycle grouping and harness/runner fleet views over the same authorized observability data, with execution selection, URL deep links, and ordered real event output.
- **Owned paths:** `apps/web/client/src/pages/UnifiedWorkspace.tsx`, observability list identity projection, focused UI/read-model tests.
- **Prerequisites:** Section 01; authorized Task/Runner read APIs and existing event hook.
- **Completion predicate:** Task Control uses real project/job stage facts and labels missing stages unknown; Mission groups only recorded Harness identities, can select multiple execution tabs, shows Runner facts distinctly, and output stays bound to selected Job.
- **Verification/evidence:** tests cover project and harness binding, unknown states, target Harness preselection against catalog and event display; detail remains linked to existing evidence API.
- **Fallback:** present unsupported lifecycle/host facts as unavailable and preserve the canonical detailed monitor route.
- **Blocker challenge:** ensure projections share same Job identity and no inferred status or new dispatch authority is introduced.
