/**
 * Feature 136 (Marketplace Auto Review: Sequential Shot Storyboard) —
 * section 13 §4 deliverable 2 wiring checks. `startFramePromptStyle`
 * threading through the "run metadata" chain:
 *
 *   autoPlan.ts (`plan.defaults.startFramePromptStyle`)
 *     -> `hyperframesRuntimeApiService.ts`'s `startAutoStoryboardReviewForApi`
 *     -> `startMarketplaceAutoReviewRun`'s input
 *     -> `buildRunMetadata` (sticky, top-level, mirrors `videoModel`)
 *     -> `runSequentialPromptPlanStage`'s `loopInput` (covered directly, with
 *        assertions, in `marketplaceAutoReview.sequentialEvidencePersistence.test.ts`).
 *
 * The `hyperframesRuntimeApiService.ts` forwarding line is checked here as a
 * DB-free wiring grep-guard (section-01 §4.4 precedent, also used by section
 * 09's own T1) rather than a full functional mock, because the only existing
 * functional test file for that call site
 * (`hyperframesRuntimeApiResume.test.ts`) has a PRE-EXISTING, unrelated mock
 * gap (missing `assertMarketplaceAutoReviewSequentialVideoModelSupported`)
 * that makes its "starts auto review with effective override defaults"
 * case fail even against unmodified `main` — proven by restoring
 * `hyperframesRuntimeApiService.ts` to `HEAD` and re-running (Debugging
 * Protocol). That gap is out of this section's scope to fix.
 */
import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

describe("Feature 136 section 13 — startFramePromptStyle run-metadata wiring", () => {
  it("hyperframesRuntimeApiService.ts forwards plan.defaults.startFramePromptStyle into startMarketplaceAutoReviewRun", () => {
    const body = fs.readFileSync(
      path.resolve(__dirname, "../hyperframesRuntimeApiService.ts"),
      "utf8"
    );
    expect(body).toContain(
      "startFramePromptStyle: plan.defaults.startFramePromptStyle,"
    );
  });

  it("marketplaceAutoReviewService.ts's buildRunMetadata persists startFramePromptStyle stickily (mirrors videoModel)", () => {
    const body = fs.readFileSync(
      path.resolve(__dirname, "../marketplaceAutoReviewService.ts"),
      "utf8"
    );
    expect(body).toContain(
      "startFramePromptStyle: isMarketplaceStartFramePromptStyle(input.startFramePromptStyle)"
    );
  });
});
