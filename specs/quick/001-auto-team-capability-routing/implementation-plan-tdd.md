# TDD and Verification Plan

## Targeted Test Set

Run:

```bash
npm --prefix apps/web run check
npm --prefix apps/web run verify:auto-team-work-request
npm --prefix apps/web test -- scripts/__tests__/verify-auto-team-work-request-readiness.test.ts client/src/pages/__tests__/WorkRequest.test.tsx client/src/pages/__tests__/MyRequests.test.tsx server/routers/__tests__/workOs.test.ts server/services/__tests__/workOsService.test.ts server/services/__tests__/runEngine.test.ts server/services/__tests__/teamRunCompletionNotificationService.test.ts server/services/__tests__/runtimeDispatchPolicy.test.ts server/services/__tests__/teamRunSkillExecutorUnifiedWiring.test.ts server/services/__tests__/autoTeamMediaExecutionService.test.ts server/services/__tests__/autoTeamMediaCompletionService.test.ts server/services/__tests__/autoTeamRecoveryService.test.ts server/services/__tests__/managedMediaAccessService.test.ts server/services/__tests__/workOrchestratorPlanningService.test.ts
```

Expected coverage:

- Work Request simple start flow
- My Requests execution trail and media URL exposure
- Work OS launch/idempotency/stale kickoff behavior
- Runtime dispatch policy and budget reservations
- Skill/agency/media routing
- Media execution and completion
- Recovery from budget/media/pipeline blockers
- Managed media token security
- Dry-run of the storyboard-to-video media pipeline through clip queueing, final composition, media probe, final semantic review, canonical evidence registration, and run completion
- Deployment readiness checks for runtime URLs, internal media token, media providers/models, active async pipeline state, and missing pipeline state blockers
- Automated regression coverage for the readiness preflight itself, including sandbox DB downgrade, missing token failure, active pipeline warning, and missing pipeline state failure
- Standalone readiness command loads the app environment before resolving runtime config, DB, storage, and media provider state
- Pipeline concurrency lock, tenant-scope guard, final-review auto-repair, worker/public-URL production readiness, unified media budget estimator, and capability-grounded planning metadata
- Completion handoff: linked Work Request/Case state moves to completed, the requester receives an in-app notification, and the action URL opens the highlighted request/result in My Requests
- Result closure readiness: final-result table, artifact evidence table, notification table, and production-safe public result URL are checked before release
- Managed media storage readiness and completion-notification payload regression coverage

## Full Regression Attempt

Run:

```bash
npm --prefix apps/web test
```

If this fails:

- Classify failures as in-scope or unrelated.
- Fix in-scope failures.
- Record unrelated failures with file names and representative error.

## Manual E2E Checklist

When dev server, DB, media providers, and credentials are available:

1. Start Work Request with a simple document objective.
2. Confirm Team room appears.
3. Confirm My Requests shows room/run/work item.
4. Start Work Request with storyboard/video objective.
5. Confirm storyboard image tasks are queued.
6. Confirm video clip tasks are queued and polled.
7. Confirm final composition starts after clips complete.
8. Confirm final review records evidence.
9. Confirm final video link opens only for the requester/session user.
10. Confirm the requester receives a completion notification and its action opens My Requests with the completed request highlighted.
11. Confirm readiness passes in the target environment without `--allow-missing-db`, including final-result, artifact-ref, notification, media provider, managed media storage, and public URL checks.

Manual E2E is required before production release, but lack of provider credentials should not block code stabilization documentation.

The automated dry-run covers the same control flow without calling external providers. `npm --prefix apps/web run verify:auto-team-work-request` is the machine-checkable provider/environment readiness layer before doing the final manual E2E.
