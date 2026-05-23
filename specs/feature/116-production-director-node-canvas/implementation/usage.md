# Feature 116 Implementation Usage

## What Is Implemented

- Shared `ProductionSpace` contracts and validation helpers in `apps/web/shared/mediaProduction.ts`.
- Gemini Omni production-node reference validation in `apps/web/shared/geminiOmni.ts`.
- Additive `media_production_spaces` persistence schema and migration.
- New tenant/user-scoped ProductionSpace tRPC procedures:
  - `getSpace`
  - `saveSpace`
  - `saveBrief`
  - `saveShot`
  - `getNodeConfig`
  - `saveNodeConfig`
  - `saveCanvasLayout`
  - `validateSpace`
  - `previewHandoff`
  - `previewExecutionPlan`
  - `runExecution`
  - `cancelExecution`
  - `reconcileExecution`
  - `retryExecution`
  - `saveShotProductUse`
  - `updateProductStoryboardAsset`
  - `repairStaleOutputRefs`
  - `exportSpace`
  - `archiveSpace`
  - `restoreSpace`
  - `deleteSpace`
- Production and Video Shot planning tabs in Media Studio with prompt/provider controls hidden on planning surfaces.
- Production workspace now includes context asset click-to-add/basic drag payloads, Product Evidence Tray, React Flow node drawer, invalid-edge warning path, list fallback, keyboard-accessible open/configure/delete/run controls, and Image/Video/TTS Save-to-Node config panel.
- Video Shot workspace now includes selected-shot editing, save, duplicate, split, lock/unlock, open/configure/delete, reorder, merge, product usage display, and child-node contract rendering.
- Media Studio wires ProductionSpace `getSpace/saveSpace/saveShot/saveNodeConfig/saveCanvasLayout` plus archive/restore/delete, run-one-node, product evidence role/status edits, and node/shot editing actions into the Production and Video Shot tabs.
- Backend contracts now include Feature 116 flag/kill-switch precedence, shared collaborator read/write/execute access policy, node-level config version guards, structured Product Evidence / shot usage actions, append-only execution attempts, idempotency keys, provider dispatch metadata, cancellation/refund bookkeeping, terminal media-task reconciliation, redacted audit events, metrics snapshots, and stale output-ref repair.
- Backend runtime now includes provider callback reconciliation, scheduler-safe pending execution reconciliation, credit ledger verification hooks, state-transition enforcement for execution lifecycle updates, and router integration tests for run/cancel/callback reconcile paths.
- Production pending-execution reconciliation is wired into `apps/web/server/jobs/productionExecutionReconciliationJob.ts` and can run in two production-safe modes:
  - Cloud Scheduler / Cloud Tasks mode: set `USE_CLOUD_TASKS=true` or `FEATURE116_PRODUCTION_RECONCILER_SCHEDULER_MODE=external`, then schedule a POST to `/_internal/tasks/production-execution-reconcile`. This is the preferred Cloud Run/serverless path because it does not rely on a warm web process.
  - In-process interval mode: set `FEATURE116_PRODUCTION_RECONCILER_SCHEDULER_MODE=interval` for non-serverless deployments. `FEATURE116_PRODUCTION_RECONCILER_ENABLED=false` disables reconciliation and `FEATURE116_PRODUCTION_RECONCILE_INTERVAL_MS` tunes the interval.
- Provider-backed execution cannot be enabled by user-editable `ProductionSpace.featureFlags` alone; server env flags such as `FEATURE116_RUN_ONE_NODE_ENABLED`, `FEATURE116_RUN_ONE_SHOT_ENABLED`, and `FEATURE116_BATCH_EXECUTION_ENABLED` must allow the scope first. Actual media-provider dispatch is additionally guarded by `FEATURE116_PROVIDER_DISPATCH_ENABLED=true` and uses the existing media generation service plus credit reserve/refund ledger.
- Planner/verifier/Gemini skill schemas and fixtures upgraded for typed ProductionSpace output.

