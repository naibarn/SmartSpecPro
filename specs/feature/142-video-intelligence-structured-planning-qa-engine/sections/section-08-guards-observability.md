<!-- SECTION: section-08-guards-observability -->

# Section 08 — Guards, Concurrency, Credit Integrity & Observability

**Feature:** 142 — Video Intelligence: Structured Planning & Deterministic QA Engine
**Depends on:** `section-07-client-surfaces` (and transitively 01–06 — every guard here asserts a property those sections created)
**Blocks:** — (final hardening pass)
**Parallelizable:** No — the guards are only meaningful once all three stages and the client surfaces exist.
**Test command:** `cd apps/web && npx vitest run`
All paths below are relative to `apps/web` unless stated otherwise.

---

## 1. What this section delivers

Sections 01–07 built the feature. This section makes its **invariants
enforceable** and its **failures visible**. Seven deliverables:

1. **Non-duplication compile guards on all three effects interfaces** —
   `VideoProjectQualityLoopEffects` (exists), `ScenePlanEffects` (section-05),
   `RepairEffects` (section-06) — unified against one canonical forbidden-member
   list so the three cannot drift apart.
2. **The scene-plan output-schema prompt-field guard**, repo-wide and recursive:
   no property name anywhere in
   `skills/video-project-scene-plan/schemas/output.schema.json` may match
   `/prompt|imagePrompt|videoPrompt|negativePrompt/i`.
3. **The no-media-generation import guard** — no Video Intelligence service
   imports a media-generation entry point.
4. **Concurrency** — `baseRevision` → `CONFLICT` at dispatch (before any write,
   any model resolve, any pricing read), and a stable `VI_REVISION_CONFLICT`
   mapping for the in-worker case.
5. **Credit-integrity assertions** — exactly one `creditTransactions` row per LLM
   attempt (authored by `callLLMStructured`, none by this feature), a real
   idempotency-key builder for any charge the feature ever makes itself, and a
   `varchar(32)`-safe trace id.
6. **`videoProjects.jobExecutor.test.ts`** — the executor
   (`server/routers/videoProjects.ts:562-587`) has **no test file today** and is
   the largest untested surface this feature touches.
7. **Observability with a real mechanism, not a requirement** — audit signals for
   stuck-`queued`, missing queue registration, structured-output failure rate and
   recommended-model revocation, aggregated by a **Virtual Admin sensor** that
   already has a scheduler, a config table and an alert path in this repo.

### 1.1 Why the observability part needs code, not a note

`spec.md` §11 names four alert signals. Three of them have **no emitter** after
sections 01–07:

| Signal | State after 01–07 | What this section adds |
|---|---|---|
| Recommended-model revocation | ✅ section-02 emits `metadata.event = "recommended_model_revoked"` | the consumer (sensor + threshold) |
| Schema-validation failure rate | ❌ `reportStructuredOutputViolation` is fire-and-forget with no audit row unless the strike *revokes* | emit `structured_output_violation` on **every** report |
| Jobs stuck in `queued` > 15 min | ❌ the orphan sweep heals them silently | the sweep reports its findings as an audit event |
| Absence of the queue-registration log at boot | ❌ a `console.log` line only — nothing can key on an absence | registration state + a boot self-check that emits `queue_registration_missing` |

`queueHealthMonitor.ts` is **not** the right home: it `LLEN`s Celery list queues
and knows nothing about BullMQ or the Redis-JSON VI job records. The
`virtualAdmin` sensor framework (`services/virtualAdmin/sensorRegistry.ts`,
`sensors/*.ts`, per-tenant config in `virtual_admin_sensor_config`) is the
established in-repo mechanism and is what this section uses.

---

## 2. Interfaces this section consumes (do not re-implement)

### 2.1 From section-01 — `server/services/videoIntelligenceJobs.ts`

```ts
export const VIDEO_INTELLIGENCE_JOB_ORPHAN_TTL_MS: number;        // 15 min
export const VIDEO_INTELLIGENCE_JOB_SWEEP_INTERVAL_MS: number;    // 5 min
export async function initVideoIntelligenceJobsQueue(deps?): Promise<void>;
export async function sweepOrphanedVideoIntelligenceJobs(deps?)
  : Promise<{ requeued: string[]; failed: string[] }>;            // extended additively in §6.5
```

The startup log line `[video_intelligence_jobs] queue + worker registered`
already exists (section-01 §3.5). This section adds the machine-readable twin.

### 2.2 From section-02 — `server/services/videoIntelligenceModelResolver.ts`

```ts
export function reportStructuredOutputViolation(
  args: { modelId: string | null; traceId: string; zodIssuePaths: string[]; stage?: string },
  dependencies?: Partial<VideoIntelligenceModelResolverDeps>,
): void;
```

Its audit contract — `eventType: "video_project_stage"` +
`metadata.event = "recommended_model_revoked"` — is the alert key. This section
**consumes** it and adds one sibling event; it does not rename either string.

### 2.3 From section-04 — `server/routers/videoProjects.ts`

