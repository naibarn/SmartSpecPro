import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const sourcePath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../MarketplaceCaptureProductDetail.tsx"
);

const source = readFileSync(sourcePath, "utf-8");

function sourceBetween(start: string, end: string) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

describe("MarketplaceCaptureProductDetail auto review polling", () => {
  it("keeps polling while a newly-started auto review run is being materialized", () => {
    const autoReviewRunsQuery = sourceBetween(
      "const autoReviewRuns = trpc.marketplaceCapture.listAutoReviewRuns.useQuery",
      "const mediaHistory = trpc.media.listTasks.useQuery"
    );

    expect(source).toContain("AUTO_REVIEW_RUN_START_WAIT_POLL_MS");
    expect(source).toContain("AUTO_REVIEW_RUN_ACTIVE_POLL_MS");
    expect(source).toContain("AUTO_REVIEW_RUN_STALE_MS");
    expect(autoReviewRunsQuery).toContain("shouldPollAutoReviewRunStart");
    expect(autoReviewRunsQuery).toContain("AUTO_REVIEW_RUN_START_WAIT_POLL_MS");
    expect(autoReviewRunsQuery).toContain("refetchOnMount: \"always\"");
    expect(autoReviewRunsQuery).toContain("refetchOnReconnect: true");
    expect(autoReviewRunsQuery).toContain(
      "staleTime: shouldPollAutoReviewRunStart ? 0 : AUTO_REVIEW_RUN_STALE_MS"
    );
  });

  it("invalidates all auto review run list variants after state-changing mutations", () => {
    expect(source).not.toMatch(
      /listAutoReviewRuns\.invalidate\(\{\s*productId,\s*limit:/s
    );
    expect(source).toContain("listAutoReviewRuns.invalidate()");
  });

  it("clears the transient start action once the auto review start request settles", () => {
    const startMutation = sourceBetween(
      "const startAutoReviewMutation =",
      "const startAutoStoryboardReviewMutation ="
    );

    expect(startMutation).toContain(
      "onSettled: () => setPendingAutoReviewAction(null)"
    );
  });
});