## Production Rollout Checklist

Before enabling paid provider dispatch in production:

1. Configure provider credentials and verify the target media provider health check passes.
2. Enable server flags in this order: `FEATURE116_RUN_ONE_NODE_ENABLED=true`, then the intended scope flag (`FEATURE116_RUN_ONE_SHOT_ENABLED` or `FEATURE116_BATCH_EXECUTION_ENABLED` if needed), then `FEATURE116_PROVIDER_DISPATCH_ENABLED=true`.
3. Configure Cloud Scheduler to POST `/_internal/tasks/production-execution-reconcile` at the reconciliation cadence, authenticated the same way as other `/_internal/tasks/*` routes.
4. Run one staging smoke with a low-cost provider model and confirm attempt metadata includes provider task refs, terminal output refs, and credit ledger charge/refund entries.
5. Monitor production logs/metrics for `production-execution-reconciler`, provider callback/poll failures, credit ledger mismatch alerts, and Cloud Tasks failures before widening rollout.
6. Verify Cloud Monitoring alert policies exist for:
   - `SmartSpec Feature 116 Provider Callback Miss Rate`
   - `SmartSpec Feature 116 Pending Execution Backlog`
   - `SmartSpec Feature 116 Credit Ledger Mismatch`
   - `SmartSpec Feature 116 Cloud Task Failures`

## Verification Commands

```bash
npm --prefix apps/web test -- server/jobs/__tests__/productionExecutionReconciliationJob.test.ts server/services/__tests__/productionSpaceService.test.ts shared/mediaProduction.test.ts shared/geminiOmni.test.ts
npm --prefix apps/web test -- server/routes/tasks.test.ts
npm --prefix apps/web test -- server/routers/__tests__/mediaProduction.execution.test.ts
npm --prefix apps/web run e2e:production-director
npm --prefix apps/web run e2e:production-director-browser
NODE_OPTIONS='--max-old-space-size=8192' npm --prefix apps/web run check
npm audit --audit-level=high
npm --prefix apps/web audit --audit-level=high
npm --prefix docker-status audit --audit-level=high
npm --prefix api-generator audit --audit-level=high
bash apps/web/skills/media-production-storyboard-planner/scripts/verify.sh
bash apps/web/skills/media-production-plan-verifier/scripts/verify.sh
bash apps/web/skills/gemini-omni-video-director/scripts/verify.sh
git diff --check
```

## Browser Evidence

See `specs/feature/116-production-director-node-canvas/implementation/ui-browser-evidence.md`.

Feature 116 now has both a real Playwright browser evidence gate and the existing deterministic Vitest/jsdom evidence gate.

- Browser evidence: `npm --prefix apps/web run e2e:production-director-browser`.
- Vitest/jsdom deterministic evidence: `npm --prefix apps/web run e2e:production-director`.

The browser gate writes screenshots, console/error capture, overflow/overlap results, hover/selected state proof, dark/light proof, reduced-motion proof for every required viewport, advanced state proof, icon-control accessible-name proof, authenticated `/media-studio` route screenshots, and axe reports under `apps/web/test-results/production-director/`. The deterministic gate renders the Production Director surfaces, validates React Flow canvas contracts through a DOM mock, verifies normal plus Feature 115 product evidence fixtures, checks Image/Video/TTS node contracts, and statically confirms the evidence command remains documented.

Current deterministic scope also includes:
- node-list fallback duplicate-edge rejection + valid reconnect callback paths,
- node-list open/configure/delete/run action controls,
- invalid JSON guard and Save-to-Node payload assertions,
- context asset and product evidence tray states (disabled/enabled `Add to node`, role/status/evidence controls),
- empty Video Shot / no-shot state, plus save/duplicate/split/lock/unlock/reorder/merge shot actions,
- planning-state gate action disabling (`Planning...`).