```ts
async function dispatchStageJob(args: {
  auth: ProjectAuthScope; projectId: number;
  stage: VideoIntelligenceStage; kind: VideoIntelligenceJobKind;
  nextStatus: string; extraInput?: Record<string, unknown>;
}): Promise<{ jobId: string; traceId: string; estimate: StageEstimate }>;

async function withStageStatusRestore<T>(payload, auth, run): Promise<T>;
```

Section-04 threads `baseRevision` into the job payload but explicitly defers the
stale check: *"Section-08 owns the stale-`baseRevision` → `CONFLICT` rule."* That
check is §6.3 here.

### 2.4 Pre-existing platform code

| Symbol | Module | Use |
|---|---|---|
| `VideoProjectRevisionConflictError` | `server/services/videoProjectRepo.ts` | already mapped to `TRPCError CONFLICT` at `videoProjects.ts:798-799` and `:954-955` — reuse those exact paths |
| `auditLogger.log` | `server/services/auditLogger.ts` | `video_project_stage` events, `as AuditEventType` cast |
| `clampCreditTraceId` | `server/services/creditService.ts` | the `varchar(32)` protection this section wraps |
| `Sensor`, `SensorReading` | `server/services/virtualAdmin/types.ts` | `{ id, name, defaultIntervalMs, category, collect() }` → `{ sensorId, timestamp, status, metrics, message }` |
| `registerSensor` + the dynamic-import list | `server/services/virtualAdmin/sensorRegistry.ts:88-102` | where a new sensor is wired |
| `AssertNever<T extends never> = T` | `server/services/videoProjectQualityLoop.ts:77` | the existing compile-guard idiom |

---

## 3. Files created / modified

```
apps/web/
  shared/videoIntelligence/
    effectGuards.ts                                  NEW      canonical forbidden-member list + shared assertion helper
  server/services/
    videoIntelligenceObservability.ts                NEW      registration state, boot self-check, audit signals, health rollup
    videoIntelligenceCreditGuards.ts                 NEW      idempotency key + varchar(32)-safe trace id + metadata builder
    videoIntelligenceJobs.ts                         CHANGED  (additive) mark registration; report sweep findings; `stuckQueued` in the sweep result
    videoIntelligenceModelResolver.ts                CHANGED  (additive) emit `structured_output_violation` on every strike report
    videoProjectQualityLoop.ts                       CHANGED  (1 line) re-express the guard via the shared helper — exported alias name unchanged
    videoProjectScenePlanner.ts                      CHANGED  (1 line) same
    videoProjectRepairApplier.ts                     CHANGED  (1 line) same
    virtualAdmin/sensors/videoIntelligenceHealth.ts  NEW      the sensor that consumes the signals
    virtualAdmin/sensorRegistry.ts                   CHANGED  one entry in the dynamic-import list
  server/routers/
    videoProjects.ts                                 CHANGED  baseRevision -> CONFLICT at dispatch; VI_REVISION_CONFLICT in-worker

  # tests
  server/__tests__/videoIntelligenceNonDuplicationGuards.test.ts        NEW  fs guards (§5.3)
  server/routers/__tests__/videoProjects.jobExecutor.test.ts            NEW  the untested surface (§5.2)
  server/routers/__tests__/videoProjects.stages.test.ts                 EXTEND  concurrency + credit-integrity blocks (§5.4, §5.5)
  server/services/__tests__/videoIntelligenceObservability.test.ts      NEW  (§5.6)
  server/services/__tests__/videoIntelligenceCreditGuards.test.ts       NEW  pure (§5.5)
  server/services/virtualAdmin/__tests__/sensors/videoIntelligenceHealth.test.ts  NEW  (§5.7)
```

No database change. No migration. No document-schema change. No new dependency.

> **Why concurrency and credit integrity EXTEND `videoProjects.stages.test.ts`
> instead of getting their own files:** the router mock header is 20 modules
> (`videoProjects.render.test.ts:11-160`), and a `vi.mock` factory that misses one
> export breaks the *import*, not just an assertion. Duplicating that header twice
> more is the single most likely way to lose half a day here.
> `videoProjects.jobExecutor.test.ts` is a separate file because
> `claude-plan.md` §3.2 names it and it exercises a different entry point.

---

## 4. Contracts introduced by this section

### 4.1 `shared/videoIntelligence/effectGuards.ts` (NEW — type-level + one const)

