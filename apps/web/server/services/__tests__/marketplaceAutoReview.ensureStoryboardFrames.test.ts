/**
 * Feature 136 (Marketplace Auto Review: Sequential Shot Storyboard) — G18
 * standalone fix, ahead of section 09.
 *
 * `ensureStoryboardFrames` used to assume "everything that is not
 * storyboard_3x3_split is video_shot_start_stop" and fell into the
 * start/stop rebuild loop for `sequential_shot_storyboard` too. Sequential
 * units are `sequential-shot-0N` and never populate
 * `startFrameUrls`/`stopFrameUrls`, so every sequential run threw
 * "Completed start/stop frame set is missing URLs" on every attempt to move
 * from `image_generation` into `storyboard_review` — the same bug class G15
 * fixed in `reconcileDirectImageAttempt`'s `storyboardFramesReady` ternary,
 * in a sibling function G15 did not touch.
 *
 * Spec: specs/feature/136-marketplace-auto-review-sequential-shot-storyboard/
 * reviews/implementation-gaps.md, G18.
 *
 * Convention: exercise the exported `...ForTest` wrapper (SVC convention);
 * a "poison" `db` stub that throws on `.update(...)` proves the already-
 * satisfied paths never issue a write.
 */
import { describe, expect, it } from "vitest";

import {
  ensureStoryboardFramesForTest,
  marketplaceAutoReviewImageUrlsFromDirectRefsForTest,
  type MarketplaceAutoReviewFrameStrategy,
} from "../marketplaceAutoReviewService";

const SEQUENTIAL: MarketplaceAutoReviewFrameStrategy =
  "sequential_shot_storyboard" as any;
const GRID: MarketplaceAutoReviewFrameStrategy = "storyboard_3x3_split" as any;
const START_STOP: MarketplaceAutoReviewFrameStrategy =
  "video_shot_start_stop" as any;

/** A `db` stub that throws the moment anything tries to write through it —
 * proves the already-satisfied / already-populated code paths return
 * without issuing an `updateRun` write. */
const poisonDb = {
  update: () => {
    throw new Error(
      "ensureStoryboardFrames must not call db.update() on this path"
    );
  },
} as any;

function buildPlanFixture(shotCount = 9): any {
  return {
    conceptId: "concept-1",
    title: "รีวิวสินค้า",
    productTruth: { productId: "mp_1" },
    storyboardGuide: "guide",
    voiceoverScript: "voiceover",
    productDetail: "PRODUCT FACTS LOCK",
    shots: Array.from({ length: shotCount }, (_, index) => ({
      id: `shot-${index + 1}`,
      order: index + 1,
      title: `Shot ${index + 1}`,
      startSeconds: index * 5,
      endSeconds: (index + 1) * 5,
      durationSeconds: 5,
    })),
  };
}

function buildRunFixture(frameStrategy: MarketplaceAutoReviewFrameStrategy): any {
  return {
    id: "mar_g18_1",
    productionRunId: "prod_g18_1",
    frameStrategy,
  };
}

function frameUrls(prefix: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => `https://cdn.example.test/${prefix}-${i + 1}.png`);
}

