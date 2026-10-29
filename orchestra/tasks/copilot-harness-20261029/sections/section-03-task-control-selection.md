# Section 03 — Task Control selection

- **Requirement IDs:** R5
- **Objective:** Show Microsoft Copilot and its freshly discovered models in the existing Task Control flow.
- **Owned scope:** Spec224WorkspacePanel and directly related catalog projection/types/tests.
- **Prerequisites:** Sections 01 and 02 establish capability catalog and dispatch binding.
- **Completion predicate:** selection uses only available catalog entries tied to the active Runner/account; missing/stale auth/catalog is actionable and disabled; normal Goal submission remains the route.
- **Verification:** focused frontend component/API tests and formatting/lint as available.
- **Expected evidence:** component tests for dynamic model options, unavailable states, and Codex regression.
- **Fallback:** hide/disable Copilot when current Runner has no verified catalog.
- **Blocker challenge:** adapt existing model catalog contract rather than introduce a model registry or unrelated redesign.
- **Waiting/reactivation:** refresh the capability projection if the Runner schema changes.
