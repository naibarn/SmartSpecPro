/**
 * Feature 136 (Marketplace Auto Review: Sequential Shot Storyboard) — section
 * 02 §4.1. Pure module tests for the fail-closed "@ImageN ↔ role" mapping
 * validator. No mocks — `referenceIndexMap.ts` has no I/O.
 */
import { describe, expect, it } from "vitest";

import {
  buildReferenceIndexMappingCorrectionDirective,
  findReferenceIndexMappingMismatches,
  type ReferenceIndexEntry,
} from "../referenceIndexMap";

describe("findReferenceIndexMappingMismatches", () => {
  it("detects an explicit contradictory @ImageN role claim", () => {
    const manifest: ReferenceIndexEntry[] = [
      { index: 1, role: "primary_product" },
      { index: 2, role: "product_angle", angleLabel: "back" },
      { index: 3, role: "character" },
    ];
    const prompt = "@Image3 = product back angle.";

    const mismatches = findReferenceIndexMappingMismatches(prompt, manifest);

    expect(mismatches).toEqual([
      {
        imageIndex: 3,
        claimedRole: "product_angle:back",
        expectedRole: "character",
        expectedAngleLabel: undefined,
      },
    ]);
  });

  it("is lenient on silence — a prompt with no explicit @ImageN claim never mismatches", () => {
    const manifest: ReferenceIndexEntry[] = [
      { index: 1, role: "primary_product" },
      { index: 2, role: "product_angle", angleLabel: "back" },
      { index: 3, role: "character" },
    ];
    const prompt =
      "หน้ากล่องสวยงาม สินค้าดูพรีเมียม เหมาะสำหรับของขวัญ ไม่มีการอ้างอิงตำแหน่งรูปใด ๆ ในพรอมป์นี้";

    expect(findReferenceIndexMappingMismatches(prompt, manifest)).toEqual([]);
  });

  it("produces no mismatch when explicit claims are consistent with the manifest", () => {
    const manifest: ReferenceIndexEntry[] = [
      { index: 1, role: "primary_product" },
      { index: 2, role: "product_angle", angleLabel: "back" },
    ];
    const prompt = "@Image1 = primary product identity. @Image2 = product back angle.";

    expect(findReferenceIndexMappingMismatches(prompt, manifest)).toEqual([]);
  });

  it("reports only the contradictory claim among mixed consistent/contradictory claims, deduped", () => {
    const manifest: ReferenceIndexEntry[] = [
      { index: 1, role: "primary_product" },
      { index: 2, role: "product_angle", angleLabel: "side" },
    ];
    const prompt =
      "@Image1 = primary product identity. @Image2 = product back angle. @Image2 = product back angle.";

    const mismatches = findReferenceIndexMappingMismatches(prompt, manifest);

    expect(mismatches).toEqual([
      {
        imageIndex: 2,
        claimedRole: "product_angle:back",
        expectedRole: "product_angle",
        expectedAngleLabel: "side",
      },
    ]);
  });

  it("validates against the manifest entry's own 1-based index, not array position", () => {
    const manifest: ReferenceIndexEntry[] = [
      { index: 1, role: "character" },
      { index: 2, role: "environment" },
    ];
    // A 0-based-array-position bug would look up array slot 1 (role:
    // "environment") for this claim instead of the entry whose `.index` is 1
    // (role: "character"), and would wrongly report a mismatch.
    const prompt = "@Image1 = guardian presenter.";

    expect(findReferenceIndexMappingMismatches(prompt, manifest)).toEqual([]);
  });

  it("reports an explicit claim about an index absent from the manifest as unconditionally wrong (not silence)", () => {
    const manifest: ReferenceIndexEntry[] = [{ index: 1, role: "primary_product" }];
    const prompt = "@Image9 = product back angle.";

    expect(findReferenceIndexMappingMismatches(prompt, manifest)).toEqual([
      { imageIndex: 9, claimedRole: "product_angle:back", expectedRole: "not_attached" },
    ]);
  });

  it("catches manifest drift — a claim consistent with an earlier manifest mismatches once the live manifest no longer has that index", () => {
    const manifestA: ReferenceIndexEntry[] = [
      { index: 1, role: "primary_product" },
      { index: 2, role: "product_angle", angleLabel: "back" },
      { index: 3, role: "environment" },
      { index: 4, role: "character" },
    ];
    // Live manifest at submit time: environment dropped, guardian now at 3.
    const manifestB: ReferenceIndexEntry[] = [
      { index: 1, role: "primary_product" },
      { index: 2, role: "product_angle", angleLabel: "back" },
      { index: 3, role: "character" },
    ];
    const prompt = "@Image4 = guardian presenter.";

    expect(findReferenceIndexMappingMismatches(prompt, manifestA)).toEqual([]);
    expect(findReferenceIndexMappingMismatches(prompt, manifestB)).toEqual([
      { imageIndex: 4, claimedRole: "character", expectedRole: "not_attached" },
    ]);
  });
});

describe("buildReferenceIndexMappingCorrectionDirective", () => {
  it("is deterministic for identical input and names every mismatched index with its TRUE role/angleLabel", () => {
    const manifest: ReferenceIndexEntry[] = [
      { index: 1, role: "primary_product" },
      { index: 2, role: "product_angle", angleLabel: "back" },
      { index: 3, role: "character" },
    ];
    const mismatches = findReferenceIndexMappingMismatches(
      "@Image3 = product back angle.",
      manifest,
    );
    expect(mismatches.length).toBe(1);

    const first = buildReferenceIndexMappingCorrectionDirective(mismatches, manifest);
    const second = buildReferenceIndexMappingCorrectionDirective(mismatches, manifest);

    expect(first).toBe(second);
    expect(first).toContain("@Image3");
    expect(first).toContain("adult guardian");
  });

  it("returns an empty string when there are no mismatches", () => {
    expect(buildReferenceIndexMappingCorrectionDirective([], [])).toBe("");
  });
});
