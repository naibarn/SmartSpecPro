/**
 * Feature 136 (Marketplace Auto Review: Sequential Shot Storyboard) — section
 * 01 byte-identical baseline suite. Spec:
 * specs/feature/136-marketplace-auto-review-sequential-shot-storyboard/
 * sections/section-01-flags-and-schemas.md §4.5.
 *
 * RULE: baselines here are committed from PRE-CHANGE code and are never
 * regenerated (`-u` is forbidden) for the remainder of Feature 136. A diff
 * against a committed baseline file in any later section is a REGRESSION,
 * not a snapshot refresh. This suite is the standing regression tripwire for
 * every one of the 12 Feature 136 sections.
 *
 * Both tenant flags (`marketplaceSequentialStoryboard`,
 * `marketplaceReviewEvidenceGuard`) are OFF everywhere in this file — these
 * snapshots exist to prove existing (auto / storyboard_3x3_split /
 * video_shot_start_stop) behavior never changes one byte as Feature 136 is
 * built out behind its flags.
 *
 * NOTE on `shotFramePrompt` baseline: `buildMarketplaceAutoReviewShotFramePromptForTest`
 * is a NEW test-only export added by this section (§5.6) — it cannot have
 * been captured against code that predates its own existence. Its baseline
 * was generated immediately upon adding the export (before any other
 * production edit in this section could touch prompt text), so it is still a
 * faithful snapshot of the pre-existing, unmodified `buildShotFramePrompt`
 * private function output. See section-01 implementation report for details.
 */
import fs from "fs";
import path from "path";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../db", () => ({
  getDb: vi.fn(async () => null),
}));

import {
  buildMarketplaceAutoReview3x3StoryboardPromptForTest,
  buildMarketplaceAutoReviewShotFramePromptForTest,
} from "../marketplaceAutoReviewService";
import { buildHyperframesAutoPlanFromState } from "../hyperframesAutoPlanService";
import { resolveHyperframesFeatureAccess } from "../hyperframesFeatureAccessService";

const FIXED_NOW = new Date("2026-01-01T00:00:00.000Z");
const FIXED_AUTH = { userId: 1, tenantId: "tenant_1" } as const;

// Cloned from `basePlan` / `baseShot` fixture conventions in
// server/services/__tests__/marketplaceAutoReviewService.test.ts (verified
// on disk at the time of writing; that file's own copy is the source of
// truth for the shot/plan shape).
const basePlan = {
  conceptId: "concept-1",
  title: "รีวิวสินค้า",
  productTruth: {
    productId: "mp_1",
    productName: "Greenforst โต๊ะวางของข้างเตียง",
    brand: "Greenforst",
    platform: "shopee",
    externalProductId: "2162",
    externalShopId: "seller-1",
    productCategory: "furniture",
    categoryText: "เฟอร์นิเจอร์",
    categoryPath: ["บ้านและไลฟ์สไตล์", "เฟอร์นิเจอร์"],
    sourceUrl: "https://example.com/product",
    affiliateUrl: null,
    shopName: null,
    price: null,
    rating: null,
    sold: null,
    reviews: null,
    description: "",
    specs: {},
    imageUrls: ["https://example.com/product.png"],
  },
  storyboardGuide: "Shot-by-shot storyboard guide",
  voiceoverScript: "VOICEOVER SCRIPT BY SHOT",
  productDetail:
    "PRODUCT FACTS LOCK: Greenforst โต๊ะวางของข้างเตียง. Do not alter shape, material, or shelf count.",
  shots: [],
};

const baseShot = {
  id: "shot-1",
  order: 1,
  title: "เปิดปัญหา",
  startSeconds: 0,
  endSeconds: 8,
  durationSeconds: 8,
  storyboardGuide: "1. 0-8s เปิดปัญหา / มุมกล้อง: slow push-in",
  voiceover: "สั้นมาก",
  camera: "slow push-in",
  visual: "เห็นมุมข้างเตียงก่อนจัดของ",
  movement: "slow push-in",
  productRole: "context first",
};

const fixedPlan = { ...basePlan, shots: [baseShot] } as any;

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

