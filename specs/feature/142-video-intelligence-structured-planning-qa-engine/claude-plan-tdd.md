# TDD Plan — Feature 142

Mirrors `claude-plan.md` step by step. Every test below is written **before** the
code it describes. Stubs are signatures and intent only — no bodies.

---

## 0. Conventions that are not negotiable

Taken from `claude-research.md` §3; these are what make new tests look native.

**Runner.** Vitest. Node environment; `jsdom` only for `client/src/**/*.test.tsx`.
Run from `apps/web`.

**Router tests.** The entire tRPC layer is replaced by a mock in which
`.mutation(fn)` returns `fn` — so the exported router object's properties **are**
the handlers, called directly. There is no `createCaller`.

```ts
const router = videoProjectsRouter as unknown as Record<string, any>;
await router.runQualityReview({ ctx: ctx(), input: { projectId: 1 } });
```

Two traps:
- A `vi.mock` factory must list **every** export the router imports. A missing
  one breaks the import, not just the assertion. Copy the existing 20-module mock
  header from `videoProjects.render.test.ts` wholesale.
- Zod `.input()` is mocked to identity, so **input validation is not testable
  here**. Pass already-valid objects; validate schemas in their own unit tests.

**Flag mocks.** Use `mockResolvedValue` (persistent), not `…Once`, when a handler
reads flags more than once. Note this repo has a recorded failure class where
leaked `…Once` queues produced misleading downstream failures.

**Pure services.** Injected effect doubles, zero module mocks. Fixtures
round-trip through the real `VideoProjectDocumentSchema` so every fixture is
provably a valid document.

**Audit assertions.** The current logger mock keeps no handle and cannot be
asserted against — upgrade it to the hoisted form first.

**Baseline discipline.** This repo has a pre-existing red baseline. Record the
failing-set **identity** before starting and compare identity, not counts.

---

## 1. Step 0 — Queue registration

### 1.1 Wiring guard (`server/__tests__/videoIntelligenceJobsWiring.test.ts`)

Reads `_core/index.ts` off disk with `fs.readFileSync` and counts real
invocations — `name()` — never import mentions. No mocks at all.

```ts
describe("video intelligence jobs queue wiring in _core/index.ts", () => {
  it("imports init/close from the video intelligence jobs service");
  it("startup CALLS initVideoIntelligenceJobsQueue() — without it every stage strands at 'queued'");
  it("every shutdown block that closes the VD stage queue also closes the VI queue");
});
```

Anchor the count against an existing sibling init so the assertion cannot pass
vacuously — i.e. assert the VI count is at least the VD stage-jobs count, and
assert that sibling count is itself ≥ 1.

### 1.2 Fail-fast enqueue (`videoIntelligenceJobs.test.ts`, extend)

Uses the existing injectable fake-Redis adapter and overridable `enqueueBullmqJob`.

```ts
it("marks the record failed and throws VI_QUEUE_UNAVAILABLE when the queue add throws");
it("clears the active pointer on enqueue failure so the project is not blocked for 2h");
it("does NOT leave a 'queued' record behind after a failed enqueue");
```

The third is the regression lock for today's behaviour.

### 1.3 Orphan sweep

Fake timers, advancing by the exported interval constant.

```ts
it("resets a 'running' record older than the TTL back to 'queued' and re-enqueues once");
it("marks a twice-orphaned record 'failed' instead of re-enqueueing forever");  // poison-pill cap
it("arms the sweep even when BullMQ init throws");                              // armed outside the try/catch
it("fires one sweep immediately at init so pre-restart orphans heal now");
it("clears the timer on close");
```

---

## 2. Step 1 — Quality review

### 2.1 Model resolver (`videoIntelligenceModelResolver.test.ts`)

```ts
/** resolveStructuredStageModel(explicitPin?) */
it("returns an explicit pin unchanged");
it("ignores the '__automatic__' sentinel and resolves from the recommended set");
it("requires BOTH recommendedOnly and supportsStructuredOutputs in the candidate query");
it("throws VI_NO_RECOMMENDED_MODEL when no candidate exists — never degrades silently");

/** reportStructuredOutputViolation(...) */
it("records a contract_violation strike carrying the zod issue paths");
it("never throws, even when the breaker rejects");            // fire-and-forget
it("emits a stage audit event when the breaker reports revoked: true");
```

