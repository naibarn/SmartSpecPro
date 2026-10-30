<!-- PROJECT_CONFIG
runtime: typescript-pnpm
test_command: pnpm --dir apps/web exec vitest run client/src/pages/TaskObservabilityMonitor.test.tsx
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-fleet-state-and-entry
section-02-multi-session-tabs-and-output
section-03-controls-tests-and-handoff
END_MANIFEST -->

# Implementation Sections Index

| Section | Depends On | Blocks | Parallelizable |
|---|---|---|---|
| section-01-fleet-state-and-entry | - | 02 | No |
| section-02-multi-session-tabs-and-output | 01 | 03 | No |
| section-03-controls-tests-and-handoff | 02 | - | No |

## Section summaries

### section-01-fleet-state-and-entry
REQ-294-UW2-01, REQ-294-UW2-02, REQ-294-UW2-06. Implement the full-page `/chat` shell, persistent mode nav, project/session/thread pane, conversation center and inspector; keep old complex tools on `/chat-legacy`. Verify chat/thread deep links and focused shell tests.

### section-02-multi-session-tabs-and-output
REQ-294-UW2-03, REQ-294-UW2-04, REQ-294-UW2-05. Build project/lifecycle Task Control and harness/runner Mission Control from shared authorized projections, with exact job deep links, selectable tabs and real event output. Verify unknown states, output binding and dispatch preselection revalidation.

### section-03-controls-tests-and-handoff
REQ-294-UW2-06, REQ-294-UW2-07 and all focused acceptance. Preserve old browser/admission paths, run focused tests and build, identify development-only deployment target, update canonical handoff, and retain owner UAT/SPEC-224 live execution as separate gaps. No new mutation authority.
