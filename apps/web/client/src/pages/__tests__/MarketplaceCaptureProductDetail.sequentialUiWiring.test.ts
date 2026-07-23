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
  it("declares every sequential derived-state hook before the product loading guards", () => {
    const productGuardIndexes = [
      source.indexOf("if (product.isLoading) return"),
      source.indexOf("if (!product.data) return"),
    ];
    for (const guardIndex of productGuardIndexes) {
      expect(guardIndex).toBeGreaterThanOrEqual(0);
    }

    const sequentialHookMarkers = [
      "const autoReviewProductAngleLabelsByImageId = useMemo(",
      "const autoReviewSelectedProductAngleImageIds = useMemo(",
      "const buildAutoReviewProductAngleEntry = useCallback(",
      "const handleAutoReviewAngleLabelChange = useCallback(",
      "const toggleAutoReviewReferenceSelect = useCallback(",
      "const autoReviewAngleSelectionEntries = useMemo(",
      "const autoReviewReferenceCapacityMeter = useMemo(",
      "const autoReviewGuardianState = useMemo(",
    ];

    for (const marker of sequentialHookMarkers) {
      const hookIndex = source.indexOf(marker);
      expect(hookIndex, `${marker} must exist`).toBeGreaterThanOrEqual(0);
      for (const guardIndex of productGuardIndexes) {
        expect(hookIndex, `${marker} must run before product guards`).toBeLessThan(
          guardIndex
        );
      }
    }
  });

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

  it("the angle-label state identifier used by the picker is the same one buildAutoReviewReferenceAnchors reads", () => {
    const buildAnchorsFn = sourceBetween(
      "const buildAutoReviewReferenceAnchors = useCallback(",
      "async function startAutoStoryboardReview"
    );
    expect(buildAnchorsFn).toContain("autoReviewProductAngleLabels");
    expect(buildAnchorsFn).toContain("productAngleImages: autoReviewProductAngleLabels");

    const chipsDerivedState = sourceBetween(
      "const autoReviewProductAngleLabelsByImageId = useMemo(",
      "const autoReviewSelectedProductAngleImageIds = useMemo("
    );
    expect(chipsDerivedState).toContain("autoReviewProductAngleLabels");

    // Feature 136 (selection redesign, 2026-07-23) — the header strip no
    // longer takes images/angleLabels/onAngleLabelChange; it is pure
    // presentation over the capacity meter + a parent-computed hint flag.
    const chipsMount = sourceBetween(
      "<SequentialProductAngleChips",
      "{history.length > 0 ? ("
    );
    expect(chipsMount).toContain("capacity={autoReviewReferenceCapacityMeter}");
    expect(chipsMount).toContain("showDiscoverabilityHint=");
    expect(chipsMount).not.toContain("images={productImageOptions}");
    expect(chipsMount).not.toContain("angleLabels={autoReviewProductAngleLabelsByImageId}");
    expect(chipsMount).not.toContain("onAngleLabelChange={handleAutoReviewAngleLabelChange}");
  });

  it("never imports the model registry for capacity, and never constructs productAngleImages outside buildAutoReviewReferenceAnchors", () => {
    expect(source).not.toContain("getReferenceImageLimitForModel");
    const productAngleImagesConstructions = source.match(/productAngleImages:/g) ?? [];
    expect(productAngleImagesConstructions).toHaveLength(1);
  });

  it("selection redesign (2026-07-23) — enrollment is a checkbox toggle, not assigning a label", () => {
    // The optional-label signature: choosing "unset" keeps the selection
    // and only clears the label.
    expect(source).toContain(
      "(imageId: string, label: SequentialAngleLabel | undefined)"
    );

    // The checkbox handler exists, is a hook (Rules of Hooks: before the
    // product-loading guards, asserted above), and is wired into the
    // Product Images grid.
    const toggleHookIndex = source.indexOf(
      "const toggleAutoReviewReferenceSelect = useCallback("
    );
    expect(toggleHookIndex).toBeGreaterThanOrEqual(0);

    const gridSection = sourceBetween(
      "{productImageOptions.map((image, index) => {",
      "<SequentialProductAngleChips"
    );
    expect(gridSection).toContain("toggleAutoReviewReferenceSelect(imageId)");
    expect(gridSection).toContain("handleAutoReviewAngleLabelChange(");
    expect(gridSection).toContain("SEQUENTIAL_ANGLE_LABELS.map(");
    // The hero/@Image1 anchor is locked and non-togglable — the grid never
    // renders a clickable toggle for it, only a static indicator.
    expect(gridSection).toContain("isAutoReviewAnchor ? (");
    expect(gridSection).toContain("!isAutoReviewAnchor");
  });
});
