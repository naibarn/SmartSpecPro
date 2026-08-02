<!-- SECTION: section-01-queue-registration -->

# Section 01 — Queue Registration, Fail-Fast Enqueue & Orphan Sweep

**Feature:** 142 — Video Intelligence: Structured Planning & Deterministic QA Engine
**Plan reference:** `claude-plan.md` §4 (Step 0), `claude-plan-tdd.md` §1, `spec.md` §8.3 / §12.1 / §12.5, `claude-research.md` §0 F0-2 / F0-3 and §2.
**Depends on:** nothing. **Blocks:** section-03 (review adapter), section-04 (stage wiring).
**Parallelizable with:** section-02 (model resolver).
**Runtime:** TypeScript / pnpm. **Test command:** `cd apps/web && npx vitest run`.
All paths below are relative to `apps/web` unless stated otherwise.

---

## 1. Why this section exists

Video Studio (Feature 133) dispatches three AI stages — scene plan, quality
review, quality repair — through a BullMQ queue named `video_intelligence_jobs`.
The queue module (`server/services/videoIntelligenceJobs.ts`) is complete:
enqueue, dedupe, Redis-JSON job records, status reads, worker body, executor
contract. Everything is there **except the startup call**.

`initVideoIntelligenceJobsQueue()` has **zero callers** in `server/_core/index.ts`.
Consequences, in order of severity:

1. `defaultEnqueueBullmqJob` throws `"video_intelligence_jobs queue is not
   initialized"` on every submit.
2. `enqueueVideoIntelligenceJob` **swallows** that throw
   (`videoIntelligenceJobs.ts:218-225`, `debugError` then `return`), so the
   mutation returns a `{ jobId }` for a job that will never run.
3. The Redis record stays `status: "queued"` for its full **2-hour** TTL and the
   per-project active pointer `vi:job:active:<tenantId>:<projectId>` stays live
   for **2 hours** too (`JOB_RECORD_TTL_SECONDS` / `ACTIVE_POINTER_TTL_SECONDS`,
   both `2 * 60 * 60`).
   The pointer is per **(tenant, project)**, *not* per kind, so one failed
   attempt makes that project un-submittable by **any** stage for two hours.
4. The client polls `getGenerationJobStatus` forever and spins.

This is the "taught-but-not-wired" failure class, and it has already been paid
for once in this repo: the identical bug stranded vertical-drama runs #496/#501,
which is why `verticalDramaEpisodeStageJobs.ts` and its fs-based wiring guard
exist. This section copies that hardening wholesale.

**This section alone converts an infinite spinner into a real terminal state.**
It is independently shippable and worth landing before anything else.

---

## 2. Deliverables

| File | Action |
|---|---|
| `server/_core/index.ts` | CHANGED — import + one `await`ed init call + close in **both** shutdown blocks |
| `server/services/videoIntelligenceJobs.ts` | CHANGED — fail-fast enqueue, orphan sweep, sweep timer lifecycle, BullMQ custom job id |
| `server/__tests__/videoIntelligenceJobsWiring.test.ts` | NEW — fs-based wiring guard |
| `server/services/__tests__/videoIntelligenceJobs.test.ts` | EXTENDED — fail-fast + sweep suites (no existing test is rewritten) |

**Out of scope:** the router-side status-restore-on-failure, the credit
pre-check, and replacing the `VI_*_NOT_WIRED` throws — all owned by section-04.
This section only guarantees that a dispatched job reaches a terminal state.

---

## 3. Contract introduced by this section

### 3.1 Error code

| Code | Surface | Meaning |
|---|---|---|
| `VI_QUEUE_UNAVAILABLE` | thrown by `enqueueVideoIntelligenceJob`; written into `record.error` by the sweep | The BullMQ enqueue failed, or a job was orphaned past its recovery budget |

Thrown as `TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "VI_QUEUE_UNAVAILABLE: …" })`
per `spec.md` §12.1. Throwing `TRPCError` from a service is an established
pattern here. Tests assert on `/VI_QUEUE_UNAVAILABLE/`, never on exact prose.

### 3.2 New exported constants (exported so fake-timer tests can advance them)