```ts
/** The canonical set of member names that must NEVER appear on a Video
 *  Intelligence effects interface. Video Intelligence plans STRUCTURE and edits
 *  JSON; it never generates pixels or audio and never renders (spec §2.3).
 *  Exported as a runtime array so the fs guard test can prove every interface
 *  covers the full list rather than a stale subset. */
export const MEDIA_GENERATION_EFFECT_MEMBER_NAMES = [
  "render", "renderVideo", "queueRender",
  "generateImage", "generateVideo", "generateAudio", "generateMedia",
  "synthesizeSpeech", "runFfmpeg",
] as const;

export type MediaGenerationEffectMemberName =
  (typeof MEDIA_GENERATION_EFFECT_MEMBER_NAMES)[number];

type AssertNever<T extends never> = T;

/** Compile-time assertion helper. Instantiate once per effects interface:
 *
 *    export type AssertScenePlanHasNoMediaGeneration =
 *      AssertNoMediaGenerationEffects<ScenePlanEffects>;
 *
 *  Adding a forbidden member makes the Extract non-`never`, the `T extends never`
 *  constraint fails, and `pnpm check` fails on that file. Type-only, zero runtime
 *  cost. */
export type AssertNoMediaGenerationEffects<TEffects> =
  AssertNever<Extract<keyof TEffects, MediaGenerationEffectMemberName>>;
```

Each of the three interfaces keeps its **existing exported alias name** —
`AssertNoMediaGenerationEffectMember`, `AssertScenePlanHasNoMediaGeneration`,
`AssertNoMediaGenerationRepairEffectMember` — and only changes its right-hand side
to `AssertNoMediaGenerationEffects<…>`. Renaming them would break the fs guard and
the section-04/05/06 traps that reference them by name.

### 4.2 `server/services/videoIntelligenceCreditGuards.ts` (NEW, pure)

The feature charges nothing today (AD-7). These exist so that the *first* charge
anyone ever adds is correct by construction, and so the two rules are testable
today instead of being vacuous comments.

```ts
/** Max length of creditTransactions.traceId. The column is varchar(32); a longer
 *  id previously caused a 22001 that killed a live render (spec §9.4 rule 6). */
export const CREDIT_TRACE_ID_MAX_LENGTH = 32;

/** `vi:<jobId>:<stage>` — BullMQ can redeliver a succeeded job, and deductCredits
 *  returns the ORIGINAL transaction for a repeated key instead of charging twice
 *  (spec §9.4 rule 5). Throws on a blank jobId/stage: a silently-empty key would
 *  make every charge collide. */
export function buildVideoIntelligenceIdempotencyKey(
  jobId: string,
  stage: VideoIntelligenceStage,
): string;

/** Everything a future credit call needs, shaped so the varchar(32) column can
 *  never overflow: `traceId` is clamped, and ALL rich context goes to `metadata`,
 *  which is unbounded JSON.
 *  🔴 Secret-safety: `metadata` carries ids, stage names, model NAMES and numbers
 *  only — never prompt text, never catalog credentials, never decrypted values. */
export function buildVideoIntelligenceCreditContext(args: {
  jobId: string;
  stage: VideoIntelligenceStage;
  traceId: string;
  projectId: number;
  modelId: string | null;
}): {
  idempotencyKey: string;
  traceId: string;                       // length <= CREDIT_TRACE_ID_MAX_LENGTH
  metadata: Record<string, unknown>;
};
```

### 4.3 `server/services/videoIntelligenceObservability.ts` (NEW)

```ts
/** All four VI observability signals ride ONE audit event type so a single query
 *  covers them: eventType "video_project_stage", discriminated by metadata.event.
 *  These strings ARE the alert contract — renaming one breaks the sensor and any
 *  dashboard query keyed on it. */
export const VI_OBSERVABILITY_EVENTS = {
  queueRegistered: "queue_registered",
  queueRegistrationMissing: "queue_registration_missing",
  stageJobStuckQueued: "stage_job_stuck_queued",
  structuredOutputViolation: "structured_output_violation",
  /** Owned by section-02; listed here so the alert contract lives in one place. */
  recommendedModelRevoked: "recommended_model_revoked",
} as const;

/** How long after process start the self-check runs. If registration has not been
 *  marked by then, the ABSENCE of the boot log becomes a positive audit event an
 *  alert can key on (spec §11, last row). */
export const VI_REGISTRATION_CHECK_DELAY_MS = 60_000;

/** Called by videoIntelligenceJobs.ts at the same point it logs
 *  "[video_intelligence_jobs] queue + worker registered". Emits `queue_registered`
 *  and disarms the self-check. Never throws. */
export function markVideoIntelligenceQueueRegistered(detail?: { workerConcurrency?: number }): void;

/** Arms the one-shot self-check. Called from init BEFORE the BullMQ try/catch, for
 *  the same reason section-01 arms the sweep there: it matters most when BullMQ is
 *  broken. The timer is `.unref()`ed so it never holds the process (or a test) open. */
export function armVideoIntelligenceRegistrationCheck(deps?: { now?: () => number }): void;
export function clearVideoIntelligenceRegistrationCheck(): void;

/** Reported by the orphan sweep once per tick. Emits `stage_job_stuck_queued` ONLY
 *  when `stuckQueued` is non-empty — a clean sweep must generate no alert noise. */
export function reportVideoIntelligenceSweepFindings(findings: {
  requeued: string[]; failed: string[]; stuckQueued: string[];
}): void;

/** Emitted for EVERY structured-output contract failure, revoked or not — this is
 *  the numerator of the schema-failure-rate alert (spec §11 row 3). Distinct from
 *  section-02's `recommended_model_revoked`, which stays revocation-only. */
export function reportVideoIntelligenceSchemaFailure(args: {
  stage: string; modelId: string | null; traceId: string; issuePathCount: number;
}): void;

/** In-process rollup the sensor reads. Bounded, allocation-light: counters and a
 *  fixed-size ring of recent timestamps, never a growing array of events. */
export function getVideoIntelligenceObservabilityState(): {
  queueRegistered: boolean;
  registeredAt: string | null;
  registrationCheckFired: boolean;
  stuckQueuedJobIds: string[];       // from the most recent sweep
  lastSweepAt: string | null;
  schemaFailuresLast15Min: number;
  stageRunsLast15Min: number;        // denominator for the rate
  lastRevokedModelId: string | null;
  lastRevokedAt: string | null;
};

/** Counts a stage run so the schema-failure RATE has an honest denominator.
 *  Called from the executor's finish path (both success and failure). */
export function recordVideoIntelligenceStageRun(stage: string): void;
```

