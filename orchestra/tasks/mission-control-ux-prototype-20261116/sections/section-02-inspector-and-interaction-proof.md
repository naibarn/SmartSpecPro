# section-02-inspector-and-interaction-proof

- requirement_ids: REQ-294-MH-02, REQ-294-MH-03, REQ-294-UW2-05, REQ-294-P0-WORKSPACE-04, REQ-294-OWNER-UX-04
- objective: Complete context inspector tabs (Overview, Activity/Events, Terminal, Files/Diff, Tests, Artifacts, Browser, Usage/Credits, Receipts, Verification), canonical Mission-to-Job relationship detail, pending decisions, local Chat/Task Control demo navigation and return, selected execution URL restoration, keyboard navigation, and mobile on-demand drawers. Explicitly show null Agent/Run and unavailable evidence.
- owned paths: prototype page, styles and tests from section 01 only.
- prerequisites: section 01.
- completion predicate: fixtures include all specified simultaneous statuses, offline Runner, unavailable Harness, multi-Job Mission, completed artifacts and null identities; unsupported panels say unavailable; switching tabs/records does not perform backend mutations or request calls.
- verification: component tests for each interactive state and semantic/accessibility controls; browser walkthrough at all target viewport sizes.
- expected evidence: focused test results and 1440x900, 820x1180, 390x844 screenshots.
- fallback/substitution: If external browser is unavailable, retain exact commands and mark screenshot verification pending, while completing unit evidence.
- blocker challenge: Never represent fixture operations as real approval/dispatch/cancel/credit actions.
- waiting/reactivation: None.
