# Spec 224 WP-UI-01 checkpoint

- Status: `IMPLEMENTED_UNVERIFIED`
- Worktree: `/home/dev/projects/SmartSpecPro-spec224-ui-01`
- Branch: `codex/spec224-wp-ui-01-20260926`
- Base: `a3154dc94ea1dc01e540b5a0b7d7e47cc29a9b2f`
- Scope: Existing AI Chat Task Control panel and canonical Spec 226 DevelopmentRun projection only.
- Ownership: This isolated branch owns the five changed UI/bridge/router/test files plus this checkpoint. No Spec 224 runtime persistence, WP-REQ-01 implementation, Cloudflare migration, migration, or production files changed.

## Implemented

- Added active-run count and a Needs Attention / Decision Inbox derived only from canonical waiting/blocked states and persisted open blockers.
- Added persisted requirement-closure projection to the existing Spec 226 list/detail view, including baseline revision/digest, PlanSection/WorkPackage dependency map, requirement states, blocker ledger and evidence references.
- Added event timestamps to the selected-run timeline.
- Versioned the additive projection as bridge v2 and revalidates latest bridge version, run revision, fencing version, decision epoch and advertised action before pause/cancel; the bridge checks decision epoch and still delegates transition/CAS to canonical DevelopmentRun persistence.
- Preserved `IMPLEMENTED_UNVERIFIED` as distinct from verified requirement states. Deferred test obligations are explicitly reported as unavailable in the current canonical bridge; no status is inferred.
- No new lifecycle, job store, approval service, or runtime was introduced.

## Changed files

- `apps/web/client/src/components/chat/UniversalControlPlanePanel.tsx`
- `apps/web/server/services/spec226DevelopmentControlBridge.ts`
- `apps/web/server/routers/spec226DevelopmentControl.ts`
- `apps/web/server/services/__tests__/spec226DevelopmentControlBridge.test.ts`
- `apps/web/server/routers/__tests__/spec226DevelopmentControl.test.ts`
- `orchestra/spec224-wp-ui-01-checkpoint.md`

## Verification

- `git diff --check`: PASS.
- Prettier was used on the changed files; formatting-only churn against pre-existing UI/router lines was reverted to preserve scope. Final changed files pass TypeScript syntax transpilation and `git diff --check`; a full-file Prettier check is not claimed for files with inherited formatting differences.
- Astryx design-kit command: unavailable because the isolated worktree has no installed `@astryxdesign/cli`; no dependency installation was performed.
- Vitest, browser, integration and regression campaigns: DEFERRED; package dependencies are absent from this isolated worktree. TypeScript typecheck remains `SKIPPED_POLICY`.

## Deferred obligations

- Run focused `spec226DevelopmentControlBridge` and router tests after approved dependencies are available.
- Add a browser interaction pass for responsive panel, selected-run detail, inbox navigation, action stale-state feedback and timeline accessibility.
- Expose deferred test obligations only after a canonical persisted field/API is defined; do not create UI-local test status.
- Consolidated unit/integration/E2E/regression campaign remains outstanding. This checkpoint is not verification or production certification.

## Next package

- Candidate: `WP-UI-02 — canonical deferred-test obligation projection`.
- Status: `DEPENDENCY_BLOCKED` until Spec 224 provides a persisted, versioned source for deferred test obligations and evidence freshness. Do not infer these from UI state or free-form event payloads.
- No Cloudflare migration files are in this branch's write set.