**Every exported function swallows its own errors.** Observability must never be
able to fail a stage — the recorded failure mode elsewhere in this repo is a
reporting call throwing inside a `catch` block and masking the real error.

### 4.4 The sensor — `virtualAdmin/sensors/videoIntelligenceHealth.ts` (NEW)

```ts
/** Video Intelligence health. Consumes the §4.3 rollup plus a bounded tail of
 *  today's audit JSONL (the errorSpike sensor's precedent), so a signal emitted by
 *  a different process still counts. Never throws — returns status "unknown". */
const videoIntelligenceHealthSensor: Sensor = {
  id: "video_intelligence_health",
  name: "Video Intelligence Stages",
  defaultIntervalMs: 300_000,
  category: "system",
  async collect(): Promise<SensorReading> { /* … */ },
};
export default videoIntelligenceHealthSensor;
```

Thresholds — the spec §11 table, made executable:

| Condition | `status` | Rationale |
|---|---|---|
| `queueRegistered === false` **and** the self-check has fired | `critical` | this is the G1 regression: every stage strands at `queued` |
| any `stuckQueuedJobIds.length > 0` | `critical` | a job `queued` past the 15-minute TTL |
| `schemaFailuresLast15Min / stageRunsLast15Min > 0.10` (min 5 runs) | `degraded` | weak-model JSON mangling |
| a `recommended_model_revoked` event within 24 h | `degraded` | the pool is shrinking and never auto-re-promotes |
| otherwise | `healthy` | |

`metrics` keys (stable — a dashboard may key on them): `queueRegistered` (0/1),
`stuckQueuedCount`, `schemaFailures15m`, `stageRuns15m`, `schemaFailureRate`,
`revocations24h`.

The minimum-run floor is deliberate: 1 failure out of 2 runs is not a 50 %
regression, and paging on it trains people to ignore the alert.

### 4.5 Error code owned by this section

| Code | Surface | Meaning |
|---|---|---|
| `VI_REVISION_CONFLICT` | job record `error` (in-worker) | `saveVideoProjectDocument` rejected a stale `baseRevision` while a stage job was executing |

At **dispatch** the existing tRPC `CONFLICT` code is used verbatim — no new code
there.

`VI_REVISION_CONFLICT` is a deliberate addition beyond `spec.md` §8.1's registry,
with a one-line justification: a worker has no tRPC error codes, and section-07's
FE03 allowlist renders only `VI_`-prefixed strings verbatim. Without the prefix
the user would see the generic fallback for a condition that has a precise,
actionable meaning ("reload — the document changed"). Add a copy key
(`revisionConflict`) alongside section-07's planner-code copy.

---

## 5. Tests first (TDD)

Node environment except where noted. Run from `apps/web`.

**Baseline discipline:** record the failing-set **identity** before starting and
compare identity, not counts.

### 5.1 Conventions that make these tests look native

- **fs guards** (§5.3) read source **off disk** with `fs.readFileSync`, mock
  nothing, and count **real invocations / real import specifiers** — never bare
  mentions. Direct precedent:
  `server/__tests__/verticalDramaEpisodeStageJobsWiring.test.ts`.
- **Anchoring is mandatory.** Every "X is absent" assertion must be paired with a
  non-vacuity assertion that the file set / key list it scanned is non-empty and
  contains a known member.
- **Router tests** replace the whole tRPC layer: `.mutation(fn)` / `.query(fn)`
  return `fn`, so `videoProjectsRouter.runQualityReview` **is** the handler. No
  `createCaller`. Zod `.input()` is identity → input validation is not testable
  here; pass valid objects.
- Use `mockResolvedValue` / `mockReturnValue` (persistent), **never `…Once`** —
  `vi.clearAllMocks()` does not drain a leaked `…Once` queue.
- The audit mock must be the **hoisted** form so `auditLogger.log` is assertable;
  keep `createTrace: vi.fn(() => "trace-1")`.

### 5.2 `server/routers/__tests__/videoProjects.jobExecutor.test.ts` (NEW)

