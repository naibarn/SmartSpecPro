/**
 * Feature 136 (Marketplace Auto Review: Sequential Shot Storyboard) —
 * section 11 §5.8. Source grep-guard for MPCPD wiring (precedent:
 * `MarketplaceCaptureProductDetail.autoReviewPolling.test.ts`) — MPCPD is
 * 8,500+ lines and must NEVER be mounted in jsdom (binding decision §3.3).
 * Behavior is proven on the extracted components' own test files; this
 * file only proves the page wires them in correctly.
 */
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

describe("MarketplaceCaptureProductDetail sequential UI wiring (Feature 136 section 11)", () => {
  it("imports and mounts the three sequential UI components", () => {
    expect(source).toContain("SequentialEvidenceReviewPanel");
    expect(source).toContain("SequentialGuardianNotice");
    expect(source).toContain("SequentialProductAngleChips");
    expect(source).toMatch(/<SequentialEvidenceReviewPanel\b/);
    expect(source).toMatch(/<SequentialProductAngleChips\b/);
  });

  it("reads the sequential flag from tenantFeatureFlags and passes it to AutoStoryboardAdvancedOverrides", () => {
    expect(source).toContain(
      "tenantFeatureFlags.marketplaceSequentialStoryboard"
    );
    const advancedOverridesMount = sourceBetween(
      "<AutoStoryboardAdvancedOverrides",
      "</>"
    );
    expect(advancedOverridesMount).toContain(
      "sequentialStrategyEnabled={sequentialStrategyEnabled}"
    );
  });

  it("wires the evidence panel through setAutoStoryboardOverrides — the same state as the existing overrides, not a separate payload", () => {
    const evidencePanelMount = sourceBetween(
      "<SequentialEvidenceReviewPanel",
      "<AutoStoryboardAdvancedOverrides"
    );
    expect(evidencePanelMount).toContain("value={autoStoryboardOverrides}");
    expect(evidencePanelMount).toContain("onChange={setAutoStoryboardOverrides}");
  });

  it("the angle-label state identifier used by the chips is the same one buildAutoReviewReferenceAnchors reads", () => {
    const buildAnchorsFn = sourceBetween(
      "const buildAutoReviewReferenceAnchors = useCallback(",
      "async function startAutoStoryboardReview"
    );
    expect(buildAnchorsFn).toContain("autoReviewProductAngleLabels");
    expect(buildAnchorsFn).toContain("productAngleImages: autoReviewProductAngleLabels");

    const chipsDerivedState = sourceBetween(
      "const autoReviewProductAngleLabelsByImageId = useMemo(",
      "const handleAutoReviewAngleLabelChange = useCallback("
    );
    expect(chipsDerivedState).toContain("autoReviewProductAngleLabels");

    const chipsMount = sourceBetween(
      "<SequentialProductAngleChips",
      "{history.length > 0 ? ("
    );
    expect(chipsMount).toContain("angleLabels={autoReviewProductAngleLabelsByImageId}");
  });

  it("never imports the model registry for capacity, and never constructs productAngleImages outside buildAutoReviewReferenceAnchors", () => {
    expect(source).not.toContain("getReferenceImageLimitForModel");
    const productAngleImagesConstructions = source.match(/productAngleImages:/g) ?? [];
    expect(productAngleImagesConstructions).toHaveLength(1);
  });
});
