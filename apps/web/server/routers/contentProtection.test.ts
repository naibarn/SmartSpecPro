import { describe, expect, it } from "vitest";
import {
  contentProtectionRouter,
  contentProtectionModalitySchema,
  protectAssetInputSchema,
  verifyCopyInputSchema,
} from "./contentProtection";

describe("content protection router contract", () => {
  it("exposes the dashboard/workspace operations", () => {
    const procedures = Object.keys(contentProtectionRouter._def.procedures);
    expect(procedures).toEqual(expect.arrayContaining([
      "overview",
      "listAssets",
      "getAsset",
      "protectAsset",
      "verifyCopy",
      "getVerification",
      "getSettings",
      "setDefaultChoice",
    ]));
  });

  it("bounds modality and rejects tenant authority in transport input", () => {
    expect(contentProtectionModalitySchema.safeParse("image").success).toBe(true);
    expect(contentProtectionModalitySchema.safeParse("document").success).toBe(false);
    expect(protectAssetInputSchema.safeParse({
      sourceAssetId: 1,
      modality: "image",
      idempotencyKey: "protect-201-1",
      tenantId: "attacker-tenant",
    }).success).toBe(false);
  });

  it("requires a bounded library asset reference for verification", () => {
    expect(verifyCopyInputSchema.safeParse({ modality: "video", sourceAssetId: 1 }).success).toBe(true);
    expect(verifyCopyInputSchema.safeParse({ modality: "video", sourceAssetId: -1 }).success).toBe(false);
    expect(verifyCopyInputSchema.safeParse({ modality: "video", storageKey: "../../etc/passwd" }).success).toBe(false);
  });
});