The executor at `videoProjects.ts:562-587` has no test today. Copy the
`videoProjects.render.test.ts` mock header, then add the section-03/05/06 service
modules so each stage can be stubbed at the service boundary.

```ts
describe("runVideoIntelligenceJobExecutor", () => {
  it("routes kind 'scene_plan' to the scene-plan stage");
  it("routes kind 'quality_review' to the quality-review stage");
  it("routes kind 'quality_repair' to the quality-repair stage");
  it("treats kind 'narration' as a documented no-op and emits narration_noop");
  it("throws a greppable error for an unknown kind");
  it("builds the ProjectAuthScope from the payload's tenantId and userId, not from ctx");

  it("returns a JSON-serialisable result for every kind");   // JSON.parse(JSON.stringify(r)) deep-equal
  it("returns a result carrying creditsUsed and modelId");
  it("emits onProgress at each stage boundary, in order");
  it("lets a thrown stage error reject — runVideoIntelligenceJob turns it into record.error");
  it("does not swallow an error into a successful-looking result");
  it("records a stage run for the schema-failure-rate denominator on BOTH success and failure");
});
```

The serialisability test is not ceremony: the result round-trips through Redis, so
a `Date`, a `Map`, or an `Error` in the payload becomes silent data loss the UI
sees as a missing field.

### 5.3 `server/__tests__/videoIntelligenceNonDuplicationGuards.test.ts` (NEW)

The normative §2.3 guards, all fs-based, zero mocks.

```ts
describe("effects interfaces cannot gain a media-generation member", () => {
  it("VideoProjectQualityLoopEffects declares a media-generation compile assertion");
  it("ScenePlanEffects declares a media-generation compile assertion");
  it("RepairEffects declares a media-generation compile assertion");
  it("each assertion covers the FULL canonical member list, not a stale subset");
  it("MEDIA_GENERATION_EFFECT_MEMBER_NAMES is non-empty and includes generateImage"); // non-vacuity
  it("no effects interface actually declares one of the forbidden members");
});

describe("no Video Intelligence service imports a media-generation entry point", () => {
  it("scans a NON-EMPTY set that includes the planner, the applier and the loop"); // non-vacuity anchor
  it("no scanned file imports mediaGenerationService / mcpMediaAdapter / hermesMediaAdapter");
  it("no scanned file imports a render-queue or ffmpeg entry point");
  it("matches IMPORT SPECIFIERS only, so a docstring mentioning the ban does not fail");
  it("no Video Intelligence service imports deductCredits or deductCreditsForModel");
});

describe("scene-plan skill output schema plans structure, never pixels", () => {
  it("has NO property name matching /prompt|imagePrompt|videoPrompt|negativePrompt/i, recursively");
  it("walks properties, items, $defs, definitions, oneOf/anyOf/allOf");   // no shallow check
  it("finds a planted forbidden key in a fixture object");                 // the walker itself is tested
});

describe("nothing is left un-wired", () => {
  it("no source file contains VI_SCENE_PLAN_NOT_WIRED / VI_QUALITY_REVIEW_NOT_WIRED / VI_QUALITY_REPAIR_NOT_WIRED");
  it("NotWiredJobCard.tsx and NotWiredJobCard.test.tsx no longer exist");
});
```

⚠️ **A type-level guard cannot be asserted at runtime.** These tests prove the
assertion is *declared and complete*; the actual enforcement is `tsc`. The manual
gate that proves enforcement end-to-end is §7 and must be performed once.

### 5.4 `videoProjects.stages.test.ts` — EXTEND with `describe("concurrency (baseRevision)")`

```ts
it("throws CONFLICT when input.baseRevision is older than the project revision");
it("writes NOTHING on a stale baseRevision — no status stamp, no job record, no enqueue");
it("does not resolve a model or price an estimate on a stale baseRevision");   // fail cheapest, first
it("accepts a matching baseRevision");
it("accepts an omitted baseRevision and pins the current revision into the payload");
it("applies the same rule to all three stage mutations");
it("maps an in-worker VideoProjectRevisionConflictError to a VI_REVISION_CONFLICT job error");
it("restores previousStatus when the in-worker save conflicts");
```

The client-side half — *"the workspace does not dispatch a stage while it holds
unsaved changes"* — belongs to **section-07 §5.6** and must not be duplicated
here. If that assertion is missing when this section starts, add it there.

### 5.5 Credit integrity

**`server/services/__tests__/videoIntelligenceCreditGuards.test.ts` (NEW, pure)**

```ts
describe("buildVideoIntelligenceIdempotencyKey", () => {
  it("formats vi:<jobId>:<stage>");
  it("is stable for the same job and stage");
  it("differs across stages of the same job");
  it("throws on a blank jobId or stage instead of emitting a colliding key");
});

describe("buildVideoIntelligenceCreditContext", () => {
  it("never returns a traceId longer than 32 characters");          // the varchar(32) lock
  it("keeps a short traceId byte-identical");
  it("puts jobId, projectId, stage and modelId in metadata, not in traceId");
  it("carries no prompt text and no credential-shaped value in metadata");
});
```