```ts
/** How often the orphan sweep fires. Mirrors
 *  STORYBOARD_SHOTGRID_RUN_SWEEP_INTERVAL_MS (verticalDramaEpisodeStageJobs.ts). */
export const VIDEO_INTELLIGENCE_JOB_SWEEP_INTERVAL_MS = 5 * 60 * 1000;

/** A record whose `updatedAt` is older than this is considered orphaned
 *  (spec §12.5: 15 min here, 30 min for the VD equivalent). */
export const VIDEO_INTELLIGENCE_JOB_ORPHAN_TTL_MS = 15 * 60 * 1000;

/** Poison-pill cap: how many times one job may be recovered before it is
 *  marked `failed`. MANDATORY — without it a job that reliably kills its
 *  worker is re-enqueued forever. */
export const VIDEO_INTELLIGENCE_JOB_MAX_ORPHAN_RECOVERIES = 1;
```

### 3.3 Additive record field

```ts
export interface VideoIntelligenceJobRecord extends VideoIntelligenceJobPayload {
  // …existing fields unchanged…
  /** How many times the orphan sweep has recovered this job. OPTIONAL on
   *  purpose: records already in Redis when this deploys were written without
   *  it, and `undefined` must read as 0. */
  orphanRecoveries?: number;
}
```

No database change, no schema change, no migration. Job records remain
Redis-JSON only.

### 3.4 Adapter gains an optional key-scan seam

The sweep must enumerate job records; the current adapter is `get`/`set`/`del`
only. Add a cursor-based `scan`, keeping the existing three methods
byte-identical so every existing test double still compiles:

```ts
export interface VideoIntelligenceJobRedisAdapter {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string, mode: "EX", seconds: number) => Promise<unknown>;
  del: (key: string) => Promise<unknown>;
  /** NEW — one SCAN page: `[nextCursor, keys]`. Optional so existing test
   *  doubles keep compiling; the production adapter ALWAYS provides it.
   *  When absent the sweep logs once and no-ops rather than throwing. */
  scan?: (cursor: string, match: string, count: number) => Promise<[string, string[]]>;
}
```

**Why SCAN and not a maintained index key:** an index key needs a
read-modify-write on every enqueue/complete, and the worker runs at
`concurrency: 3`, so lost updates are a real risk. SCAN needs no new key and no
new write path, and is bounded (§5.3).

**Key filter:** `MATCH vi:job:*` also matches the active pointers
(`vi:job:active:<tenant>:<project>`). The sweep must skip any key starting with
`vi:job:active:`.

### 3.5 Startup log line (observability hook)

Emit one line after successful registration:

```
[video_intelligence_jobs] queue + worker registered
```

`spec.md` §11 keys an alert off the **absence** of this line at boot. Section-08
owns the alert; this section owns the line.

---

## 4. Tests first

Vitest, node environment, run from `apps/web`.

**Baseline discipline (repo-wide rule):** this repo has a known pre-existing red
baseline. Record the failing-set **identity** before you start and compare
identity, not counts. A count comparison has produced false conclusions here.

### 4.1 `server/__tests__/videoIntelligenceJobsWiring.test.ts` — NEW

A direct copy of `server/__tests__/verticalDramaEpisodeStageJobsWiring.test.ts`
with the VI names substituted. Reads `_core/index.ts` **off disk** with
`fs.readFileSync`, uses **zero mocks**, counts real invocations — `name()` —
never bare import mentions. Note the location: `server/__tests__/`, not
`server/services/__tests__/`.

```ts
const CORE_INDEX_PATH = path.resolve(__dirname, "../_core/index.ts");

/** Counts real invocations — `name()` — never the bare import-list mention. */
const countCalls = (source: string, fnName: string): number =>
  (source.match(new RegExp(`${fnName}\\(\\)`, "g")) ?? []).length;

describe("video intelligence jobs queue wiring in _core/index.ts", () => {
  it("the video intelligence jobs service file exists (the router statically imports it)");
  it("imports init/close from the video intelligence jobs service");
  it("startup CALLS initVideoIntelligenceJobsQueue() — without it every stage strands at 'queued'");
  it("every shutdown block that closes the VD stage queue also closes the VI queue");
});
```

Anchoring rules, both mandatory:

- Init assertion: `countCalls("initVideoIntelligenceJobsQueue") >= 1` **and**
  `>= countCalls("initVerticalDramaEpisodeStageJobsQueue")`, plus an assertion
  that the sibling count is itself `>= 1`. Without the sibling guard the pairing
  assertion can pass vacuously.
- Shutdown assertion: same pairing against
  `closeVerticalDramaEpisodeStageJobsQueue`, same non-vacuity guard. There are
  **two** shutdown blocks, so the count must be ≥ 2 once wired.

⚠️ **The regex is literally `fnName\(\)`** — the startup call must be
argument-less (`await initVideoIntelligenceJobsQueue();`). Passing the optional
dependencies object from production code silently stops the guard counting the
call it exists to protect.

