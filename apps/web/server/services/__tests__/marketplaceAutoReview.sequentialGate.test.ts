/**
 * Feature 136 (Marketplace Auto Review: Sequential Shot Storyboard) — section
 * 01 §4.4. Sequential-strategy flag gate: resolver passthrough, the FORBIDDEN
 * assertion core, wiring grep-guards at both start entry points, and the
 * plan-service sanitize+warn behavior (§3.2/§5.8).
 */
import fs from "fs";
import path from "path";
import { TRPCError } from "@trpc/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../db", () => ({
  getDb: vi.fn(async () => null),
}));

import {
  assertMarketplaceSequentialStoryboardAllowedForTest,
  resolveMarketplaceAutoReviewFrameStrategyForTest,
} from "../marketplaceAutoReviewService";
import { buildHyperframesAutoPlanFromState } from "../hyperframesAutoPlanService";
import { resolveHyperframesFeatureAccess } from "../hyperframesFeatureAccessService";

const FIXED_NOW = new Date("2026-01-01T00:00:00.000Z");
const FIXED_AUTH = { userId: 1, tenantId: "tenant_1" } as const;
const FIXED_PRODUCT_BUNDLE = { images: ["https://example.com/product.png"] };

function permissiveAccess() {
  return resolveHyperframesFeatureAccess({
    auth: FIXED_AUTH,
    productId: "product_1",
    flags: {
      enabled: true,
      tenantAllowed: true,
      workerEnabled: true,
      librarySaveEnabled: false,
      operatorEnabled: false,
      templateAllowlist: [],
    },
    now: FIXED_NOW,
  });
}

describe("Feature 136 — resolveMarketplaceAutoReviewFrameStrategyForTest", () => {
  it("maps auto to storyboard_3x3_split, passes sequential through, and preserves existing values", () => {
    expect(
      resolveMarketplaceAutoReviewFrameStrategyForTest(
        "storyboard_images",
        "auto",
      ),
    ).toBe("storyboard_3x3_split");
    expect(
      resolveMarketplaceAutoReviewFrameStrategyForTest(
        "storyboard_images",
        "sequential_shot_storyboard",
      ),
    ).toBe("sequential_shot_storyboard");
    expect(
      resolveMarketplaceAutoReviewFrameStrategyForTest(
        "storyboard_images",
        "storyboard_3x3_split",
      ),
    ).toBe("storyboard_3x3_split");
    expect(
      resolveMarketplaceAutoReviewFrameStrategyForTest(
        "full_video",
        "video_shot_start_stop",
      ),
    ).toBe("video_shot_start_stop");
  });
});

