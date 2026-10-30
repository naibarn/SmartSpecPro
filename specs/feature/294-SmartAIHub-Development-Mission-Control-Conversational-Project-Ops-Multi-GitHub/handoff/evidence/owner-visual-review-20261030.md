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
