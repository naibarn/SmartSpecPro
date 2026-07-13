/**
 * Vertical Drama Series — `get`'s per-episode `compiledVideo` summary
 * (Episode List UI player, additive/read-only) plus the underlying pure
 * `extractEpisodeCompiledVideoSummary` helper.
 *
 * Same "mock the whole module graph, test the exported pure function
 * directly" convention as `verticalDramaSeries.createPresetStamp.test.ts`'s
 * `stampPresetVisualIdentityIntoBible` coverage — this file only needs the
 * baseline 5-mock floor (`../../db`, `../../_core/trpc`,
 * `../../middleware/requireFeatureFlag`, `../../services/verticalDramaStoryBible`,
 * `../../_core/logger`) shared by every sibling test in this directory,
 * since `extractEpisodeCompiledVideoSummary` is pure and never touches the
 * DB, auth, or any procedure handler.
 *
 * Covers: `status === "completed"` + non-empty `videoUrl` -> summary;
 * `pending`/`failed` status -> `null`; missing/empty/whitespace-only
 * `videoUrl` -> `null`; missing `compiledVideo`/`assemblyManifest` (or a
 * non-object `assemblyManifest`) -> `null`; `durationSeconds` included only
 * when it is a finite number.
 */
import { describe, expect, it, vi } from "vitest";

const { mockDb } = vi.hoisted(() => ({
  mockDb: {
    select: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
    delete: vi.fn(),
    transaction: vi.fn(),
    instance: {},
  },
}));
vi.mock("../../db", () => ({ db: mockDb }));

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
    protectedProcedure: createProcedure(),
  };
});

vi.mock("../../middleware/requireFeatureFlag", () => ({
  requireFeatureFlag: () => (x: unknown) => x,
}));

vi.mock("../../services/verticalDramaStoryBible", () => ({
  generateStoryBible: vi.fn(),
  InsufficientCreditsError: class extends Error {},
  VdSchemaValidationError: class extends Error {},
}));

vi.mock("../../_core/logger", () => ({
  debugError: vi.fn(),
  debugLog: vi.fn(),
}));

import { extractEpisodeCompiledVideoSummary } from "../verticalDramaSeries";

describe("extractEpisodeCompiledVideoSummary (pure)", () => {
  it("returns the compact summary when status is completed and videoUrl is non-empty", () => {
    const result = extractEpisodeCompiledVideoSummary({
      compiledVideo: { status: "completed", videoUrl: "https://cdn.example/ep1-compiled.mp4" },
    });
    expect(result).toEqual({
      videoUrl: "https://cdn.example/ep1-compiled.mp4",
      status: "completed",
    });
  });

  it("includes durationSeconds when it is a finite number", () => {
    const result = extractEpisodeCompiledVideoSummary({
      compiledVideo: {
        status: "completed",
        videoUrl: "https://cdn.example/ep1-compiled.mp4",
        durationSeconds: 58.4,
      },
    });
    expect(result).toEqual({
      videoUrl: "https://cdn.example/ep1-compiled.mp4",
      status: "completed",
      durationSeconds: 58.4,
    });
  });

  it.each(["pending", "failed"] as const)(
    "returns null when compiledVideo.status is %s",
    (status) => {
      const result = extractEpisodeCompiledVideoSummary({
        compiledVideo: { status, videoUrl: "https://cdn.example/ep1-compiled.mp4" },
      });
      expect(result).toBeNull();
    },
  );

  it("returns null when videoUrl is missing", () => {
    const result = extractEpisodeCompiledVideoSummary({
      compiledVideo: { status: "completed" },
    });
    expect(result).toBeNull();
  });

  it("returns null when videoUrl is an empty string", () => {
    const result = extractEpisodeCompiledVideoSummary({
      compiledVideo: { status: "completed", videoUrl: "" },
    });
    expect(result).toBeNull();
  });

  it("returns null when videoUrl is whitespace-only", () => {
    const result = extractEpisodeCompiledVideoSummary({
      compiledVideo: { status: "completed", videoUrl: "   " },
    });
    expect(result).toBeNull();
  });

  it("returns null when assemblyManifest has no compiledVideo key", () => {
    const result = extractEpisodeCompiledVideoSummary({ someOtherField: 1 });
    expect(result).toBeNull();
  });

  it("returns null when assemblyManifest is null", () => {
    expect(extractEpisodeCompiledVideoSummary(null)).toBeNull();
  });

  it("returns null when assemblyManifest is undefined", () => {
    expect(extractEpisodeCompiledVideoSummary(undefined)).toBeNull();
  });

  it("returns null when assemblyManifest is not an object (defensive, untyped jsonb)", () => {
    expect(extractEpisodeCompiledVideoSummary("not-an-object")).toBeNull();
    expect(extractEpisodeCompiledVideoSummary(42)).toBeNull();
  });

  it("returns null when compiledVideo itself is not an object (defensive, untyped jsonb)", () => {
    const result = extractEpisodeCompiledVideoSummary({ compiledVideo: "not-an-object" });
    expect(result).toBeNull();
  });

  it("omits durationSeconds when it is not a finite number (NaN, Infinity, or non-numeric)", () => {
    const cases = [NaN, Infinity, -Infinity, "58.4" as unknown as number];
    for (const durationSeconds of cases) {
      const result = extractEpisodeCompiledVideoSummary({
        compiledVideo: {
          status: "completed",
          videoUrl: "https://cdn.example/ep1-compiled.mp4",
          durationSeconds,
        },
      });
      expect(result).toEqual({
        videoUrl: "https://cdn.example/ep1-compiled.mp4",
        status: "completed",
      });
      expect(result && "durationSeconds" in result).toBe(false);
    }
  });
});
