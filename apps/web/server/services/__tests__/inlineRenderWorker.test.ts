/**
 * `inlineRenderWorker.ts` coverage (Vertical Drama Render Queue plan §4.3,
 * Wave 2). Uses a tiny in-memory fake `worker_jobs` table (not a real DB) so
 * the atomic-claim / terminal-write-guard semantics can be tested for real
 * (a WHERE clause that no longer matches the LIVE row genuinely yields 0
 * affected rows), rather than merely asserting mock call shapes.
 *
 * `drizzle-orm`'s `eq`/`and`/`asc`/`desc` are mocked to plain, inspectable
 * tagged objects (same convention as
 * `server/routers/systemSettings.vectordbGuard.test.ts`) so the fake table
 * can evaluate WHERE/ORDER BY clauses against its own rows.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../_core/logger", () => ({ debugError: vi.fn(), debugLog: vi.fn() }));

vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    eq: (column: any, value: any) => ({ kind: "eq", column, value }),
    and: (...conditions: any[]) => ({ kind: "and", conditions }),
    asc: (column: any) => ({ kind: "asc", column }),
    desc: (column: any) => ({ kind: "desc", column }),
  };
});

const { mockDb } = vi.hoisted(() => ({ mockDb: { select: vi.fn(), update: vi.fn() } }));
vi.mock("../../db", () => ({ db: mockDb }));

import { runInlineRenderWorkerTick } from "../inlineRenderWorker";
import { workerJobs } from "../../../drizzle/schema";
import { VERTICAL_DRAMA_FFMPEG_ASSEMBLY_JOB_TYPE } from "../../../shared/workerRuntime";

/* -------------------------------------------------------------------------- */
/* Fake in-memory `worker_jobs` table                                         */
/* -------------------------------------------------------------------------- */

interface FakeJobRow {
  id: string;
  tenantId: string;
  jobType: string;
  status: string;
  priority: number;
  createdAt: Date;
  inputJson: unknown;
  startedAt: Date | null;
  finishedAt: Date | null;
  outputJson: unknown;
  failureReason: string | null;
}

function evalCondition(cond: any, row: FakeJobRow): boolean {
  if (!cond) return true;
  if (cond.kind === "and") return cond.conditions.every((c: any) => evalCondition(c, row));
  if (cond.kind === "eq") {
    const colName = cond.column?.name as keyof FakeJobRow;
    return (row as any)[colName] === cond.value;
  }
  return true;
}

function makeFakeDb(rows: FakeJobRow[]) {
  const raceHooks: Array<() => void> = [];

  const select = vi.fn(() => {
    const chain: any = {};
    let filterFn: (r: FakeJobRow) => boolean = () => true;
    let sorters: Array<(a: FakeJobRow, b: FakeJobRow) => number> = [];
    chain.from = vi.fn(() => chain);
    chain.where = vi.fn((cond: any) => {
      filterFn = (r: FakeJobRow) => evalCondition(cond, r);
      return chain;
    });
    chain.orderBy = vi.fn((...specs: any[]) => {
      sorters = specs.map((s: any) => {
        const dir = s.kind === "desc" ? -1 : 1;
        const colName = s.column?.name as keyof FakeJobRow;
        return (a: FakeJobRow, b: FakeJobRow) =>
          (a[colName] as any) > (b[colName] as any)
            ? dir
            : (a[colName] as any) < (b[colName] as any)
              ? -dir
              : 0;
      });
      return chain;
    });
    chain.limit = vi.fn((n: number) => {
      let result = rows.filter(filterFn);
      for (const sorter of sorters) result = [...result].sort(sorter);
      const snapshot = result.slice(0, n).map((r) => ({ ...r }));
      while (raceHooks.length) raceHooks.shift()!();
      return Promise.resolve(snapshot);
    });
    return chain;
  });

  const update = vi.fn(() => {
    const chain: any = {};
    let patch: Record<string, unknown> = {};
    chain.set = vi.fn((p: Record<string, unknown>) => {
      patch = p;
      return chain;
    });
    chain.where = vi.fn((cond: any) => {
      const matched = rows.filter((r) => evalCondition(cond, r));
      matched.forEach((r) => Object.assign(r, patch));
      const affected = matched.map((r) => ({ id: r.id }));
      const promiseLike: any = Promise.resolve(undefined);
      promiseLike.returning = vi.fn(() => Promise.resolve(affected));
      return promiseLike;
    });
    return chain;
  });

  return { select, update, rows, raceHooks };
}

