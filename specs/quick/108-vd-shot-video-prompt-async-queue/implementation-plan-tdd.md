# TDD Plan

## Queue service tests first

- enqueue creates one queued record and returns an admission result;
- same idempotency key returns the same job;
- same fingerprint on an active shot joins the job;
- different fingerprint on an active shot returns conflict;
- atomic admission assigns increasing per-episode sequence values;
- worker cannot run sequence N+1 before N is terminal;
- unrelated episode scopes can run in parallel;
- enqueue failure marks the record failed;
- success/failure terminal writes clear only matching pointers;
- stale running lease does not blindly re-run the paid executor.

Use injected Redis/BullMQ/executor clocks and adapters. Do not require a live
Redis server or provider call.

## Router tests first

- submit performs ownership and fast precondition checks but does not invoke
  the executor;
- status and active-list procedures enforce tenant/user/series/episode scope;
- all executor inputs, including AI-adjust instruction and quality options,
  survive serialization into the worker payload;
- existing prompt persistence tests move behind the executor seam and remain
  green.

## Client tests first

- successful submit renders queued acknowledgement immediately;
- same-shot action is disabled while queued/running but another shot remains
  enabled;
- status polling reaches success and refreshes the episode detail;
- failed job exposes explicit retry and does not auto-submit;
- reload/resume uses active server jobs;
- deduplicated and conflict responses have distinct user-facing copy.

## Normalization tests

- booleans remain booleans;
- exact lowercase/uppercase `true`/`false` string forms normalize;
- arbitrary strings and numbers remain invalid;
- existing motion-contract output remains unchanged after normalization.

## Verification commands

```bash
cd apps/web
npm exec vitest run server/services/__tests__/verticalDramaShotVideoPromptJobs.test.ts client/src/pages/__tests__/VerticalDramaEpisodePage.shotVideoPromptQueue.test.ts
npm exec vitest run server/routers/__tests__/verticalDramaEpisodes.generateShotVideoPrompt.test.ts server/routers/__tests__/verticalDramaEpisodes.generateAndPersistSplitShotVideoPrompt.test.ts
npm run check
git diff --check
```

If the repository-wide check contains unrelated baseline diagnostics, filter
and report changed-file diagnostics separately.