describe("Feature 136 section 01 — byte-identical baselines (both flags off)", () => {
  it("keeps getAutoStoryboardReviewPlan (buildHyperframesAutoPlanFromState) shape byte-identical", async () => {
    const plan = buildHyperframesAutoPlanFromState({
      auth: FIXED_AUTH,
      productId: "product_1",
      productBundle: { images: ["https://example.com/product.png"] },
      activeRun: null,
      access: permissiveAccess(),
      now: FIXED_NOW,
    });

    await expect(JSON.stringify(plan, null, 2)).toMatchFileSnapshot(
      "__snapshots__/feature136/getAutoStoryboardReviewPlan.baseline.json",
    );
  });

  it("keeps the 3x3 storyboard prompt byte-identical (no_text overlay)", async () => {
    const prompt = buildMarketplaceAutoReview3x3StoryboardPromptForTest({
      plan: fixedPlan,
      overlayTextMode: "no_text",
    });

    await expect(prompt).toMatchFileSnapshot(
      "__snapshots__/feature136/storyboard3x3Prompt.no_text.baseline.txt",
    );
  });

  it("keeps the 3x3 storyboard prompt byte-identical (allow_text overlay)", async () => {
    const prompt = buildMarketplaceAutoReview3x3StoryboardPromptForTest({
      plan: fixedPlan,
      overlayTextMode: "allow_text",
    });

    await expect(prompt).toMatchFileSnapshot(
      "__snapshots__/feature136/storyboard3x3Prompt.allow_text.baseline.txt",
    );
  });

  it("keeps the shot start-frame prompt byte-identical (no_text overlay)", async () => {
    const prompt = buildMarketplaceAutoReviewShotFramePromptForTest({
      plan: fixedPlan,
      shot: baseShot,
      role: "start",
      overlayTextMode: "no_text",
    });

    await expect(prompt).toMatchFileSnapshot(
      "__snapshots__/feature136/shotFramePrompt.start.no_text.baseline.txt",
    );
  });
});

/**
 * Feature 136 section 07 (§4 test 4) — the section's tripwire: the
 * diff-shape snapshot. Guard flag alone (sequential flag stays off), fixed
 * WS-1 fixture => the guarded 3x3 prompt must differ from the committed
 * baseline ONLY by inserted lines matching the enumerated allowed marker
 * prefixes (zero removed, zero reordered). Guard off (including the new
 * optional `guard` param explicitly passed as `undefined`) must stay
 * byte-identical to the same committed baseline `toMatchFileSnapshot`
 * already pins above. `-u` is forbidden for this file (see header rule).
 */
describe("Feature 136 section 07 — evidence guard diff-shape snapshot (3x3, sequential flag off)", () => {
  const guardOn = {
    enabled: true,
    productChildRelated: true,
    childDepictionPlanned: null,
    assemblyDocumented: false,
    blockedClaims: [],
    conflictExclusions: [],
    guardianReferenceIndex: null,
  } as any;

  // NOTE: `build3x3StoryboardPrompt`'s own return value ends with a trailing
  // "\n" (its array's last element is the empty-string repairInstruction
  // slot, so `.join("\n")` leaves a trailing separator before it) and the
  // committed baseline file was captured from that exact value, so it also
  // ends with exactly one trailing "\n" on disk. Read it byte-for-byte —
  // do NOT strip the trailing newline, or the two sides stop lining up.
  function readBaseline(): string {
    const baselinePath = path.resolve(
      import.meta.dirname,
      "__snapshots__/feature136/storyboard3x3Prompt.no_text.baseline.txt",
    );
    return fs.readFileSync(baselinePath, "utf-8");
  }

  it("guard off (explicit undefined): byte-identical to the committed baseline", () => {
    const prompt = buildMarketplaceAutoReview3x3StoryboardPromptForTest({
      plan: fixedPlan,
      overlayTextMode: "no_text",
      guard: undefined,
    } as any);
    expect(prompt).toBe(readBaseline());
  });

  it("guard on: differs from baseline ONLY by enumerated allowed lines (zero removed, zero reordered)", () => {
    const baseline = readBaseline();
    const guarded = buildMarketplaceAutoReview3x3StoryboardPromptForTest({
      plan: fixedPlan,
      overlayTextMode: "no_text",
      guard: guardOn,
    } as any);

    const baselineLines = baseline.split("\n");
    const guardedLines = guarded.split("\n");

    // Zero removed / zero reordered: every baseline line must survive, in
    // the same relative order, inside the guarded output.
    let cursor = 0;
    for (const line of baselineLines) {
      const idx = guardedLines.indexOf(line, cursor);
      expect(
        idx,
        `expected baseline line to survive in order: ${JSON.stringify(line)}`,
      ).toBeGreaterThanOrEqual(cursor);
      cursor = idx + 1;
    }

    // Every remaining (added) line must match the enumerated allowed set.
    const baselineCounts = new Map<string, number>();
    for (const line of baselineLines) {
      baselineCounts.set(line, (baselineCounts.get(line) ?? 0) + 1);
    }
    const consumed = new Map<string, number>();
    const addedLines: string[] = [];
    for (const line of guardedLines) {
      const total = baselineCounts.get(line) ?? 0;
      const used = consumed.get(line) ?? 0;
      if (used < total) {
        consumed.set(line, used + 1);
      } else {
        addedLines.push(line);
      }
    }
    expect(addedLines.length).toBeGreaterThan(0);
    for (const line of addedLines) {
      const allowed =
        line.startsWith("GUARDIAN PRESENCE LOCK:") ||
        line.startsWith("DEMONSTRATION EVIDENCE LOCK:") ||
        line.startsWith("CLAIM SAFETY EXCLUSIONS:");
      expect(allowed, `unexpected added line: ${JSON.stringify(line)}`).toBe(
        true,
      );
    }
  });
});