function makeRow(overrides: Partial<FakeJobRow> = {}): FakeJobRow {
  return {
    id: "job-1",
    tenantId: "tenant-1",
    jobType: VERTICAL_DRAMA_FFMPEG_ASSEMBLY_JOB_TYPE,
    status: "queued",
    priority: 25,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    inputJson: {
      kind: "trailer",
      owner: { tenantId: "tenant-1", userId: "1", seriesId: "1" },
      renderFeed: {},
      contractVersion: 1,
    },
    startedAt: null,
    finishedAt: null,
    outputJson: null,
    failureReason: null,
    ...overrides,
  };
}

/** Flushes pending microtask chains from fire-and-forget promises. */
function flushAsync(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("runInlineRenderWorkerTick", () => {
  it("does nothing when the admin flag is disabled — never selects", async () => {
    const fakeDb = makeFakeDb([makeRow()]);
    const runJob = vi.fn();

    await runInlineRenderWorkerTick({
      db: fakeDb as any,
      getEnabled: async () => false,
      runJob,
    });

    expect(fakeDb.select).not.toHaveBeenCalled();
    expect(runJob).not.toHaveBeenCalled();
  });

  it("claims only vertical_drama_ffmpeg_assembly jobType rows, ignoring other queued jobs", async () => {
    const ffmpegRow = makeRow({ id: "ffmpeg-job", status: "queued" });
    const otherRow = makeRow({
      id: "remotion-job",
      jobType: "remotion_render_video",
      status: "queued",
      inputJson: {},
    });
    const fakeDb = makeFakeDb([otherRow, ffmpegRow]);
    const runJob = vi.fn().mockResolvedValue({ ok: true, videoUrl: "https://cdn/x.mp4" });

    await runInlineRenderWorkerTick({ db: fakeDb as any, getEnabled: async () => true, runJob });
    await flushAsync();

    expect(runJob).toHaveBeenCalledTimes(1);
    expect(runJob).toHaveBeenCalledWith(expect.anything(), "ffmpeg-job");
    expect(otherRow.status).toBe("queued"); // never touched
    expect(ffmpegRow.status).toBe("completed");
  });

  it("atomic claim guard: a lost race between SELECT and UPDATE never runs the job, and re-selects", async () => {
    const row = makeRow({ id: "job-race", status: "queued" });
    const fakeDb = makeFakeDb([row]);
    // Simulate another claimer winning the race right after our SELECT
    // snapshot is taken but before our own UPDATE runs.
    fakeDb.raceHooks.push(() => {
      row.status = "running";
    });
    const runJob = vi.fn();

    await runInlineRenderWorkerTick({ db: fakeDb as any, getEnabled: async () => true, runJob });
    await flushAsync();

    expect(runJob).not.toHaveBeenCalled();
    // Re-selected after losing the race (continue, not break) — the second
    // SELECT finds nothing queued anymore and the loop stops.
    expect(fakeDb.select).toHaveBeenCalledTimes(2);
    expect(row.status).toBe("running");
  });

  it("terminal write is guarded WHERE status='running': a canceled job is left untouched", async () => {
    const row = makeRow({ id: "job-cancel", status: "queued" });
    const fakeDb = makeFakeDb([row]);
    // Runner takes "forever" (never resolves within this test) — we flip
    // the row to 'canceled' (as a concurrent user cancel would) before it
    // resolves, then let it resolve and assert the terminal write no-ops.
    let resolveRunJob!: (value: { ok: boolean; videoUrl?: string; error?: string }) => void;
    const runJob = vi.fn(
      () =>
        new Promise<{ ok: boolean; videoUrl?: string; error?: string }>((resolve) => {
          resolveRunJob = resolve;
        }),
    );

    await runInlineRenderWorkerTick({ db: fakeDb as any, getEnabled: async () => true, runJob });
    // Claim has landed (status flipped to 'running' by claimCandidate).
    expect(row.status).toBe("running");

    // A concurrent user cancel happens while the render is still "in flight".
    row.status = "canceled";

    resolveRunJob({ ok: true, videoUrl: "https://cdn/should-not-apply.mp4" });
    await flushAsync();

    // The terminal UPDATE's WHERE status='running' guard no-ops against the
    // now-'canceled' row — status stays 'canceled', not clobbered to
    // 'completed'.
    expect(row.status).toBe("canceled");
    expect(row.outputJson).toBeNull();
  });

  it("respects the concurrency cap (default 1): only one job runs per tick even with two queued", async () => {
    const rowA = makeRow({ id: "job-a", priority: 30 });
    const rowB = makeRow({ id: "job-b", priority: 20 });
    const fakeDb = makeFakeDb([rowA, rowB]);
    const runJob = vi.fn().mockResolvedValue({ ok: true, videoUrl: "https://cdn/x.mp4" });

    await runInlineRenderWorkerTick({ db: fakeDb as any, getEnabled: async () => true, runJob });
    await flushAsync();

    expect(runJob).toHaveBeenCalledTimes(1);
    // Higher priority claimed first.
    expect(rowA.status).toBe("completed");
    expect(rowB.status).toBe("queued");
  });

  it("respects a configured higher concurrency cap", async () => {
    const originalEnv = process.env.SMARTSPEC_INLINE_RENDER_CONCURRENCY;
    process.env.SMARTSPEC_INLINE_RENDER_CONCURRENCY = "2";
    try {
      const rowA = makeRow({ id: "job-a", priority: 30 });
      const rowB = makeRow({ id: "job-b", priority: 20 });
      const fakeDb = makeFakeDb([rowA, rowB]);
      const runJob = vi.fn().mockResolvedValue({ ok: true, videoUrl: "https://cdn/x.mp4" });

      await runInlineRenderWorkerTick({ db: fakeDb as any, getEnabled: async () => true, runJob });
      await flushAsync();

      expect(runJob).toHaveBeenCalledTimes(2);
      expect(rowA.status).toBe("completed");
      expect(rowB.status).toBe("completed");
    } finally {
      if (originalEnv === undefined) {
        delete process.env.SMARTSPEC_INLINE_RENDER_CONCURRENCY;
      } else {
        process.env.SMARTSPEC_INLINE_RENDER_CONCURRENCY = originalEnv;
      }
    }
  });

  it("a runner failure marks the job failed, never crashes the tick", async () => {
    const row = makeRow({ id: "job-fail" });
    const fakeDb = makeFakeDb([row]);
    const runJob = vi.fn().mockRejectedValue(new Error("ffmpeg exploded"));

    await expect(
      runInlineRenderWorkerTick({ db: fakeDb as any, getEnabled: async () => true, runJob }),
    ).resolves.toBeUndefined();
    await flushAsync();

    expect(row.status).toBe("failed");
    expect(row.failureReason).toBe("ffmpeg exploded");
  });

  it("a runner ok:false outcome marks the job failed with the outcome's error", async () => {
    const row = makeRow({ id: "job-fail-2" });
    const fakeDb = makeFakeDb([row]);
    const runJob = vi.fn().mockResolvedValue({ ok: false, error: "no compiled video" });

    await runInlineRenderWorkerTick({ db: fakeDb as any, getEnabled: async () => true, runJob });
    await flushAsync();

    expect(row.status).toBe("failed");
    expect(row.failureReason).toBe("no compiled video");
  });

  it("an invalid inputJson payload marks the job failed without calling runJob", async () => {
    const row = makeRow({ id: "job-invalid", inputJson: { not: "a valid contract" } });
    const fakeDb = makeFakeDb([row]);
    const runJob = vi.fn();

    await runInlineRenderWorkerTick({ db: fakeDb as any, getEnabled: async () => true, runJob });
    await flushAsync();

    expect(runJob).not.toHaveBeenCalled();
    expect(row.status).toBe("failed");
  });

  it("uses the real db/runner defaults when no deps are injected (module wiring smoke test)", async () => {
    mockDb.select.mockReturnValue({
      from: () => ({ where: () => ({ orderBy: () => ({ limit: () => Promise.resolve([]) }) }) }),
    });

    await expect(
      runInlineRenderWorkerTick({ getEnabled: async () => true }),
    ).resolves.toBeUndefined();

    expect(mockDb.select).toHaveBeenCalledTimes(1);
  });
});
