# SPEC-224 Guided First Run Activation Deployment Evidence

Observed: 2026-10-30 (Asia/Bangkok)

## Result

The activation review's persisted-run list previously concealed the DevelopmentRun identity in the Admin-facing compact/simple presentation and did not render the Approval Authority request reference. The list now renders both identifiers from the persisted conversation workspace response, so an Admin can identify the durable run and follow its genuine approval request after Start.

## Source and focused verification

- Integrated source: `e301b10804724e365de43ad91948b92d9f402e88`
- Focused tests: `npm test -- --run client/src/components/chat/Spec224WorkspacePanel.test.tsx client/src/pages/UnifiedWorkspace.test.tsx` from `apps/web` — 2 files, 42 tests passed.
- `git diff --check` passed before integration.

## Development deployment

- Target: `aimarkethubs.com` development release only; no production deployment was performed.
- Release generation: 251; service `smartspec-web.service`; source `e301b10804724e365de43ad91948b92d9f402e88`.
- Release: `smartspec-web-e301b10804724e365de43ad91948b92d9f402e88-46dc5e91fc47`
- Artifact: `sha256:212cd56cd6d7385a052965c6fd69e851fdd874c009983fdd6f9db15d68b4bacd`
- Deployment receipt: `/mnt/SmartSpecDev/.cache/codex/canonical-sources/.development-build-results/f29801373bfd4154c0d8/production-deployments/smartspec-web-e301b10804724e365de43ad91948b92d9f402e88-46dc5e91fc47-251.json`
- Public `/chat` and local `/chat` served the new immutable bundle; public `/api/health` returned 200. The loaded First Run chunk contained rendering of `DevelopmentRun:` with `runId` and `Approval Authority request:` with the persisted `approvalRef`.

## Acceptance boundary

No authenticated owner browser session was available to exercise the Admin flow. The local `orca computer` bridge exited before browser inspection. No Goal, Approval request, Job, or Attempt was created on the owner's behalf. Therefore this is deployment and focused source evidence only: authenticated visibility of live registry values, a real owner Start/approval request, Runner dispatch, Child 1/2 receipts and settlement, and Independent Final Verify remain unverified. Keep SPEC-224 at `FEATURE_DEPLOYED / LIVE_GOAL_PENDING` and continue from the same persisted identities when the owner starts the Goal.
