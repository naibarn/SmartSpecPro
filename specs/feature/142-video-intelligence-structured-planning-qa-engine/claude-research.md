# Research Findings — Feature 142

**Date:** 2026-08-02
**Scope:** Codebase only (no web research — every technology is already in-repo).
**Method:** Two parallel read-only `Explore` agents over the test suite and the
credit/queue plumbing, plus direct verification of their key claims.

---

## 0. Headline: three findings that CHANGE spec v1.2.0

### F0-1 🔴 `callLLMStructured` ALREADY DEDUCTS CREDITS — spec §9.4 would double-charge

`callLLMStructured.ts:4` imports `deductCreditsForModel`, and the legacy path
deducts **per attempt** at `callLLMStructured.ts:719-737`:

```ts
const { creditsUsed } = await deductCreditsForModel({
  userId, model: effectiveModel, provider: result.providerName,
  inputTokens, outputTokens, costUsd, tenantId,
  description: billingDescription,
  metadata: { requestType: "structured_llm", structured: true, attempt: attempt + 1, ...billingMetadata },
  sourceType: "skill",
});
totalCredits += creditsUsed;
```

The returned `creditsUsed` is therefore a **report of money already spent**,
accumulated across retries — *not* an invoice to settle afterwards. All three
dispatch branches (`legacy`, `withRuntime`, `withResponsesRuntime`) either
delegate to the legacy executor or read `creditsUsed` off a runtime that billed
it itself; `skillRuntimeOrchestrator.ts` contains no `deductCredits` of its own.

**Spec v1.2.0 §9.4 rule 2 says "charge that value on job success". Doing that
is a guaranteed double-charge.** Corrected in spec v1.3.0.

*Counter-example that must not be copied:* `verticalDramaEpisodeQualityReview.ts:1296-1332`
does charge manually — but only because it uses `executeJsonPlanningCallWithRetry`,
which does no billing at all. Do not read that file as licence to bill after a
`callLLMStructured` call.

**Corollary for "no charge on failure" (§9.4 rule 3):** partly unattainable by
construction. A provider call that succeeds and *then* fails schema validation
has already been billed for that attempt (`LLMStructuredOutputError.creditsUsed`,
`callLLMStructured.ts:70`). Only failures *before* the provider responds are
free. The spec's obligation must be narrowed to "142 charges nothing of its own
on failure".

### F0-2 🟠 Active-pointer semantics are stricter and longer-lived than specified

`videoIntelligenceJobs.ts:59-60` — both `JOB_RECORD_TTL_SECONDS` and
`ACTIVE_POINTER_TTL_SECONDS` are **2 hours**, not the 3600 s stated in spec
§7.2/§9.1. The key is `vi:job:active:${tenantId}:${projectId}`
(`:148-150`) — **one live job per (tenant, project), not per kind**. Two
different stage kinds cannot run concurrently on one project.

Combined with the swallowed enqueue error (`:216-225`), today's failure mode is
worse than spec §3.2 recorded: a failed enqueue leaves a `queued` record *and*
a live pointer, making the project **un-submittable for a full 2 hours**.

### F0-3 🟢 A ready-made wiring-guard test already exists — copy it verbatim

