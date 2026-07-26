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
    expect(autoReviewRunsQuery).toContain('refetchOnMount: "always"');
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

  it("keeps optimistic polling alive when Auto Storyboard start loses its upstream connection", () => {
    const startMutation = sourceBetween(
      "const startAutoStoryboardReviewMutation =",
      "const selectAutoReviewImageAttemptMutation ="
    );

    expect(startMutation).toContain(
      "isLostUpstreamApiErrorMessage(error.message)"
    );
    expect(startMutation).toContain("กำลังตรวจสอบงานที่อาจเริ่มทำไปแล้ว");
    expect(startMutation).toMatch(
      /if \(isLostUpstreamApiErrorMessage\(error\.message\)\)[\s\S]*?return;/
    );
    expect(startMutation).toContain(
      "AUTO_REVIEW_RUN_START_RECOVERY_WINDOW_MS"
    );
    expect(startMutation).toContain("setOptimisticAutoStoryboardStart(false)");
  });

  it("surfaces a Marketplace Intelligence bridge from product detail", () => {
    expect(source).toContain('aria-label="Market Intelligence"');
    expect(source).toContain("MARKETPLACE_INTELLIGENCE_FEATURE_FLAGS");
    expect(source).toContain("marketplaceIntelligenceEnabled ? (");
    expect(source).toContain(
      "Boolean(productId) && marketplaceIntelligenceEnabled"
    );
    expect(source).toContain("marketplaceIntelligenceKeyword");
    expect(source).toContain("/marketplace-capture/intelligence?keyword=");
    expect(source).toContain("&auto=1");
    expect(source).toContain("Find competitors");
    expect(source).toContain("/settings?tab=integrations");
    expect(source).toContain("Product evidence remains provenance-only");
    expect(source).toContain("createProductMetricEnrichment");
    expect(source).toContain("listProductMetricEnrichments");
    expect(source).toContain("Confirm metric enrichment");
    expect(source).toContain("Enrichment history");
  });
});