**`videoProjects.stages.test.ts` — EXTEND with `describe("credit integrity")`**

```ts
it("makes ZERO deductCredits calls across dispatch and execution for all three stages");
it("reports creditsUsed from the LLM result without charging it");
it("uses hasEnoughCredits as a READ-ONLY pre-check — no reservation, no charge");
```

The source-level half lives in §5.3's guards file, because a spy assertion alone
is vacuous when the module is not even imported.

### 5.6 `server/services/__tests__/videoIntelligenceObservability.test.ts` (NEW)

Injected `logAudit` double + fake timers; zero module mocks beyond the audit seam.

```ts
describe("queue registration signal", () => {
  it("emits queue_registered when registration is marked");
  it("emits queue_registration_missing when the self-check fires unmarked");
  it("emits NOTHING when registration is marked before the self-check delay");
  it("unrefs the self-check timer so it never holds the process open");
  it("clearVideoIntelligenceRegistrationCheck disarms it");
});

describe("sweep findings", () => {
  it("emits stage_job_stuck_queued with the job ids when stuckQueued is non-empty");
  it("emits NOTHING for a clean sweep");                    // no alert noise
  it("caps the reported job-id list so a mass outage cannot bloat the audit row");
});

describe("schema failure signal", () => {
  it("emits structured_output_violation for EVERY reported contract failure");
  it("counts toward schemaFailuresLast15Min");
  it("counts stage runs as the rate denominator");
  it("ages entries out of the 15-minute window");
});

describe("never breaks a stage", () => {
  it("swallows a throwing audit logger in every exported function");
  it("emits no secret-shaped value — model names, ids and numbers only");
});
```

### 5.7 `virtualAdmin/__tests__/sensors/videoIntelligenceHealth.test.ts` (NEW)

Mirror `__tests__/sensors/queueHealth.test.ts`: mock the dynamically-imported
module, assert on the returned `SensorReading`.

```ts
it("reports critical when the queue is unregistered after the self-check");
it("reports critical when any job is stuck in queued");
it("reports degraded above a 10% schema-failure rate");
it("does NOT report degraded below the minimum-run floor");     // 1-of-2 is not a 50% regression
it("reports degraded after a recommended-model revocation within 24h");
it("reports healthy on a clean rollup");
it("returns status 'unknown' instead of throwing when the rollup module fails");
it("exposes stable metric keys the dashboard can query");
```

### 5.8 `sensorRegistry` wiring

```ts
it("registers video_intelligence_health among the built-in sensors");   // add to sensorRegistry.test.ts
```

---

## 6. Implementation guidance

### 6.1 Unifying the three compile guards

Replace only the right-hand side in each file; keep the exported alias names.

```ts
// videoProjectQualityLoop.ts (replaces the local Extract at :78-91)
export type AssertNoMediaGenerationEffectMember =
  AssertNoMediaGenerationEffects<VideoProjectQualityLoopEffects>;
```

`shared/videoIntelligence/effectGuards.ts` is imported **type-only** by the server
services that need only the type; the guards test imports the runtime array.
Keeping the list in `shared/` means client-side modules can reuse it later without
a server import.

If a section shipped its guard inline and you would rather not touch it, the fs
test accepts either form — **as long as the file covers all nine names**. What is
not acceptable is a guard that lists six of them: that is the drift this
unification prevents.

### 6.2 The import guard's file set and matcher

- **File set:** `server/services/videoProject*.ts` +
  `server/services/videoIntelligence*.ts`, excluding `__tests__/`. Resolve with
  `fs.readdirSync` on the services dir and filter by prefix — deterministic, no
  glob dependency, and it automatically picks up a file a future section adds.
- **Excluded, with a comment saying why:** `server/routers/videoProjects.ts`
  legitimately imports the Lane-A render dispatch (`queueRemotionRenderVideoJob`) —
  render is a *separate, pre-existing* path this feature does not touch. Guarding
  the router would either fail on day one or force a weakened matcher. State the
  exclusion in the test file so no one "fixes" it by loosening the rule.
- **Matcher:** extract module specifiers only — `import … from "X"`,
  `import("X")`, `require("X")` — then test each specifier against the banned
  list. A raw substring search over the whole file would fail on the docstrings
  that *describe* the ban.
- **Banned specifiers:** `mediaGenerationService`, `mcpMediaAdapter`,
  `hermesMediaAdapter`, media-library write paths, anything matching
  `/remotionRenderVideo|renderQueue|ffmpeg/i`, and any
  `verticalDrama*ImageGeneration` module. Keep the list in one exported const in
  the test file with a comment per entry.

### 6.3 `baseRevision` → `CONFLICT` at dispatch

Insert **one** check into section-04's `dispatchStageJob`, immediately after the
project row is loaded and **before** the model resolve:

```
flag → auth → project/document
     → ⟵ baseRevision conflict check (THIS SECTION)
     → model resolve → estimate → credit pre-check → status stamp → enqueue
```

Placement is load-bearing. Failing here means:

- zero writes (no status stamp, no job record, no active pointer),
- zero pricing reads and zero model resolution, so a doomed request cannot consume
  the recommended-model lookup or leave a misleading estimate in a log,
- the document is byte-identical by construction — nothing had a chance to write.

Throw with the router's established shape,
`new TRPCError({ code: "CONFLICT", message: … })`, reusing the same message style
as `videoProjects.ts:798-799` so the client's existing CONFLICT banner and reload
path work with no client change.

`input.baseRevision` stays **optional**. When omitted, the current revision is
pinned into the payload (section-04 §6.5 already does this) and no conflict is
possible — an API caller that does not track revisions is not forced to.

**In-worker case.** `saveVideoProjectDocument` throws
`VideoProjectRevisionConflictError` when a human saved between dispatch and
execution. Section-05 deliberately lets it propagate. Catch it in the executor's
outermost wrapper (inside `withStageStatusRestore`, so the status is still
restored) and rethrow a plain `Error` whose message starts with
`VI_REVISION_CONFLICT:`. Do not swallow it — swallowing means the AI silently
overwrites a concurrent human edit, which is the data-loss bug spec §6.4 exists to
prevent.

### 6.4 Registration signal (`videoIntelligenceJobs.ts`, additive)

Two additions, both one line, both at points section-01 already established:

1. In `initVideoIntelligenceJobsQueue`, next to `startOrphanSweep(...)` — i.e.
   **outside** the BullMQ `try/catch` — call
   `armVideoIntelligenceRegistrationCheck()`.
2. Immediately after the existing
   `[video_intelligence_jobs] queue + worker registered` log, call
   `markVideoIntelligenceQueueRegistered({ workerConcurrency })`.

`closeVideoIntelligenceJobsQueue` calls `clearVideoIntelligenceRegistrationCheck()`
alongside its existing `sweepTimer` clear.

⚠️ **Do not change the production call to `initVideoIntelligenceJobsQueue(...)` in
`_core/index.ts`.** Section-01's wiring guard matches the literal regex
`initVideoIntelligenceJobsQueue\(\)`; passing an argument silently stops the guard
counting the call it exists to protect. Nothing here requires touching
`_core/index.ts`.

### 6.5 Sweep findings (`videoIntelligenceJobs.ts`, additive)

Extend `sweepOrphanedVideoIntelligenceJobs`'s return type **additively**:

```ts
Promise<{ requeued: string[]; failed: string[]; stuckQueued: string[] }>
```

`stuckQueued` = records observed in `queued` past
`VIDEO_INTELLIGENCE_JOB_ORPHAN_TTL_MS` during this tick — the same records the
sweep already re-enqueues, reported rather than healed silently. Existing
section-01 tests destructure only `requeued` / `failed`, so nothing breaks. Call
`reportVideoIntelligenceSweepFindings(result)` on the way out, inside the sweep's
existing never-throw envelope.

This gives the "any job `queued` > 15 min → page" signal for free: the sweep
already walks the records, so there is no second Redis scan and no new key.

### 6.6 Schema-failure signal (`videoIntelligenceModelResolver.ts`, additive)

Inside `reportStructuredOutputViolation`, before (or alongside) the fire-and-forget
strike, call
`reportVideoIntelligenceSchemaFailure({ stage, modelId, traceId, issuePathCount })`.

Keep section-02's rules intact:

- `recommended_model_revoked` still fires **only** on `revoked === true`;
- the new `structured_output_violation` fires on **every** report — that is the
  rate numerator, and a rate needs every sample;
- the whole body stays swallow-all.

Do **not** move the call into the adapters (sections 03/05/06). One choke point
means a future adapter cannot forget it.

### 6.7 The sensor

- `collect()` reads the in-process rollup **and** a bounded tail of today's audit
  JSONL (`logs/audit/audit-YYYY-MM-DD.jsonl`, last ~1000 lines, the `errorSpike`
  precedent), so a signal emitted by another web instance still counts. Missing
  file → `healthy` with zeroed metrics, never a throw.
- Register it in `sensorRegistry.ts`'s dynamic-import list (`:88-100`), following
  the existing `import("./sensors/…")` shape. Default export, id
  `video_intelligence_health`.
- Per-tenant threshold overrides come free via `virtual_admin_sensor_config` — do
  not build a second configuration mechanism.

### 6.8 Rollout and kill switches (no code, but part of this section's exit)

- Canary on **one internal tenant** using the existing
  `videoIntelligencePlatformEnabled` per-tenant flag; watch cost per stage
  (`providerUsageLog` joined on `traceId`) and the sensor's `schemaFailureRate`
  for 24 hours.
- `document.qa.maxLoops: 0` disables the repair loop **without a deploy**.
- Server changes here require `sudo systemctl restart smartspec-web.service`. The
  sensor and the registration self-check only take effect after that restart —
  verify with `journalctl -u smartspec-web.service | grep video_intelligence`.

---

## 7. The manual compile gate (perform once, record the result)

The type-level guards cannot be proven by a runtime test. Perform this once, per
interface, and note it in the PR:

1. Temporarily add `generateImage(): Promise<void>;` to `ScenePlanEffects`.
2. `cd apps/web && npx tsc --noEmit` → the file must now report a **new** error on
   the `AssertScenePlanHasNoMediaGeneration` line (identity comparison against the
   pre-existing baseline, which is large — a count comparison proves nothing).
3. Revert. Repeat for `RepairEffects` and `VideoProjectQualityLoopEffects`.

If step 2 produces no new error, the guard is decorative and the section is not
done. That is exactly the failure this gate exists to catch.

---

## 8. Traps and non-negotiables

1. 🔴 **Never weaken a guard to make it pass.** If the import guard fails, the
   import is the bug. The one legitimate exclusion (§6.2) is documented in the
   test file; any second exclusion needs the same written justification.
2. 🔴 **Anchor every absence assertion.** "No file imports X" over an empty file
   set passes forever.
3. **Do not rename the audit event strings.** They are the entire contract
   between the emitters and the sensor.
4. **Do not touch `_core/index.ts`** — section-01's wiring guard counts a literal
   `initVideoIntelligenceJobsQueue()`.
5. **Observability may never fail a stage.** Every exported function swallows its
   own errors, and the registration timer is `.unref()`ed.
6. **A clean sweep emits nothing.** Alert noise is how alerts get muted, and a
   muted stuck-`queued` alert is the exact regression this feature exists to make
   impossible.
7. **The conflict check runs before the model resolve**, so a doomed request costs
   one row read and nothing else.
8. **Never swallow `VideoProjectRevisionConflictError` in the worker** — that
   silently overwrites a concurrent human edit.
9. **`creditTransactions.traceId` is `varchar(32)`.** The feature charges nothing
   today; the builders exist so the first charge anyone adds is safe by
   construction. Rich context goes in `metadata`.
10. **Secret safety.** Audit and credit metadata carry ids, stage names, model
    *names* and numbers only — never prompt text, never catalog credentials.
11. **`RepairEffects` and `ScenePlanEffects` keep their exact member sets.** This
    section unifies the *guard*, not the interfaces.
12. **Server changes → restart.** The sensor, the registration signal and the
    conflict check are inert until the service restarts.

---

## 9. Verification

```
cd apps/web && npx vitest run server/__tests__/videoIntelligenceNonDuplicationGuards.test.ts
cd apps/web && npx vitest run server/routers/__tests__/videoProjects.jobExecutor.test.ts
cd apps/web && npx vitest run server/routers/__tests__/videoProjects.stages.test.ts
cd apps/web && npx vitest run server/services/__tests__/videoIntelligenceObservability.test.ts
cd apps/web && npx vitest run server/services/__tests__/videoIntelligenceCreditGuards.test.ts
cd apps/web && npx vitest run server/services/virtualAdmin/__tests__
cd apps/web && npx vitest run                    # full suite — compare failing-set IDENTITY
cd apps/web && npx tsc --noEmit                  # plus the §7 manual gate, three times
```

Fault-injection checks (once, on the canary, after the restart):

- Comment out the registration mark → after `VI_REGISTRATION_CHECK_DELAY_MS` a
  `queue_registration_missing` audit row exists and the sensor reads `critical`.
- Seed a `queued` job record with a 20-minute-old `updatedAt` → the next sweep
  emits `stage_job_stuck_queued` and the sensor reads `critical`.

---

## 10. Exit criteria

- `pnpm check` fails when a media-generation member is added to **any** of the
  three effects interfaces — proven once per interface by the §7 gate, with each
  guard's completeness locked by a runtime test.
- The scene-plan output schema contains no property matching
  `/prompt|imagePrompt|videoPrompt|negativePrompt/i` at any nesting depth, and the
  walker that proves it is itself tested against a planted key.
- No Video Intelligence service imports a media-generation entry point, and the
  scanned file set is provably non-empty.
- A stage call with a stale `baseRevision` fails with `CONFLICT` and leaves the
  document and revision byte-identical, with zero writes, zero model resolution
  and zero pricing reads.
- An in-worker revision conflict surfaces as a `VI_REVISION_CONFLICT` job error
  with the previous status restored — never as a silent overwrite.
- `runVideoIntelligenceJobExecutor` has a test file covering all four kinds, the
  unknown-kind path, result serialisability, `onProgress` ordering and error
  containment.
- Exactly one `creditTransactions` row exists per LLM attempt — authored by
  `callLLMStructured`, none by this feature — locked by both a spy assertion and
  an fs source guard; the idempotency-key and `varchar(32)` builders are unit
  tested.
- All four `spec.md` §11 signals have a real emitter and a real consumer: the
  stuck-`queued` and missing-registration alerts both fire under deliberate fault
  injection.
- No `VI_*_NOT_WIRED` string remains in the codebase; `NotWiredJobCard.tsx` and
  its test no longer exist.
- Full `apps/web` suite run at the section boundary; failing-set **identity**
  matches the recorded baseline plus only intentionally-changed files.