`server/__tests__/verticalDramaEpisodeStageJobsWiring.test.ts:20-63` was written
for *precisely* this bug class (bug #127). It reads `_core/index.ts` off disk
with `fs.readFileSync` and counts real invocations:

```ts
const countCalls = (source: string, fnName: string): number =>
  (source.match(new RegExp(`${fnName}\\(\\)`, "g")) ?? []).length;

expect(countCalls(source, "initVerticalDramaEpisodeStageJobsQueue")).toBeGreaterThanOrEqual(1);
```

Spec 142's R11 guard is a substitution away. Note it lives in
`server/__tests__/`, not `server/services/__tests__/`, and uses zero mocks.

---

## 1. Credit plumbing

| Concern | Fact | Location |
|---|---|---|
| Pre-check | `hasEnoughCredits(userId, amount): Promise<boolean>` — non-atomic read, does **not** reserve | `creditService.ts:418` |
| Charge | `deductCredits(params)` — atomic `WHERE credits >= amount`; throws `Error("Insufficient credits")` / `BudgetExceededError` | `creditService.ts:453` |
| Idempotency | Redis `credit:idemp:<key>` 24 h + DB unique index; a 23505 returns the original transaction | `creditService.ts:484-495, 536-553` |
| Model-based charge | `deductCreditsForModel` → calls `deductCredits` internally | `creditService.ts:1018-1066` |
| ⚠️ `traceId` column | **`varchar(32)`** — `clampCreditTraceId` hashes longer ids. A 58-char trace once caused a `22001` that killed a marketplace final render | `creditService.ts:40-63`, `schema.ts:663-708` |

**The proven ordering (from `runNarrationStage`, `videoProjects.ts:866-975`):**
`estimate → hasEnoughCredits → do work → persist document → deductCredits`.
Nothing is charged until after the durable write, so no refund path is needed.
Zero-work early exit returns `creditsCharged: 0` without touching credits
(`:889-892`).

**Reuse rule for 142:** pre-check in the tRPC mutation *before*
`enqueueVideoIntelligenceJob`, so an unaffordable request never occupies the
queue or the 2-hour active pointer. Use `idempotencyKey: "vi:<jobId>:<stage>"`
for any charge 142 makes itself, since BullMQ can redeliver a succeeded job.

---

## 2. Job/queue plumbing

- **Executor contract** (`videoIntelligenceJobs.ts:106-109`):
  `(payload, onProgress) => Promise<unknown>`; resolved value → `record.result`,
  thrown error → `record.error`. `runVideoIntelligenceJob` **never rethrows**, so
  BullMQ always sees success.
- **Storage:** Redis JSON at `vi:job:<jobId>`, 2 h TTL — no DB table.
- **Progress:** fire-and-forget, spreads the start-of-run snapshot, so a progress
  write can never carry a terminal status.
- **Test seam:** `VideoIntelligenceJobRedisAdapter` + overridable
  `enqueueBullmqJob` (`:114-118`, `:177-180`).
- **`_core/index.ts` pattern** — every init is `await`ed inside its own
  `try/catch` that logs and continues; none is behind a feature flag. Insert
  after `initVerticalDramaEpisodeStageJobsQueue()` (`:1753`) and before
  `initWebhookApiDeliveryQueue()` (`:1760`); add `close…().catch(() => {})` to
  **both** shutdown blocks (`:2114-2119` and `:2182-2187`).

### Orphan sweep — copy `verticalDramaEpisodeStageJobs.ts`

Canonical implementation, written after runs #496/#501 were stranded by this
exact bug class:

- Exported interval constant so fake-timer tests can advance it
  (`STORYBOARD_SHOTGRID_RUN_SWEEP_INTERVAL_MS`, `:56-63`).
- `startStaleRunSweep()` armed **first, outside the BullMQ try/catch**, so it
  runs even when BullMQ init fails, and fires once immediately so pre-restart
  orphans heal now (`:178-212`, `:224-227`).
- **Fail-fast enqueue** (`:129-171`): when `queue.add` throws, the row is marked
  `failed` immediately rather than left `queued`.

`videoIntelligenceJobs.ts` currently does the opposite on all three counts.

---

## 3. Test conventions (must match exactly)

**Runner:** `vitest.config.ts:33-47` — node env, `jsdom` only for
`client/src/**/*.test.tsx`. Run from `apps/web`.

### Router tests — the whole tRPC layer is replaced

`videoProjects.crud.test.ts:13-36` mocks `../../_core/trpc` so `.mutation(fn)`
returns `fn` — **the procedure *is* the handler**. No `createCaller`, and no
JWT_SECRET stub (that belongs to other suites; do not introduce it here).

```ts
const router = videoProjectsRouter as unknown as Record<string, any>;
await router.runScenePlanStage({ ctx: ctx(), input: { projectId: 1 } });
```

Zod `.input()` is mocked to identity, so **input validation is not testable this
way** — pass already-valid objects.

The `vi.mock` factory for a module must list **every** export the router imports,
or the import breaks (not just the assertion). `videoProjects.render.test.ts:11-160`
already mocks all 20 modules — copy that header block wholesale.

### Flag-off contract

`videoProjects.crud.test.ts:437-445`. Use `mockResolvedValue` (persistent), not
`Once`, when a handler reads flags more than once. Always assert the specific
downstream mock too, not just `mockDb.select`.

### Pure services — three flavours

1. **Injected effects** — `videoProjectQualityLoop.test.ts:38-52` `makeEffects()`,
   zero `vi.mock` in the file. This is where the review/repair skill calls belong.
2. **Injected adapter** — `videoIntelligenceJobs.test.ts:33-48` fake Redis with a
   backing `Map`.
3. **Fully pure** — `validateProjectClaims.test.ts` / `videoProjectQualityMetrics.test.ts`
   import no `vi` at all and round-trip every fixture through the real
   `VideoProjectDocumentSchema` to prove validity.

### Audit assertions

Current videoProjects tests mock `auditLogger` **without a handle**, so they
cannot assert on it. Upgrade to the hoisted form
(`verticalDramaEpisodes.locationReference.test.ts:60-65`). `logStage` emits
`{ eventType: "video_project_stage", traceId, userId: null, metadata: { stage, projectId, phase, ...extra } }`
(`videoProjects.ts:236-256`). Keep `createTrace` mocked as `vi.fn(() => "trace-1")`.

### Client tests

Hand-rolled `@/lib/trpc` mock (`VideoStudioWorkspacePage.test.tsx:12-78`);
`useMutation` returns `{ mutate: (input) => mock(input, opts), isPending: false }`
so both input and callbacks are assertable. Astryx `Dialog` needs
`HTMLDialogElement.prototype.showModal/close` patched in `beforeEach`
(`CatalogCreateDialog.test.tsx:20-27`).

---

## 4. Blast radius the plan must budget for

| Item | Why it matters |
|---|---|
| `videoProjectQualityLoop.test.ts:145-160` asserts `repairStage` and `recomputeMetrics` are **never** called | Enabling the repair loop means **rewriting** these tests, not appending to them |
| `NotWiredJobCard.test.tsx` asserts a `VI_*` error-text allowlist; used by `QaPanel.tsx:63-107` and `ScenesPanel.tsx:51` | Removing the three `*_NOT_WIRED` errors is a client-side breaking change |
| `runVideoIntelligenceJobExecutor` (`videoProjects.ts:562-586`) has **no test file anywhere** | Largest untested surface 142 touches — needs a new `videoProjects.jobExecutor.test.ts` |
| `executeQualityReviewStage` already calls `compileProjectInternal` + `validateProjectClaims` + `computeQualityMetrics` before throwing | Those calls are already assertable with existing mocks — the wiring test is cheap |

---

## 5. Testing framework decision

**Existing setup — Vitest.** No new framework. New files:

| File | Kind |
|---|---|
| `server/__tests__/videoIntelligenceJobsWiring.test.ts` | fs-based wiring guard (copy VD template) |
| `server/routers/__tests__/videoProjects.stages.test.ts` | router stages (copy render-test mock header) |
| `server/routers/__tests__/videoProjects.jobExecutor.test.ts` | executor switch |
| `server/services/__tests__/videoProjectScenePlanner.test.ts` | injected-effects |
| `server/services/__tests__/videoProjectRepairApplier.test.ts` | pure + schema round-trip |
| `client/src/components/videoStudio/__tests__/QaPanel.test.tsx` | client panel |
| *(modify)* `server/services/__tests__/videoProjectQualityLoop.test.ts` | rewrite the two never-called assertions |
