# Task Control Platform Development UI — 2026-10-28

Implementation source: `838523a86ec6c76c95d542334801cdd49ebb134b` (integrated `main` / `origin/main`).

## Implemented

- Task Control uses the existing authorized Workspace registry to find `PLATFORM_ENGINEERING`, preselects its Runner and Project Workspace only when the trusted binding is returned, and shows the canonical project title and current Runner-derived Codex readiness. Missing authority remains closed with recovery guidance.
- Added Prompt, canonical SPEC and SPEC + Prompt inputs using the existing SPEC-224 preparation / Goal path. Canonical SPEC context shows current handoff and next-ready WorkUnit; completed/non-runnable packages are rejected. Supplementary instructions remain subordinate to the selected SPEC scope.
- New conversation creation remains explicit and uses the existing Task Control callback, preserving the full-page view and draft. No Goal, DevelopmentRun, approval or dispatch was created during this acceptance.
- Dirty or non-converged source blocks write-capable Start. No workspace changes were reset or overwritten.

## Verification

Focused source suites passed: 6 files / 99 tests. Command from `apps/web`:

```sh
pnpm exec vitest run client/src/components/chat/Spec224WorkspacePanel.test.tsx client/src/components/chat/__tests__/UniversalControlPlanePanel.test.tsx server/routers/__tests__/spec226DevelopmentControl.test.ts server/services/__tests__/spec226DevelopmentControlBridge.test.ts server/services/spec224WorkspaceSpecSet.test.ts server/services/__tests__/spec224FeatureSpecCatalog.test.ts --reporter=dot
```

Authenticated local development Playwright UAT passed: 8/8 tests in `tests/e2e/uat/task-control-work-overview.spec.ts` using the repository UAT session broker and disposable `_dev` database, with real web/API services and no mocked APIs. This covered full-page Task Control, Simple/Developer switching, viewport checks, preserving a general prompt without creating development work, and opening the existing skill picker. These synthetic UAT identities do not prove the owner account's Platform Engineering grant, live Runner selection, or SPEC/Prompt Goal flow.

Dev runtime is active at source checkout `838523a86ec6c76c95d542334801cdd49ebb134b`; local `/health` returned 200 for web (`smartaihub-web`) and Python (`healthy`). Runner service logs recorded a current capability snapshot ACK as `applied` / `capability_ready`; this is not proof of Codex task probe or authorized workspace readiness.

## Remaining acceptance

- Real authenticated owner browser acceptance for authorized Platform Engineering selection and A-G flows remains unverified. The dev login smoke check returned HTTP 401 for the attempted test admin authentication, and the local GUI automation sidecar returned `accessibility_error`; the UAT broker is test-only and is not substituted for the owner's session. Minimum action: open Task Control at `https://aimarkethubs.com/chat?panel=control-plane&view=full` in the already authenticated owner browser, then verify the Platform Development card, selected Runner/Project, SPEC/Prompt preparation and existing Goal approval flow.
- Revalidate the actual Debian Runner's current Codex task probe, authorized Workspace binding, source convergence and write scope before any live Goal. No live Goal was started. SPEC-224 Session A2 remains responsible for Child 1 → receipt → automatic Child 2 runtime acceptance.
- Production deployment was not performed or claimed.
