# SPEC-294 owner visual review — 2026-10-30

## Owner feedback

The owner supplied UI references showing (1) a project/task workspace organized into recognizable work stages and (2) an operations console for reviewing multiple agent runs and decisions. The current full-page shell is visible, but its content model is rejected as backend-oriented and difficult to use. The feedback authorizes implementing the attached Workspace 2.0 product UX brief while retaining the full-page AppShell.

## Required correction

- Task Control: project-first master/detail with actual Goals/work groups, evidenced lifecycle, assignments, active Run/phase, progress, blockers/decisions, files/tests/results, and linked sessions/threads. Legacy tasks are not Goals; do not infer missing lifecycle evidence.
- Mission Control: operational views for Overview, Harnesses, Agents, Runners, Active Work, Waiting/Attention, and History, using the existing authorized work records; show a contextual Run inspector and keep unknown facts unknown.
- Chat: visible Project/Session/Thread navigation, main conversation, and contextual inspector; keep the modal only as quick-chat.
- Preserve Simple/Developer disclosure boundaries, responsive behavior, existing messaging features, and keep SPEC-224 Live Execution Acceptance separate.
- Deploy only to `aimarkethubs.com` for this visual checkpoint. Owner acceptance remains pending until explicit approval.

## Evidence boundary

The images and brief were supplied directly in the owner conversation on 2026-10-30. No new authenticated browser screenshot, live Harness execution, or owner acceptance is implied by recording this feedback. Follow-up implementation and verification evidence must identify their exact source revision and target runtime.

## Implementation checkpoint — `ae0e4e688724f859a8faaf70d06ebec2835caaac`

- Replaced the prior task/run lists with a Project → Goal master/detail view, truthful lifecycle evidence, current execution assignment/state, linked Session/Run navigation, and separate Unassigned/Legacy work grouping.
- Replaced the raw Mission Control list with Overview, Harnesses, Agents, Runners, Active Work, Waiting/Attention, and History sections. Selecting a run opens its contextual inspector; Developer mode reuses the shared inspector for Activity, Terminal, Files, Diff, Tests, Artifacts, Usage, Receipts, and Verify.
- Kept the full-page Chat AppShell and its existing visible Project/Session/Thread sidebar, conversation, and inspector. The new navigation entries render the replaced workspaces directly; the legacy modal is not used as the primary workspace.
- Focused verification: `pnpm exec vitest run client/src/pages/UnifiedWorkspace.test.tsx --reporter=dot` (6/6 passed); `pnpm run build` (main app, widget, and MapLibre worker verification passed; existing large-chunk warning remains).
- Development deployment: `smartspec-dev-web.service` restarted on checkout SHA above; its health check passed and diagnostics guard returned the expected 403. `https://aimarkethubs.com/chat?mode=mission` returned HTTP 200, and its served `UnifiedWorkspace`, `MissionControlWorkspace`, and `ProjectExecutionWorkspace` modules returned HTTP 200 with the new UI code.
- Remaining: owner visual/functional UAT, confirmation that the available authorized records produce the intended project and lifecycle view, and live Harness execution acceptance. This checkpoint does not mark `OWNER_UAT_ACCEPTED` or SPEC-224 accepted.

## Follow-up: Browser control preserved — `dd411780ea4b378e69ce314af267145e93ad99fb`

The full-page Chat had disabled its existing Browser session entry point. It is visible again, and a regression assertion now verifies that Chat keeps the Browser control reachable. The focused workspace test remains 6/6 passing; the production-mode app/widget build passed with the same existing large-chunk warning. `smartspec-dev-web.service` restarted successfully at `dd411780ea4b378e69ce314af267145e93ad99fb`; the public `/chat`, `?mode=tasks`, and `?mode=mission` routes and the transformed workspace modules returned HTTP 200. Authenticated owner visual/functional UAT and live Harness acceptance are still pending.
