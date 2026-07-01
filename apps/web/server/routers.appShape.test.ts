import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.CONTROL_PLANE_API_KEY = "test-control-plane-key-0001";
});

import { appRouter } from "./routers";

type RouterWithDefinition = {
  _def: {
    procedures: Record<string, unknown>;
    record?: Record<string, unknown>;
  };
};

function routerDefinition() {
  return (appRouter as unknown as RouterWithDefinition)._def;
}

describe("appRouter compatibility shape", () => {
  it("keeps critical top-level routers registered after the app router refactor", () => {
    const recordKeys = Object.keys(routerDefinition().record ?? {});

    expect(recordKeys).toEqual(
      expect.arrayContaining([
        "auth",
        "gallery",
        "ai",
        "library",
        "media",
        "marketplaceCapture",
        "system",
      ])
    );
  });

  it("keeps Marketplace Capture standard and HyperFrames procedures addressable through appRouter", () => {
    const procedureKeys = Object.keys(routerDefinition().procedures);

    expect(procedureKeys).toEqual(
      expect.arrayContaining([
        "marketplaceCapture.startAutoReview",
        "marketplaceCapture.searchSimilarProductsByImage",
        "marketplaceCapture.getAutoReviewRun",
        "marketplaceCapture.listAutoReviewRuns",
        "marketplaceCapture.advanceAutoReviewRun",
        "marketplaceCapture.selectAutoReviewImageAttemptForStoryboardReview",
        "marketplaceCapture.cancelAutoReviewRun",
        "marketplaceCapture.getAutoStoryboardReviewPlan",
        "marketplaceCapture.startAutoStoryboardReview",
        "marketplaceCapture.createHyperframesPreview",
        "marketplaceCapture.getHyperframesRenderJob",
        "marketplaceCapture.repairHyperframesRenderJob",
        "marketplaceCapture.saveHyperframesRenderToLibrary",
      ])
    );
  });

  it("keeps core auth, gallery, and AI procedures addressable through appRouter", () => {
    const procedureKeys = Object.keys(routerDefinition().procedures);

    expect(procedureKeys).toEqual(
      expect.arrayContaining([
        "auth.me",
        "auth.logout",
        "auth.login",
        "gallery.list",
        "gallery.get",
        "gallery.adminList",
        "gallery.create",
        "ai.upload",
      ])
    );
  });
});
