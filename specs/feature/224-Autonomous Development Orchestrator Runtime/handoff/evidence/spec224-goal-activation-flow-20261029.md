# SPEC-224 Goal Activation Flow — 2026-10-29

Observed at `2026-10-28T23:46:02Z` (`2026-10-29T06:46:02+07:00`). This records a Task Control activation diagnosis; it is not live execution acceptance.

## Current runtime and persisted state

- Current repository source is `a870e9abd51392601a104009dc8d1b9ff29b6963` (`HEAD == origin/main`). The Task Control Start repair `fdd490d0ebeea543edb50df46a47f3d04ba9a5f9` is in its ancestry.
- The development web and tunnel user services are active. `https://aimarkethubs.com/login` returns HTTP 200, and its served `Spec224WorkspacePanel.tsx` contains the `startWorkspaceRun` mutation, “เริ่มพัฒนา” control, and Goal pending handling.
- The previously observed `smartspec_dev` state has no `spec224_goal_delegation_grant` approval request and no SPEC-224 worker job. No successful Goal Start/Grant/Job was persisted by that observation. No owner-authenticated Goal request was sent by this diagnostic.
- Latest previously observed Debian Runner snapshot was applied and Codex-ready at source SHA `0d2b9443b050c60902f7f9bc8eb2e820bbe46323`, but its five-minute snapshot expired at `2026-10-28T23:32:34Z`; refresh and re-evaluate source admission before any release. The current screenshot's Windows Runner is a different, stale runtime selection and is not evidence about the dev Debian Runner.

## First activation boundary

The user-provided screenshot is at `smartaihub.app/chat?panel=control-plane&view=full&c=241`. It shows the Windows Runner as offline/stale, no Project Workspace available, the “สร้าง Mini App จาก prompt” action, and a success toast with a Mini App URL. The panel source binds that action to `startPersonalMiniApp()`, which calls `startWorkspaceRun` with `factoryMode: true`. The server router takes the Mini App factory branch before the SPEC-224 workspace binding, Goal Admission, durable DevelopmentRun and Goal Grant path. Therefore this action can successfully create a Mini App while creating no SPEC-224 Goal or Goal Grant. It is not a failed authenticated Goal request.

For the requested pilot, the owner must use the development Task Control at `aimarkethubs.com`, choose the registered Debian Platform Engineering Runner and its Project Workspace, select “พัฒนาตาม prompt” (not “สร้าง Mini App”), enter the bounded pilot prompt and exact approved write scope, then click “เริ่มพัฒนา”. The Start response should persist a DevelopmentRun and show that Goal approval is pending. The owner then approves that exact Goal Grant through the existing Approval Authority. No new Run should be created if the existing Run appears; resume the same Run/idempotency identity.

## Source trace

- `apps/web/client/src/components/chat/Spec224WorkspacePanel.tsx`: `startPersonalMiniApp` calls the mutation with `factoryMode: true`; `startWorkPackage` calls it for the Goal flow with `factoryMode` set from the selected request kind, persisted idempotency key, budget and model selection. The development “เริ่มพัฒนา” button creates/binds a conversation and prepares it before invoking the Goal Start when ready.
- `apps/web/server/routers/spec226DevelopmentControl.ts`: `startWorkspaceRun` handles `factoryMode` first; the SPEC-224 branch afterward enforces workspace binding and Runner readiness, recovers idempotency, persists/advances Goal Admission and returns `GOAL_APPROVAL_PENDING` when approval is needed.
- No source defect was established by this screenshot. Its visible workflow is Mini App creation on the production hostname, with a stale Windows Runner and no workspace; it does not exercise the development Goal Start boundary.

## Status

`WAITING_FOR_OWNER_GOAL_START_AND_APPROVAL`. Exact remaining owner action: on `aimarkethubs.com`, start the bounded Goal with the development workflow and Debian workspace, then approve the resulting Goal Grant in Task Control/Approval Authority. After approval, refresh the existing Runner snapshot and source admission, then continue the same Run through real Child 1 receipt/settlement, automatic Child 2, and independent Final Verify. No live receipt, settlement, or completion is claimed.