### 4.2 Fail-fast enqueue — extend `server/services/__tests__/videoIntelligenceJobs.test.ts`

Reuse that file's existing `makeFakeRedis()` (in-memory `Map`) and
`basePayload()` helpers plus the overridable `enqueueBullmqJob`. No new module
mocks.

```ts
describe("enqueueVideoIntelligenceJob — fail-fast (VI_QUEUE_UNAVAILABLE)", () => {
  it("marks the record failed and throws VI_QUEUE_UNAVAILABLE when the queue add throws");
  it("clears the active pointer on enqueue failure so the project is not blocked for 2h");
  it("does NOT leave a 'queued' record behind after a failed enqueue");
});
```

- Drive with `enqueueBullmqJob: vi.fn().mockRejectedValue(new Error("queue is not initialized"))`.
- Assertion 2: read the fake store for `vi:job:active:tenant-1:10` and expect it
  absent — or call `getActiveGenerationJob(...)` and expect `null`.
- Assertion 3 is the **regression lock** for today's behaviour. Because the
  throw hides the `jobId`, find the record key by filtering `store.keys()` for
  `vi:job:` without `vi:job:active:`, then expect `status === "failed"`.

### 4.3 Orphan sweep — extend the same file

```ts
describe("orphan sweep", () => {
  it("resets a 'running' record older than the TTL back to 'queued' and re-enqueues once");
  it("re-enqueues a stale 'queued' record whose BullMQ job vanished");
  it("marks a twice-orphaned record 'failed' instead of re-enqueueing forever"); // poison-pill cap
  it("leaves a fresh 'running' record untouched");
  it("ignores vi:job:active:* pointer keys while scanning");
  it("clears the active pointer when it fails a twice-orphaned record");
  it("no-ops (and does not throw) when the adapter provides no scan method");
});

describe("initVideoIntelligenceJobsQueue", () => {
  it("arms the sweep even when BullMQ init throws");   // armed OUTSIDE the try/catch
  it("fires one sweep immediately at init so pre-restart orphans heal now");
  it("clears the timer on close");
});
```

Test-seam notes:

- The sweep suite calls `sweepOrphanedVideoIntelligenceJobs({ redis, now, enqueueBullmqJob })`
  **directly** with injected deps, seeding hand-written record JSON at ages
  relative to an injected `now`. No timers needed.
- The init suite needs `getRedisClient` neutralised:
  `vi.mock("../redis", () => ({ getRedisClient: vi.fn(() => { throw new Error("no redis in tests"); }) }))`.
  That throw lands inside init's own `try/catch`, which is exactly what "arms
  the sweep even when BullMQ init throws" exercises.
- `initVideoIntelligenceJobsQueue` takes an **optional** deps object carrying a
  `sweep` override (§5.4) so the immediate-fire and timer-clear assertions do
  not require spying on a same-module function. Production calls it with no
  arguments (§4.1 ⚠️).
- `vi.useFakeTimers()`, advance by the exported interval, restore real timers in
  `afterEach`. Call `closeVideoIntelligenceJobsQueue()` in `afterEach` too — the
  module holds `queue`/`worker`/`sweepTimer` at module scope and init
  early-returns on `if (queue) return`, so leaked state is a real hazard.
- Never use `…Once` for anything read more than once. This repo has a recorded
  failure class where leaked `…Once` queues produced misleading downstream
  failures; `vi.clearAllMocks()` does not drain them.

---

## 5. Implementation guidance

### 5.1 Startup registration — `server/_core/index.ts`

Every queue here follows one shape: an `await`ed call inside its own `try/catch`
that logs and continues, so a queue failure never aborts startup. None is behind
a feature flag — flag gating lives in the routers. Match it exactly.

- **Import** next to the existing queue imports (near lines 174-179).
- **Init position:** after the `initVerticalDramaEpisodeStageJobsQueue()` block
  (≈1748-1756), before `initWebhookApiDeliveryQueue()` (≈1758-1763). Include a
  neighbour-style comment explaining that a missing init strands every VI stage.
- **Shutdown:** `await closeVideoIntelligenceJobsQueue().catch(() => {});`
  immediately after the existing VD stage close in **both** blocks (≈2118 and
  ≈2186). Missing either is exactly what the guard's pairing assertion catches.
- Keep the call argument-less (§4.1 ⚠️).

### 5.2 Fail-fast enqueue

Replace the swallowing `catch` at lines 218-225. Ordering is load-bearing:

