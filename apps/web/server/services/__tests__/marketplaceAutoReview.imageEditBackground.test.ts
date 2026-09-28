import { describe, expect, it } from "vitest";

import {
  MARKETPLACE_AUTO_REVIEW_SEQUENTIAL_IMAGE_EDIT_RECONCILIATION_JOB_TYPE,
  isMarketplaceAutoReviewSequentialImageEditTaskPendingForTest,
  resolveMarketplaceAutoReviewSequentialImageEditCandidateForTest,
} from "../marketplaceAutoReviewService";
import { isMarketplaceAutoReviewAdvanceOutboxJobType } from "../../jobs/marketplaceAutoReviewJob";

describe("Marketplace Auto Review image-edit background reconciliation", () => {
  it("keeps provider-pending tasks submitted and eligible for another background poll", () => {
    expect(
      isMarketplaceAutoReviewSequentialImageEditTaskPendingForTest("processing")
    ).toBe(true);
    expect(
      resolveMarketplaceAutoReviewSequentialImageEditCandidateForTest({
        candidate: {
          status: "submitted",
          taskId: "task-1",
          beforeUrl: "https://cdn/before.png",
        },
        task: { status: "processing" },
        now: "2026-08-29T12:00:00.000Z",
      })
    ).toMatchObject({
      outcome: "pending",
      candidate: {
        status: "submitted",
        taskId: "task-1",
        lastPolledAt: "2026-08-29T12:00:00.000Z",
      },
    });
  });

  it("persists a completed candidate from the durable task result", () => {
    expect(
      resolveMarketplaceAutoReviewSequentialImageEditCandidateForTest({
        candidate: {
          status: "submitted",
          taskId: "task-2",
          beforeUrl: "https://cdn/before.png",
        },
        task: {
          status: "completed",
          resultUrl: "/api/storage/files/marketplace/result.png",
        },
        now: "2026-08-29T12:01:00.000Z",
      })
    ).toEqual({
      outcome: "completed",
      candidate: {
        status: "completed",
        taskId: "task-2",
        beforeUrl: "https://cdn/before.png",
        afterUrl: "/api/storage/files/marketplace/result.png",
        completedAt: "2026-08-29T12:01:00.000Z",
      },
    });
  });

  it("makes provider failure terminal without converting pending work into a timeout", () => {
    expect(
      resolveMarketplaceAutoReviewSequentialImageEditCandidateForTest({
        candidate: {
          status: "submitted",
          taskId: "task-3",
          beforeUrl: "https://cdn/before.png",
        },
        task: { status: "failed", errorMessage: "provider rejected the edit" },
        now: "2026-08-29T12:02:00.000Z",
      })
    ).toMatchObject({
      outcome: "failed",
      candidate: {
        status: "failed",
        errorMessage: "provider rejected the edit",
        failedAt: "2026-08-29T12:02:00.000Z",
      },
    });
  });

  it("registers the reconciliation job with the existing Marketplace scheduler", () => {
    expect(
      isMarketplaceAutoReviewAdvanceOutboxJobType(
        MARKETPLACE_AUTO_REVIEW_SEQUENTIAL_IMAGE_EDIT_RECONCILIATION_JOB_TYPE
      )
    ).toBe(true);
  });
});