The last one is the A4 mechanism: the breaker itself is console-only, so the
audit event is what an alert can key on.

### 2.2 Review adapter (`videoProjects.stages.test.ts` + a focused unit)

```ts
it("passes metrics and claimValidation as FACTS and lets the skill own judgment");
it("invokes callLLMStructured with runtimeOptions.skillSlugs = ['video-project-quality-review']");
it("sets maxRetries to 2 for bounded schema retry");
it("reports creditsUsed through onUsage");
it("does NOT call deductCredits");                              // 🔴 double-charge lock
it("records a contract_violation strike on LLMStructuredOutputError, then rethrows");
it("does NOT strike on a transport/provider error");            // not the model's fault
```

`it("does NOT call deductCredits")` is the single most important assertion in
this feature — it locks the correction that `callLLMStructured` already bills.

### 2.3 Stage wiring

```ts
it("runQualityReview enqueues a job and returns { jobId, traceId }");
it("stamps status 'qa' BEFORE returning — asserted by call ordering, not final state");
it("restores the previous status when the job fails");
it("pre-checks credits and throws VI_INSUFFICIENT_CREDITS with ZERO job records written");
it("carries the dispatch-resolved model id in the job payload");   // A5
it("emits a video_project_stage audit event for both start and finish phases");
it("emits zero extra db.select when the platform flag is off");
```

The ordering assertion matters: stamping status late is the known cause of a
double-charge defect elsewhere in this codebase, and asserting only the final
state would not catch it.

### 2.4 Estimate query

```ts
it("derives perRound from the resolved model's catalog pricing and the document size");
it("never returns a hardcoded constant");                       // A1
it("returns the worst-case ceiling (1 review + 3 repair + 1 re-review) × maxLoops");
it("returns the same model id that dispatch will carry into the job");
```

### 2.5 Ledger persistence

```ts
it("appends a QaLedgerEntry to video_projects.qaLedger");
it("records the document revision the review judged");          // enables the A2 guard
it("writes NO review payload into video_project_revisions");
```

---

## 3. Step 2 — Scene plan

### 3.1 Planner (`videoProjectScenePlanner.test.ts`) — injected effects, no module mocks

```ts
it("produces a document whose scenes carry real templateIds and bound params");

// fail-closed, validated across ALL scenes before ANY write
it("rejects an unknown templateId with VI_PLAN_TEMPLATE_UNKNOWN");
it("rejects params that fail the template's own Zod schema with VI_PLAN_PARAMS_INVALID");
it("leaves the document BYTE-IDENTICAL when the 3rd of 5 scenes is invalid");  // partial-write lock

// R1 — layer budget
it("rejects a plan whose MERGED layer count exceeds 40 with VI_PLAN_LAYER_BUDGET_EXCEEDED");
it("counts layers already present in the document, not just newly planned ones");   // A3
it("passes the remaining layer budget INTO the skill input as a fact");

// R2 — timeline invariants
it("rejects endMs <= startMs with VI_PLAN_TIMELINE_INVALID");
it("rejects overlapping scenes when sorted by startMs");
it("rejects max(endMs) > format.durationMs");
it("rejects a fill_empty plan that collides with an EXISTING scene's time range");   // A3
it("permits gaps but reports them, and flags a gap over 1000ms");

// re-run semantics
it("fill_empty does not overwrite scenes that already have layers");
it("replace re-plans every scene");
it("appends a revision row with reason 'scene_plan' in both modes");
```

### 3.2 Skill contract

```ts
it("round-trips ScenePlanSkillOutput against schemas/output.schema.json");
it("output schema has NO field matching /prompt|imagePrompt|videoPrompt|negativePrompt/i");
```

The second is a normative non-duplication guard, not a style check: Video
Intelligence plans structure, never pixels.

---

## 4. Step 3 — Repair loop

### 4.1 Applier (`videoProjectRepairApplier.test.ts`)