describe("Feature 136 G18 — ensureStoryboardFrames strategy fork", () => {
  describe("sequential_shot_storyboard (the fix)", () => {
    it("completes the handoff when storyboardFrameUrls is already fully populated, without touching the DB", async () => {
      const plan = buildPlanFixture(9);
      const run = buildRunFixture(SEQUENTIAL);
      const metadata = {
        storyboardFrameUrls: frameUrls("shot", 9),
      } as any;

      const result = await ensureStoryboardFramesForTest({
        db: poisonDb,
        tenantId: "tenant-1",
        auth: {} as any,
        run,
        plan,
        metadata,
        runtime: {} as any,
        refs: [],
      });

      expect(result).toBe(metadata);
      expect(result.storyboardFrameUrls).toEqual(frameUrls("shot", 9));
    });

    it("throws a descriptive error (not the start/stop message) when storyboardFrameUrls is incomplete, and never touches the DB", async () => {
      const plan = buildPlanFixture(9);
      const run = buildRunFixture(SEQUENTIAL);
      const metadata = {
        storyboardFrameUrls: frameUrls("shot", 9).slice(0, 8), // shot 9 missing
      } as any;

      await expect(
        ensureStoryboardFramesForTest({
          db: poisonDb,
          tenantId: "tenant-1",
          auth: {} as any,
          run,
          plan,
          metadata,
          runtime: {} as any,
          refs: [],
        })
      ).rejects.toThrow("Completed sequential shot frame set is missing URLs");
    });

    it("regression pin: never throws the start/stop error for a sequential run, even with empty start/stop arrays (the pre-fix crash)", async () => {
      const plan = buildPlanFixture(9);
      const run = buildRunFixture(SEQUENTIAL);
      const metadata = {
        storyboardFrameUrls: frameUrls("shot", 9),
        startFrameUrls: [],
        stopFrameUrls: [],
      } as any;

      await expect(
        ensureStoryboardFramesForTest({
          db: poisonDb,
          tenantId: "tenant-1",
          auth: {} as any,
          run,
          plan,
          metadata,
          runtime: {} as any,
          refs: [],
        })
      ).resolves.toBe(metadata);
    });

    it("end-to-end: reconciled sequential_shot_frame refs (via imageUrlsFromDirectRefs, the real upstream writer) are sufficient to complete the handoff with no rebuild", async () => {
      const plan = buildPlanFixture(9);
      const run = buildRunFixture(SEQUENTIAL);
      const baseMetadata = { storyboardFrameUrls: [] } as any;
      const refs = Array.from({ length: 9 }, (_, i) => ({
        unitId: `sequential-shot-${String(i + 1).padStart(2, "0")}`,
        mediaType: "image",
        stageKey: "image_generation",
        role: "sequential_shot_frame",
        shotId: `shot-${i + 1}`,
        shotOrder: i + 1,
        attempt: 1,
        taskId: `task-${i + 1}`,
        model: "test-image-model",
        status: "completed",
        resultUrl: `https://cdn.example.test/final-shot-${i + 1}.png`,
        submittedAt: "2026-07-22T00:00:00.000Z",
      })) as any;

      // Mirrors what reconcileDirectImageAttempt does BEFORE ensureStoryboardFrames
      // is ever called: merge imageUrlsFromDirectRefs output into metadata.
      const directUrls = marketplaceAutoReviewImageUrlsFromDirectRefsForTest({
        plan,
        metadata: baseMetadata,
        refs,
        frameStrategy: SEQUENTIAL,
      });
      const reconciledMetadata = {
        ...baseMetadata,
        ...directUrls,
      } as any;

      const result = await ensureStoryboardFramesForTest({
        db: poisonDb,
        tenantId: "tenant-1",
        auth: {} as any,
        run,
        plan,
        metadata: reconciledMetadata,
        runtime: {} as any,
        refs,
      });

      expect(result.storyboardFrameUrls).toEqual(frameUrls("final-shot", 9));
    });
  });

  describe("storyboard_3x3_split (byte-identical)", () => {
    it("returns metadata unchanged, without touching the DB, once the grid and split frames already match", async () => {
      const plan = buildPlanFixture(9);
      const run = buildRunFixture(GRID);
      const metadata = {
        storyboardGridUrl: "https://cdn.example.test/grid.png",
        storyboardFrameUrls: frameUrls("grid-shot", 9),
      } as any;
      const refs = [
        {
          unitId: "storyboard-grid-image",
          mediaType: "image",
          stageKey: "image_generation",
          role: "storyboard_grid",
          attempt: 1,
          taskId: "task-grid",
          status: "completed",
          resultUrl: "https://cdn.example.test/grid.png",
          submittedAt: "2026-07-22T00:00:00.000Z",
        },
      ] as any;

      const result = await ensureStoryboardFramesForTest({
        db: poisonDb,
        tenantId: "tenant-1",
        auth: {} as any,
        run,
        plan,
        metadata,
        runtime: {} as any,
        refs,
      });

      expect(result).toBe(metadata);
    });

    it("still throws when the completed grid image has no URL (unchanged pre-existing behavior)", async () => {
      const plan = buildPlanFixture(9);
      const run = buildRunFixture(GRID);
      const metadata = {} as any;

      await expect(
        ensureStoryboardFramesForTest({
          db: poisonDb,
          tenantId: "tenant-1",
          auth: {} as any,
          run,
          plan,
          metadata,
          runtime: {} as any,
          refs: [],
        })
      ).rejects.toThrow("Completed storyboard grid image is missing URL");
    });
  });

  describe("video_shot_start_stop (byte-identical)", () => {
    it("returns metadata unchanged, without touching the DB, once start/stop arrays are already complete", async () => {
      const plan = buildPlanFixture(9);
      const run = buildRunFixture(START_STOP);
      const metadata = {
        startFrameUrls: frameUrls("start", 9),
        stopFrameUrls: frameUrls("stop", 9),
      } as any;

      const result = await ensureStoryboardFramesForTest({
        db: poisonDb,
        tenantId: "tenant-1",
        auth: {} as any,
        run,
        plan,
        metadata,
        runtime: {} as any,
        refs: [],
      });

      expect(result).toBe(metadata);
    });

    it("still throws 'Completed start/stop frame set is missing URLs' when refs are incomplete (unchanged pre-existing behavior)", async () => {
      const plan = buildPlanFixture(9);
      const run = buildRunFixture(START_STOP);
      const metadata = {} as any;
      // Only shot-1's start/stop refs completed; shots 2-9 never reached
      // the provider, so directTaskResultUrl(...) returns "" for them.
      const refs = [
        {
          unitId: "shot-1-start",
          mediaType: "image",
          stageKey: "image_generation",
          role: "start_frame",
          shotId: "shot-1",
          shotOrder: 1,
          attempt: 1,
          taskId: "task-1-start",
          status: "completed",
          resultUrl: "https://cdn.example.test/start-1.png",
          submittedAt: "2026-07-22T00:00:00.000Z",
        },
        {
          unitId: "shot-1-stop",
          mediaType: "image",
          stageKey: "image_generation",
          role: "stop_frame",
          shotId: "shot-1",
          shotOrder: 1,
          attempt: 1,
          taskId: "task-1-stop",
          status: "completed",
          resultUrl: "https://cdn.example.test/stop-1.png",
          submittedAt: "2026-07-22T00:00:00.000Z",
        },
      ] as any;

      await expect(
        ensureStoryboardFramesForTest({
          db: poisonDb,
          tenantId: "tenant-1",
          auth: {} as any,
          run,
          plan,
          metadata,
          runtime: {} as any,
          refs,
        })
      ).rejects.toThrow("Completed start/stop frame set is missing URLs");
    });

    it("rebuilds and persists start/stop arrays via db.update when all 9 shots have completed refs (unchanged pre-existing behavior)", async () => {
      const plan = buildPlanFixture(9);
      const run = buildRunFixture(START_STOP);
      const metadata = {} as any;
      const refs = plan.shots.flatMap((shot: any) => [
        {
          unitId: `${shot.id}-start`,
          mediaType: "image",
          stageKey: "image_generation",
          role: "start_frame",
          shotId: shot.id,
          shotOrder: shot.order,
          attempt: 1,
          taskId: `task-${shot.id}-start`,
          status: "completed",
          resultUrl: `https://cdn.example.test/${shot.id}-start.png`,
          submittedAt: "2026-07-22T00:00:00.000Z",
        },
        {
          unitId: `${shot.id}-stop`,
          mediaType: "image",
          stageKey: "image_generation",
          role: "stop_frame",
          shotId: shot.id,
          shotOrder: shot.order,
          attempt: 1,
          taskId: `task-${shot.id}-stop`,
          status: "completed",
          resultUrl: `https://cdn.example.test/${shot.id}-stop.png`,
          submittedAt: "2026-07-22T00:00:00.000Z",
        },
      ]);

      let updateCalled = false;
      const writableDb = {
        update: () => {
          updateCalled = true;
          return {
            set: () => ({
              where: () => ({
                returning: async () => [{ id: run.id }],
              }),
            }),
          };
        },
      } as any;

      const result = await ensureStoryboardFramesForTest({
        db: writableDb,
        tenantId: "tenant-1",
        auth: {} as any,
        run,
        plan,
        metadata,
        runtime: {} as any,
        refs,
      });

      expect(updateCalled).toBe(true);
      expect(result.startFrameUrls).toHaveLength(9);
      expect(result.stopFrameUrls).toHaveLength(9);
      expect(result.storyboardFrameUrls).toEqual(result.startFrameUrls);
    });
  });
});
