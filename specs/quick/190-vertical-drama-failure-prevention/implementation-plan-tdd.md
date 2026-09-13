# TDD and Verification Plan

## 1. Safety unit and contract tests

Files:

- `apps/web/server/services/__tests__/verticalDramaStorySafety.test.ts`
- new focused tests beside each changed safety projection if needed

Cases:

- `ประกาศพัก` and other Thai word-boundary joins do not produce `graphic_violence`
- explicit corpse/graphic violence phrases still produce high finding
- Unicode normalization, whitespace, punctuation and mixed Thai/English forms
- negation/benign context is not confused with explicit action
- finding contains correct `shotNumber`, `fieldPath`, rule, detector version and bounded evidence
- prompt metadata alone cannot create authored high-risk intent without uncertainty classification
- multi-shot input does not leak evidence between shots
- malformed/oversized input remains bounded and fail-closed

Command:

```bash
cd apps/web
JWT_SECRET=codex-local-test-secret-01234567890123456789 DATABASE_URL=postgresql://smartspec:smartspec123@localhost:5432/smartspec pnpm exec vitest run server/services/__tests__/verticalDramaStorySafety.test.ts
```

## 2. Candidate recovery and credit tests

Files:

- `apps/web/server/services/__tests__/verticalDramaStoryboardGeneration.test.ts`
- `apps/web/server/services/__tests__/verticalDramaStoryJobs.test.ts`
- relevant router tests under `apps/web/server/routers/__tests__`

Cases:

- original candidate is retained after each failed repair
- bounded attempts stop on high-risk, uncertainty, schema failure and no-progress
- only accepted candidate enters media handoff
- rejection does not commit credits; accepted result commits once
- retry idempotency key includes job/attempt/shot without double charge
- owner cannot read or repair another tenant's candidate
- duplicate recovery click returns existing job/state

## 3. Queue/checkpoint/restart tests

Files:

- `apps/web/server/services/__tests__/verticalDramaStoryJobs.test.ts`
- `apps/web/server/services/__tests__/workerStallWatchdogService.test.ts`
- `apps/web/server/services/__tests__/verticalDramaStoryGenerationRuntime.test.ts` if runtime contract changes
- `apps/web/server/_core` deployment/verification tests

Cases:

- checkpoint write ordering cannot clobber terminal result
- stale BullMQ failure cannot overwrite a newer `dispatchId`
- failed delivery with active Redis record is reconciled correctly
- same job id resumes only incomplete episodes
- stale worker loses fence before result/checkpoint/credit mutation
- pointer race, TTL expiry, no checkpoint, retry limit and no remaining work
- running job with old heartbeat becomes recoverable/alertable
- startup sweep reconciles orphaned deliveries before readiness
- drain rejects new work and permits checkpoint/close sequence

## 4. UI/browser tests

Files:

- `apps/web/client/src/components/verticalDramaSeries/__tests__/VerticalDramaDeepStoryDraftsPanel.actions.test.tsx`
- `apps/web/client/src/pages/__tests__/VerticalDramaSeriesDetailPage.deepStoryDrafts.test.tsx`
- browser smoke/evidence under the existing Vertical Drama test surface

Cases:

- state matrix renders correct Thai/English copy and reason
- policy block shows affected shot/evidence and review action
- recoverable checkpoint shows completed/remaining and one confirmation CTA
- no checkpoint disables resume with clear next action
- duplicate click is disabled while mutation is pending
- refresh/reconnect attaches to existing job without resubmit
- keyboard/focus/aria-live behavior and narrow viewport layout

## 5. Operational proof

- run focused tests for changed paths
- run `git diff --check`
- run `pnpm check` and record unrelated baseline failures separately
- verify build artifact identity and service restart logs
- verify `/healthz` remains liveness and `/readyz` transitions during drain/startup
- run a non-provider, non-credit staging fault injection: kill worker between checkpoint writes, restart, observe same-jobId resume
- inspect metrics/log correlation for one policy block and one recovered stall
- production proof requires explicit deploy/restart/browser/provider/credit gates; local tests alone are insufficient

## Acceptance checklist

- [ ] Incident fixture no longer false-blocks
- [ ] Genuine high-risk fixture still blocks
- [ ] Candidate and evidence are preserved
- [ ] No rejected/retried candidate double-charges
- [ ] Same-jobId checkpoint resume works after worker restart
- [ ] Stale worker cannot mutate current run
- [ ] UI differentiates policy, provider, schema and infrastructure states
- [ ] Readiness/drain/reconciliation evidence exists
- [ ] Rollback and alert tests are documented