```ts
// zero-cost handlers
it("captions: splits a cue that exceeds the chars-per-second ceiling");
it("scenes: adjusts boundaries for duration-vs-narration fit");
it("motion: adjusts intensity/camera");
it("makes ZERO LLM calls for captions/scenes/motion repairs");     // the economic claim, locked

// LLM-backed handlers
it("narration/content/claims call rewriteForStage exactly once each");

// safety
it("claims repairs may only REMOVE or RE-SOURCE a statement, never invent a backing claim");
it("rolls back any repair that worsens blocksFinalRender and reports it in rolledBack");
it("re-parses the document against the schema after every handler");

// A2 — idempotency
it("refuses a review whose recorded revision != the document's current revision (VI_REPAIR_STALE_REVIEW)");
it("is a safe no-op on redelivery — repairs are not applied twice");
```

### 4.2 Loop (`videoProjectQualityLoop.test.ts`) — ⚠️ REWRITE, not append

Two existing tests assert `repairStage` and `recomputeMetrics` are **never**
called, encoding the single-round MVP. Enabling the bounded loop makes them
false by design. Rewrite them; do not treat their failure as a regression.

```ts
it("runs review → repair → recompute → re-review up to maxLoops");
it("stops early once score >= targetScore");
it("keeps the best-scoring round as bestReview");
it("runs exactly one round when maxLoops is 0 or 1");            // preserved behaviour
it("appends one revision row per repair round");
```

---

## 5. Step 4 — Client

`QaPanel.test.tsx` (new) and the existing workspace test, using the hand-rolled
trpc mock. Astryx dialogs need `HTMLDialogElement.prototype.showModal/close`
patched in `beforeEach`.

```ts
it("renders score, per-dimension scorecard and issues grouped by severity");
it("shows the estimate dialog and does NOT run the stage until confirmed");   // D4
it("renders a claim-compliance block as a distinct error banner, not an opinion");
it("marks a review STALE when the document changed since it was produced");
it("reports actual credits from the job record after a run");
it("does not imply a failed stage was free");                                  // §9.4 rule 4
it("offers one-click revert per repair round");                                // D1 safety net
it("requires a confirmation for the destructive 'replace' re-run mode");
it("renders every state: loading, empty, success, error, unsaved-changes, stale");
```

Deletion coverage: `NotWiredJobCard.test.tsx` is removed along with the
component. Its `VI_*` allowlist assertions become meaningless once no
`*_NOT_WIRED` error can be produced.

---

## 6. Step 5 — Cross-cutting

### 6.1 Job executor (`videoProjects.jobExecutor.test.ts`) — new surface

`runVideoIntelligenceJobExecutor` has **no test file today** and is the largest
untested surface this feature touches.

```ts
it("routes scene_plan / quality_review / quality_repair to their services");
it("returns a serialisable result that includes creditsUsed and modelId");
it("lets a thrown error become record.error rather than escaping the worker");
it("emits onProgress at each stage boundary");
```

### 6.2 Concurrency

```ts
it("fails with CONFLICT on a stale baseRevision and leaves the document byte-identical");
it("the workspace does not dispatch a stage while it holds unsaved changes");
```

### 6.3 Non-duplication guards (compile-time + runtime)

```ts
it("pnpm check fails if a media-generation member is added to VideoProjectQualityLoopEffects");
it("pnpm check fails if a media-generation member is added to ScenePlanEffects or RepairEffects");
it("no Video Intelligence service imports a media-generation entry point");
```

The first two are type-level assertions verified by a compile run, not runtime
expectations.

### 6.4 Credit integrity (end-to-end)

```ts
it("writes exactly ONE creditTransactions row per LLM attempt — authored by callLLMStructured, none by us");
it("passes idempotencyKey 'vi:<jobId>:<stage>' for any charge the feature makes itself");
it("never passes a traceId longer than 32 chars into a credit transaction");
```

The last one guards a `varchar(32)` column that has previously caused a database
error which killed a live render.

---

## 7. Execution order

TDD order follows the plan's step order, because each step's tests are green
before the next begins:

1. `videoIntelligenceJobsWiring` → fail-fast enqueue → orphan sweep
2. model resolver → review adapter → stage wiring → estimate → ledger
3. planner validation (all four gates) → skill contract
4. repair applier → loop rewrite
5. client panels
6. executor → concurrency → guards → credit integrity

Run the full `apps/web` suite at each step boundary and compare the failing-set
**identity** against the recorded baseline.
