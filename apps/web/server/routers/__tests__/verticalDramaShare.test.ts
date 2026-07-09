/**
 * Vertical Drama Series — PUBLIC share link read router coverage (task #32,
 * Collab-lite L1, F131AA): `verticalDramaShare.getSharedSeries`.
 *
 * Same "mock the whole module graph, test the exported procedure handler
 * directly" convention as `verticalDramaSeries.deleteSeries.test.ts`. The
 * share-links SERVICE module (`resolveSharedSeriesProjection`) is mocked as
 * a black box here — its own hash lookup / expiry-revocation / whitelist /
 * accessCount-bump behavior is covered by
 * `server/services/__tests__/verticalDramaShareLinks.test.ts`. This file
 * covers: the router is a thin, single-call passthrough (happy path), the
 * generic failure propagates unchanged (never re-worded into something more
 * specific), and — separately, against the REAL (unmocked)
 * `createRateLimitMiddleware`) — that the rate limiter this procedure wires
 * up actually enforces a bound.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../_core/trpc", () => {
  const createProcedure = () => {
    const proc: any = {
      use: () => proc,
      input: () => proc,
      query: (fn: Function) => fn,
      mutation: (fn: Function) => fn,
    };
    return proc;
  };
  return {
    router: (routes: Record<string, unknown>) => routes,
    publicProcedure: createProcedure(),
  };
});

vi.mock("../../services/verticalDramaShareLinks", () => ({
  resolveSharedSeriesProjection: vi.fn(),
}));

import { verticalDramaShareRouter } from "../verticalDramaShare";
import { resolveSharedSeriesProjection } from "../../services/verticalDramaShareLinks";
import { TRPCError } from "@trpc/server";
import { createRateLimitMiddleware } from "../../_core/rateLimitedProcedure";

const router = verticalDramaShareRouter as unknown as Record<string, Function>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getSharedSeries — happy path", () => {
  it("passes the raw token straight through to the service and returns its result unchanged", async () => {
    const projection = {
      series: { title: "Corporate Betrayal", genre: "Drama", tone: "Dark", targetEpisodeCount: 12 },
      overview: { logline: "l", mainPlot: "m", seasonArc: "s" },
      episodes: [],
    };
    (resolveSharedSeriesProjection as any).mockResolvedValueOnce(projection);

    const result = await router.getSharedSeries({ input: { token: "raw-token-abc" } });

    expect(resolveSharedSeriesProjection).toHaveBeenCalledTimes(1);
    expect(resolveSharedSeriesProjection).toHaveBeenCalledWith("raw-token-abc");
    expect(result).toEqual(projection);
  });

  it("calls the service exactly once per request (never double-invokes, which would double-bump accessCount)", async () => {
    (resolveSharedSeriesProjection as any).mockResolvedValueOnce({
      series: { title: "S", genre: null, tone: null, targetEpisodeCount: 1 },
      overview: { logline: null, mainPlot: null, seasonArc: null },
      episodes: [],
    });

    await router.getSharedSeries({ input: { token: "tok" } });

    expect(resolveSharedSeriesProjection).toHaveBeenCalledTimes(1);
  });
});

describe("getSharedSeries — generic failure", () => {
  it("propagates the service's NOT_FOUND error unchanged — never rewords/wraps it", async () => {
    const genericError = new TRPCError({
      code: "NOT_FOUND",
      message: "ลิงก์ไม่ถูกต้องหรือหมดอายุแล้ว",
    });
    (resolveSharedSeriesProjection as any).mockRejectedValueOnce(genericError);

    await expect(router.getSharedSeries({ input: { token: "dead-token" } })).rejects.toBe(genericError);
  });

  it("produces the identical error object for an unknown token as for an expired one (proving the router adds no per-case branching of its own)", async () => {
    const genericError = new TRPCError({ code: "NOT_FOUND", message: "ลิงก์ไม่ถูกต้องหรือหมดอายุแล้ว" });
    (resolveSharedSeriesProjection as any)
      .mockRejectedValueOnce(genericError)
      .mockRejectedValueOnce(genericError);

    const first = await router.getSharedSeries({ input: { token: "unknown" } }).catch((e: unknown) => e);
    const second = await router.getSharedSeries({ input: { token: "expired" } }).catch((e: unknown) => e);

    expect(first).toBe(genericError);
    expect(second).toBe(genericError);
    expect((first as TRPCError).message).toBe((second as TRPCError).message);
  });
});

describe("rate limiting — reuses the SAME createRateLimitMiddleware factory as login/register/etc. (_core/rateLimitedProcedure.ts), tested here against the REAL (unmocked) implementation", () => {
  function fakeCtx(ip: string) {
    return { req: { ip } } as any;
  }

  it("allows requests under the limit and blocks the (limit+1)th request from the same IP within the window", async () => {
    const middleware = createRateLimitMiddleware({
      namespace: `vd-share-read-test-${Math.random()}`,
      limit: 3,
      windowMs: 60_000,
    });
    const next = vi.fn(async () => "ok");
    const ctx = fakeCtx("203.0.113.7");

    await expect(middleware({ ctx, next })).resolves.toBe("ok");
    await expect(middleware({ ctx, next })).resolves.toBe("ok");
    await expect(middleware({ ctx, next })).resolves.toBe("ok");
    await expect(middleware({ ctx, next })).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });

    expect(next).toHaveBeenCalledTimes(3);
  });

  it("tracks separate IPs independently", async () => {
    const middleware = createRateLimitMiddleware({
      namespace: `vd-share-read-test-${Math.random()}`,
      limit: 1,
      windowMs: 60_000,
    });
    const next = vi.fn(async () => "ok");

    await expect(middleware({ ctx: fakeCtx("203.0.113.1"), next })).resolves.toBe("ok");
    // A second IP is NOT blocked by the first IP's usage.
    await expect(middleware({ ctx: fakeCtx("203.0.113.2"), next })).resolves.toBe("ok");
    // But the first IP again IS blocked.
    await expect(middleware({ ctx: fakeCtx("203.0.113.1"), next })).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
    });
  });
});