1. Rewrite the record `status: "failed"`, `error: "VI_QUEUE_UNAVAILABLE: …"`,
   fresh `updatedAt` — **before** deleting the pointer, so a concurrent
   `getActiveGenerationJob` never sees a pointer to a still-`queued` record.
2. Delete the active pointer, guarded so it only deletes a pointer still
   pointing at *this* `jobId` (the same guard the worker's `finally` uses).
3. Keep the existing `debugError`.
4. Throw the `TRPCError`.

Wrap both cleanup steps individually so a Redis blip during cleanup cannot mask
the `VI_QUEUE_UNAVAILABLE` throw.

**Update the module header comment.** It currently cites a "best-effort —
mirrors verticalDramaStoryJobs.ts" rationale that is wrong for this module: a VD
story job's record is self-contained and a later worker can pick it up, whereas
here a swallowed failure means no job exists at all. Copy the corrected
reasoning from `verticalDramaEpisodeStageJobs.ts`'s enqueue docblock.

**Caller impact:** `routers/videoProjects.ts` has three call sites (≈856, ≈989,
≈1014). They now propagate a `TRPCError` instead of returning a dead `{ jobId }`.
That is intended (`spec.md` §8.3). Status restore after the throw is
**section-04's** responsibility; do not add it here.

### 5.3 Orphan sweep

```ts
/**
 * Heals jobs whose worker died mid-flight (spec §12.5). A record older than
 * VIDEO_INTELLIGENCE_JOB_ORPHAN_TTL_MS is recovered ONCE — reset to `queued`,
 * `orphanRecoveries` incremented, re-enqueued — and on a SECOND orphaning is
 * marked `failed`. The cap is mandatory: without it a job that reliably kills
 * its worker is re-enqueued forever.
 *
 * Exported so the unit suite can drive it with injected deps, not the timer.
 */
export async function sweepOrphanedVideoIntelligenceJobs(
  dependencies?: Partial<VideoIntelligenceJobStoreDependencies> & {
    enqueueBullmqJob?: (jobId: string) => Promise<void>;
  },
): Promise<{ requeued: string[]; failed: string[] }>;
```

- SCAN `vi:job:*` in pages of 100 until the cursor returns `"0"`, capped at ~20
  pages so one tick can never become an unbounded Redis walk. Skip
  `vi:job:active:` keys and any value that fails `JSON.parse`.
- Orphaned when `status` is `"running"` **or** `"queued"` and
  `now - Date.parse(updatedAt) > ORPHAN_TTL_MS`. Terminal records are skipped.

  *Deliberate widening over `claude-plan.md` §4.3, which names `running` only:*
  with fail-fast enqueue in place a fresh `queued` record always has a job behind
  it, so a 15-minute-stale `queued` record means the BullMQ job itself vanished —
  the precise stranding this section closes. Re-enqueueing is safe because of the
  custom job id in §5.5.
- Recovery: if `(record.orphanRecoveries ?? 0) < MAX_ORPHAN_RECOVERIES`, write
  `{ status: "queued", progress: null, orphanRecoveries: n + 1, updatedAt: now }`
  then re-enqueue through the injectable seam. Refresh `updatedAt` **before** the
  enqueue so a slow enqueue cannot cause a re-sweep on the next tick. Leave the
  active pointer alone — it still correctly points at this job.
- Poison pill: write `failed` with a `VI_QUEUE_UNAVAILABLE` message and clear the
  active pointer, guarded against the `jobId`.
- **Never throw.** Every per-record failure is caught, logged, and the sweep
  continues. One bad record must not disarm the sweep for every other project.
- When `deps.redis.scan` is undefined, log once and return empty arrays.

### 5.4 Sweep lifecycle

Copy `verticalDramaEpisodeStageJobs.ts:176-227` structurally:

```ts
let sweepTimer: ReturnType<typeof setInterval> | null = null;

/** Never throws — mirrors runStaleRunSweepTick. */
async function runOrphanSweepTick(sweep: () => Promise<unknown>): Promise<void>;

/** Arms the periodic sweep. Called BEFORE (and regardless of) BullMQ init
 *  succeeding — the sweep matters most precisely when BullMQ/Redis is broken.
 *  Fires once immediately so pre-restart orphans heal right away. */
function startOrphanSweep(sweep: () => Promise<unknown>): void;

export interface VideoIntelligenceJobsQueueInitDependencies {
  /** Test-only override. Production calls init() with no arguments — the
   *  wiring guard counts `name()` literally. */
  sweep?: () => Promise<unknown>;
}

export async function initVideoIntelligenceJobsQueue(
  dependencies?: VideoIntelligenceJobsQueueInitDependencies,
): Promise<void>;
```

Order inside init, exactly as in the VD original:

1. `startOrphanSweep(...)` — **first, outside** the BullMQ `try/catch`, and
   before the `if (queue) return` early exit so a second init still leaves the
   sweep armed.
2. `if (queue) return;`
3. The existing BullMQ `try/catch` (unchanged apart from §5.5) plus the §3.5 log.

`closeVideoIntelligenceJobsQueue` clears and nulls `sweepTimer` **before** the
worker/queue close, so a close that throws still disarms the timer.

### 5.5 BullMQ custom job id (prerequisite for a safe sweep re-enqueue)

`defaultEnqueueBullmqJob` currently adds with no custom id, so every add creates
a distinct BullMQ job — and a sweep re-enqueue of a merely-backlogged job would
execute the same VI job twice.

```ts
await queue.add("run", { jobId }, { jobId, attempts: 1, removeOnComplete: true, removeOnFail: true });
```

BullMQ ignores an `add` for an existing custom id, making the sweep re-enqueue
naturally idempotent. VI `jobId`s are `randomUUID()` values, so they contain no
`:` and are valid custom ids. `attempts: 1` is stated for the same reason the VD
module states it: the worker body never rethrows, so a retry could only fire on a
genuine crash, and blind redelivery of an LLM stage costs real credits.

Domain-level redelivery safety (a review applied twice) is section-06's revision
guard (`VI_REPAIR_STALE_REVIEW`); this section only ensures the queue layer does
not manufacture duplicates.

---

## 6. Non-functional constraints

From `claude-plan.md` §2.2 — the shared web process already logs high-memory
warnings around 300 MB under a constrained cgroup:

- Registering queue + worker must not raise steady-state RSS by more than ~40 MB.
  The `await import("bullmq")` stays lazy; do not make it static.
- The sweep is I/O-bound and bounded: at most ~20 × 100 keys per tick, every
  5 minutes, at most three Redis keys per job.
- **No ffmpeg, no media generation, no render work in this module.** Render keeps
  its existing separate Lane-A dispatch path, unchanged by this section.

---

## 7. Verification

```
cd apps/web && npx vitest run server/__tests__/videoIntelligenceJobsWiring.test.ts
cd apps/web && npx vitest run server/services/__tests__/videoIntelligenceJobs.test.ts
cd apps/web && npx vitest run          # full suite — compare failing-set IDENTITY
cd apps/web && npx tsc --noEmit        # large pre-existing baseline; compare identity
```

Server files changed → `sudo systemctl restart smartspec-web.service`. Confirm
`[video_intelligence_jobs] queue + worker registered` in
`journalctl -u smartspec-web.service`.

### Exit criteria

- Init is called exactly once at startup and close appears in both shutdown
  blocks; the guard test fails if either is removed.
- A stage button reaches a **terminal** state (`failed` with a real message)
  instead of spinning — even while sections 03-06 are unbuilt, because the
  `VI_*_NOT_WIRED` throws now actually reach the client.
- A failed enqueue leaves no `queued` record and no live active pointer, so the
  project is immediately re-submittable rather than blocked for two hours.
- A `running` record older than 15 minutes is recovered once; a twice-orphaned
  record is `failed`, never looped.

---

## 8. Traps

| Trap | Consequence | Avoid by |
|---|---|---|
| Calling `initVideoIntelligenceJobsQueue(deps)` from `_core/index.ts` | The guard's `name\(\)` regex stops matching and silently protects nothing | Keep the production call argument-less |
| Arming the sweep inside the BullMQ `try/catch` | The sweep dies exactly when it is most needed | Arm first, outside, before `if (queue) return` |
| Adding the close to only one shutdown block | Worker leaks on one exit path | The guard's `>=` pairing covers both — do not weaken it to `>= 1` |
| Omitting the re-orphan cap | A job that kills its worker is re-enqueued forever | `MAX_ORPHAN_RECOVERIES`, with its own test |
| Sweeping `vi:job:active:*` as if they were records | JSON noise, or deleting live pointers | Filter the prefix; assert it |
| Deleting the active pointer unconditionally | Kills a different job's pointer that legitimately replaced this one | Read-then-compare against `jobId` |
| Leaking module state between tests | `if (queue) return` makes the second init a silent no-op and the suite passes for the wrong reason | `close…()` in `afterEach`; restore real timers |
| Treating the enqueue throw as a regression in section-04's tests | The behaviour change is intended | Section-04 handles status restore + credit pre-check around the new throw |
