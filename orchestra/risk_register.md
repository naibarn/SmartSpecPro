# Orchestra Risk Register

## Open Risks
- Provider execution is production-wired behind `FEATURE116_PROVIDER_DISPATCH_ENABLED` and existing run-one-node/shot/batch gates. Operational rollout still depends on enabling those flags with production provider credentials and a low-cost staging smoke.
- Moderate dev-tool audit items remain in root/apps/web/docker-status (`vitest`/`drizzle-kit`/related transitive tools) and require semver-major maintenance, but high/critical audit gates are closed.

## Resolved Review Findings
- Cross-user same-tenant production run overwrite: fixed with owner guards before new and legacy upsert paths.
- Stale write bypass: fixed by making `expectedVersion` required on new mutating space procedures.
- Export redaction: changed from regex denylist to explicit allowlist manifest.
- Production/Video Shot provider-control leakage: fixed by hiding prompt/settings/model controls and audio subtabs on planning tabs.
- Browser screenshot, console, viewport, overflow, dark/light, reduced-motion, focus/hover/selected, and axe evidence: fixed with Playwright Chromium evidence artifacts under `apps/web/test-results/production-director/`.
- Feature 116 provider runtime loop: fixed with reserve -> dispatch -> cancel/reconcile -> terminal output attach -> charge/refund paths behind production feature flags.
- Shared/collaborative access gap: fixed with owner plus collaborator read/write/approve/execute access policy checks.
- Provider completion automation gap: fixed at service/router level with callback reconciliation and pending execution poller.
- Production scheduler wiring gap: fixed with `productionExecutionReconciliationJob`, startup/shutdown integration, and regression tests.
- Operational credit reconciliation gap: fixed at service level with pluggable ledger verification, mismatch metrics, and alert summaries.
- DB-backed router integration gap: fixed with `mediaProduction.execution.test.ts`.
- Dependency high/critical audit blocker: fixed by removing the stale Vite 4/5-only JSX loc plugin, updating vulnerable package locks/manifests, and verifying 0 high/critical advisories across root, apps/web, docker-status, and api-generator.
- Cloud Run/serverless reconciliation gap: fixed with `/_internal/tasks/production-execution-reconcile`, Cloud Scheduler provisioning/validation entries, and external scheduler mode for the in-process reconciler.
- Authenticated live browser evidence gap: fixed with `/media-studio` route-level Playwright evidence across 390/768/1280/1440.
## Feature 116 Continuation Security Gate - 2026-05-22T13:08:27Z

- Initial verdict: FAIL.
- Finding: export redaction retained provider payload locator and wholesale `claimEvidence` objects.
- Resolution: removed `providerPayloadKey`, mapped `claimEvidence` to `claimId`, `evidenceIds`, `status`, and `riskLevel` only, and added regression tests.
- Final verdict: PASS.
- Residual risk superseded: DB-backed router integration coverage, live authenticated browser evidence, and production scheduler wiring were later added; the current remaining item is broad dependency audit remediation.
