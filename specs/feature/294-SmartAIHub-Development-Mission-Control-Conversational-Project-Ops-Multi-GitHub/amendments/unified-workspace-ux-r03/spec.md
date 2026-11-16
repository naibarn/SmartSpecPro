# SPEC-294 Amendment — Unified Workspace UX Re-architecture R03

## Objective
Create an interactive DEV-only UX prototype for a unified SmartSIHub workspace shell with distinct Task Control and Mission Control experiences. Preserve authenticated Chat behavior and do not replace any live view.

## Requirements
- **UXR03-01 Unified shell:** shared app header, workspace/project context, theme, responsive navigation, inspector controls, typography and interaction conventions across the DEV prototypes. Keep page contents distinct.
- **UXR03-02 Task workbench:** project → goal → task → run/attempt hierarchy on the left; selected task execution workspace in the center; contextual inspector on the right; expandable full-width evidence dock. Provide interactive Work Plan, Transcript, Tool Calls, terminal/stdout/stderr, file tree, diff, tests/failures, artifacts, decisions, verification, runtime diagnostics and attempt switching. Long code/log evidence must not be confined to a narrow inspector.
- **UXR03-03 Mission fleet:** fleet overview, harness and agent grouping, runner readiness/freshness, concurrent execution sessions, waiting/attention, session tabs, Mission→Job→Run hierarchy, recent history and shared inspector. Selection persists while switching sessions. Never dispatch or mutate real work.
- **UXR03-04 Evidence components:** reusable transcript, tool-call, terminal, file-tree, diff, test, artifact, timeline, verification, usage and identity views. Use canonical DTO shapes when available; mark synthetic fixture data as DEMO, preserve unknown identities, avoid secret payloads and never imply unverified backend capability.
- **UXR03-05 Explicit DEV routes:** `/dev/mission-control-prototype` and `/dev/task-control-prototype`. `/chat` and query variants always retain the authenticated Chat runtime. Cross-navigation preserves the selected demo execution and clearly labels fixture/live context.
- **UXR03-06 Responsive behavior:** usable at 1440×900, 820×1180 and 390×844. Resizable desktop inspector, mobile on-demand navigation/inspector drawers, readable evidence panels, keyboard/focus support.
- **UXR03-07 Validation:** implement the task and mission interaction scenarios from the owner brief entirely with synthetic local state; no backend dispatch or mutation.
- **UXR03-08 Deliverables:** updated prototypes and unified shell, component inventory, screenshots at the target sizes, interaction scenarios, mapping to SPEC-277 and SPEC-294 sections 61–65, Codex evidence parity matrix, and a runtime integration plan. Deploy only to modular Debian DEV. Mockup evidence does not close SPEC-277/294/312 or replace production routes.

## Constraints
Use existing React/Astryx and existing canonical fixture DTOs. Keep SmartSpecPro and Platform worktrees intact; do not alter Chat runtime contracts, scheduler, worker queue, or real Mission/Task routes. Use synthetic IDs only inside DEV preview UI.


## Implementation evidence (2026-11-16)

The R03 DEV preview is implemented in `smartaihub-platform` at source SHA `c8dee72b71367282167bbddd3880e902a2678f2b` and deployed to the registered `modular-debian-dev` target (`aimarkethubs.com`). The shared shell is present in Chat and explicit DEV Task/Mission routes. Task Control uses a distinct project-first workbench; Mission Control groups synthetic executions by Harness, Agent, and Runner while preserving unknown identity.

Focused route/workspace tests passed 15/15, the shell production-mode build and Wrangler dry-run passed, and desktop/tablet/mobile captures were taken at 1440×900, 820×1180, and 390×844 with no horizontal overflow or browser page errors. The deployment controller reported `DEPLOYED_AND_VERIFIED`, local Core/Chat/Shell health 200, Chat unauthenticated boundary 401, and public shell/Chat route health 200.

This is an authenticated DEV-only synthetic UX concept; authenticated owner review, live canonical Mission/Job/Run binding, real execution evidence parity, and SPEC-224 acceptance remain open. See `deliverables/` and the canonical Spec handoff evidence entry.

## R03.2 implementation evidence (2026-11-16)

R03.2 is implemented at Platform source `b1f29c58aaf645fbc485209cafee07e7e6179979` and deployed to `modular-debian-dev` (`aimarkethubs.com`). It adds persistent independent Harness tabs, execution and Attempt selection, responsive split views, readiness disclosure and exact fixture Task Control navigation. The focused Mission prototype suite passes 9/9; canonical Core/Shell/Chat build and DEV release smoke passed. Browser checks at 1440×900, 820×1180 and 390×844 had no page errors or horizontal document overflow. R03.2 acceptance proof and screenshots are in `deliverables/r03.2/`.

This completes only the R03.2 synthetic prototype slice. Authenticated live catalog/Runner adapters, canonical Mission/Job/Run/Attempt and event sources, production Task Control authorization/deep links, cross-tenant live denial, and SPEC-224 execution evidence remain open. `execution` and `attempt` query values are fixture-only and are not an API contract.