describe("Feature 136 — assertMarketplaceSequentialStoryboardAllowedForTest", () => {
  it("throws typed FORBIDDEN with the exact Thai copy when sequential is requested and the flag is off", () => {
    expect(() =>
      assertMarketplaceSequentialStoryboardAllowedForTest({
        frameStrategy: "sequential_shot_storyboard",
        marketplaceSequentialStoryboard: false,
      }),
    ).toThrow(
      expect.objectContaining({
        code: "FORBIDDEN",
        message: expect.stringContaining(
          "โหมด Storyboard แบบ 9 ภาพต่อเนื่องยังไม่เปิดใช้งานสำหรับ tenant นี้",
        ),
      }),
    );
    try {
      assertMarketplaceSequentialStoryboardAllowedForTest({
        frameStrategy: "sequential_shot_storyboard",
        marketplaceSequentialStoryboard: false,
      });
      throw new Error("expected the assertion to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(TRPCError);
    }
  });

  it("does not throw when sequential is requested and the flag is on", () => {
    expect(() =>
      assertMarketplaceSequentialStoryboardAllowedForTest({
        frameStrategy: "sequential_shot_storyboard",
        marketplaceSequentialStoryboard: true,
      }),
    ).not.toThrow();
  });

  it("never gates existing strategies, even with the flag off", () => {
    for (const frameStrategy of [
      "storyboard_3x3_split",
      "video_shot_start_stop",
      "auto",
    ] as const) {
      expect(() =>
        assertMarketplaceSequentialStoryboardAllowedForTest({
          frameStrategy,
          marketplaceSequentialStoryboard: false,
        }),
      ).not.toThrow();
    }
  });
});

describe("Feature 136 — wiring grep-guard (both start entry points call the gate)", () => {
  function extractFunctionBody(content: string, signature: RegExp): string {
    const match = signature.exec(content);
    expect(match, `signature ${signature} not found`).not.toBeNull();
    const startIndex = match!.index;
    const rest = content.slice(startIndex + match![0].length);
    const nextTopLevel =
      /\n(?:export\s+)?(?:async\s+)?function\s+\w+|\nexport\s+(?:const|class|interface|type)\s+\w+/.exec(
        rest,
      );
    const endIndex = nextTopLevel
      ? startIndex + match![0].length + nextTopLevel.index
      : content.length;
    return content.slice(startIndex, endIndex);
  }

  it("startMarketplaceAutoReviewRun calls the sequential gate helper", () => {
    const filePath = path.resolve(
      import.meta.dirname,
      "../marketplaceAutoReviewService.ts",
    );
    const content = fs.readFileSync(filePath, "utf-8");
    const body = extractFunctionBody(
      content,
      /export async function startMarketplaceAutoReviewRun\(/,
    );
    expect(body).toContain("assertMarketplaceSequentialStoryboardAllowed(");
  });

  it("startAutoStoryboardReviewForApi calls the sequential gate helper", () => {
    const filePath = path.resolve(
      import.meta.dirname,
      "../hyperframesRuntimeApiService.ts",
    );
    const content = fs.readFileSync(filePath, "utf-8");
    const body = extractFunctionBody(
      content,
      /export async function startAutoStoryboardReviewForApi\(/,
    );
    expect(body).toContain("assertMarketplaceSequentialStoryboardAllowed(");
  });
});

describe("Feature 136 — plan-service sanitize + warn (buildHyperframesAutoPlanFromState)", () => {
  it("strips a flag-off sequential override, warns (not blocks), and keeps the plan startable as 3x3", () => {
    const plan = buildHyperframesAutoPlanFromState({
      auth: FIXED_AUTH,
      productId: "product_1",
      productBundle: FIXED_PRODUCT_BUNDLE,
      activeRun: null,
      access: permissiveAccess(),
      overrides: { frameStrategy: "sequential_shot_storyboard" },
      sequentialStoryboardEnabled: false,
      now: FIXED_NOW,
    } as any);

    expect(plan.defaults.frameStrategy).toBe("storyboard_3x3_split");
    expect(
      plan.warnings.some(
        (warning) => warning.code === "sequential_storyboard_disabled",
      ),
    ).toBe(true);
    expect(
      plan.blockers.some(
        (blocker) => blocker.code === "sequential_storyboard_disabled",
      ),
    ).toBe(false);
    expect(plan.canStart).toBe(true);
  });

  it("keeps the sequential override when the flag is on, with no disabled warning", () => {
    const plan = buildHyperframesAutoPlanFromState({
      auth: FIXED_AUTH,
      productId: "product_1",
      productBundle: FIXED_PRODUCT_BUNDLE,
      activeRun: null,
      access: permissiveAccess(),
      overrides: { frameStrategy: "sequential_shot_storyboard" },
      sequentialStoryboardEnabled: true,
      now: FIXED_NOW,
    } as any);

    expect(plan.defaults.frameStrategy).toBe("sequential_shot_storyboard");
    expect(
      plan.warnings.some(
        (warning) => warning.code === "sequential_storyboard_disabled",
      ),
    ).toBe(false);
  });

  it("leaves the dark path (no overrides, flag off) byte-identical to the call without the new input field", () => {
    const access = permissiveAccess();
    const withField = buildHyperframesAutoPlanFromState({
      auth: FIXED_AUTH,
      productId: "product_1",
      productBundle: FIXED_PRODUCT_BUNDLE,
      activeRun: null,
      access,
      sequentialStoryboardEnabled: false,
      now: FIXED_NOW,
    } as any);
    const withoutField = buildHyperframesAutoPlanFromState({
      auth: FIXED_AUTH,
      productId: "product_1",
      productBundle: FIXED_PRODUCT_BUNDLE,
      activeRun: null,
      access,
      now: FIXED_NOW,
    });

    expect(withField).toEqual(withoutField);
    expect(withField.defaults.frameStrategy).toBe("storyboard_3x3_split");
  });
});
