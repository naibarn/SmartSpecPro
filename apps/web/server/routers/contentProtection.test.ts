import { describe, expect, it } from "vitest";
import {
  contentProtectionRouter,
  contentProtectionModalitySchema,
  protectAssetInputSchema,
  resolveRightsHolderSnapshot,
  rightsClaimInputSchema,
  safeAssetView,
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
      "getCase",
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

  it("returns only the opaque public asset identifier to clients", () => {
    const view = safeAssetView({
      id: "11111111-1111-4111-8111-111111111111",
      publicAssetId: "22222222-2222-4222-8222-222222222222",
      modality: "video",
      status: "PROTECTED",
      watermarkChoice: "on",
      choiceSource: "per_export",
      mimeType: "video/mp4",
      width: null,
      height: null,
      durationMs: 1000,
      fps: 30,
      sourceSha256: "a".repeat(64),
      protectedSha256: "b".repeat(64),
      sourceVersionId: null,
      compoundArtifactId: null,
      compoundPlanDigest: null,
      causalJobId: null,
      firstObservedAt: new Date(0),
      claimedCreationAt: null,
      trustedTimestampAt: null,
      publishedAt: null,
      protectedAt: new Date(0),
      errorCode: null,
      errorMessage: null,
      createdAt: new Date(0),
    } as any);
    expect(view.publicAssetId).toBe("22222222-2222-4222-8222-222222222222");
    expect(view).not.toHaveProperty("id");
  });

  it("uses the Settings ownership profile as the rights claim source", () => {
    expect(resolveRightsHolderSnapshot({
      displayName: "  Nopporn  ",
      legalName: "Legal Name",
      contactEmail: "owner@example.com",
    })).toEqual({ displayName: "Nopporn", contactEmail: "owner@example.com" });
    expect(resolveRightsHolderSnapshot({ displayName: "", legalName: "" })).toBeNull();
    expect(rightsClaimInputSchema.safeParse({
      assetId: "11111111-1111-4111-8111-111111111111",
      claimType: "creator",
      legalDeclarationConfirmed: true,
      displayName: "duplicate-input",
    }).success).toBe(false);
  });
});
